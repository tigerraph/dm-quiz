#!/usr/bin/env node
/*
 * Local stand-in for the three PostgREST tables dm-quiz uses, plus static
 * file serving from the repo root so there is no CORS in the way.
 *
 * It exists so the live, host-driven mode can be developed and tested
 * without a Supabase project — point src/config.json at this server:
 *
 *   { "supabaseUrl": "http://localhost:4173", "supabaseAnonKey": "mock" }
 *
 * then `npm run build` and open
 *   http://localhost:4173/?session=gewaltenteilung-ch&host=1   (beamer)
 *   http://localhost:4173/?session=gewaltenteilung-ch          (a phone)
 *
 * Data lives in memory only. Two extra routes help while testing:
 *   GET /__dump    the whole database as JSON
 *   GET /__reset   empty every table
 *
 * Access follows docs/supabase-migration-005.sql: anon cannot list dm_players,
 * dm_answers or dm_stars and reads through the rpc/ functions; a logged-in admin
 * reads everything. Flag an admin with GET /__admin?email=… after signing up.
 * `--legacy` serves the schema before 005 instead (no rpc/, no dm_admins, anon
 * reads every table), which is what the client's fallback path is tested against.
 *
 * Development only. Never deploy this, and remember to put the real
 * Supabase URL and anon key back in src/config.json before committing.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv.slice(2).find(a => /^\d+$/.test(a)) || process.env.PORT || 4173);
const LEGACY = process.argv.includes("--legacy");
const admins = new Set();      // user ids in dm_admins

const db = { dm_state: [], dm_players: [], dm_answers: [], dm_kicks: [],
             dm_stars: [], dm_token_links: [], dm_identities: [] };
let seq = 0;

const MIME = { ".html":"text/html", ".json":"application/json", ".js":"text/javascript",
               ".woff2":"font/woff2", ".css":"text/css", ".svg":"image/svg+xml",
               ".png":"image/png", ".jpg":"image/jpeg" };

// PostgREST filters: "col=eq.value" and "col=in.(a,b)" are the two operators
// this app uses.
const eqVal = v => (v.startsWith("eq.") ? decodeURIComponent(v.slice(3)) : null);
const inVals = v => (v.startsWith("in.(") && v.endsWith(")")
  ? v.slice(4, -1).split(",").map(decodeURIComponent) : null);

function query(table, sp) {
  let rows = db[table].slice();
  for (const [k, v] of sp.entries()) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    const want = eqVal(v);
    if (want !== null) rows = rows.filter(r => String(r[k]) === want);
    const set = inVals(v);
    if (set) rows = rows.filter(r => set.includes(String(r[k])));
  }
  const order = sp.get("order");
  if (order) {
    const [col, dir] = order.split(".");
    const sign = dir === "desc" ? -1 : 1;
    rows.sort((a, b) =>
      (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : a._seq - b._seq) * sign);
  }
  const limit = sp.get("limit");
  if (limit) rows = rows.slice(0, +limit);
  const sel = sp.get("select");
  if (sel && sel !== "*") {
    const cols = sel.split(",");
    rows = rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])));
  }
  return rows;
}

// mirrors the unique constraints in docs/supabase.sql
const UNIQUE = {
  dm_players: ["session", "token", "round"],
  dm_answers: ["session", "token", "round", "q_index"],
  dm_kicks:   ["session", "token"],
  dm_stars:   ["session", "token"],
  dm_token_links: ["token_a", "token_b"],
};

// ------------------------- mock GoTrue (email+password) + edge function ---
const authUsers = new Map();   // email -> {id, email, password}
const sessions  = new Map();   // access/refresh token -> user id
function authSession(u) {
  const at = "at-" + ++seq, rt = "rt-" + ++seq;
  sessions.set(at, u.id); sessions.set(rt, u.id);
  return { access_token: at, refresh_token: rt, token_type: "bearer",
           user: { id: u.id, email: u.email } };
}
function bearerUser(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  const uid = m && sessions.get(m[1]);
  return uid ? [...authUsers.values()].find(u => u.id === uid) : null;
}
const isAdmin = req => { const u = bearerUser(req); return !!(u && admins.has(u.id)); };
const NAMED = ["dm_players", "dm_answers", "dm_stars"];   // anon-unreadable after 005

// the functions of migration 005, same arguments and columns
const RPC = {
  dm_roster: a => db.dm_players.filter(r => r.session === a.p_session && r.round === a.p_round)
    .sort((x, y) => x._seq - y._seq).slice(0, 200).map(r => ({ token: r.token, name: r.name })),
  dm_round_answers: a => db.dm_answers.filter(r => r.session === a.p_session && r.round === a.p_round)
    .slice(0, 2000).map(({ token, name, q_index, choice, correct, points }) => ({ token, name, q_index, choice, correct, points })),
  dm_session_stars: a => db.dm_stars.filter(r => r.session === a.p_session)
    .sort((x, y) => x._seq - y._seq).slice(0, 500).map(r => ({ token: r.token, name: r.name })),
  dm_stars_for_tokens: a => db.dm_stars.filter(r => (a.p_tokens || []).slice(0, 500).includes(r.token))
    .map(({ id, token, pillar, topic, session, awarded_on, source }) => ({ id, token, pillar, topic, session, awarded_on, source })),
  dm_rescue_tokens: a => !a.p_fp ? [] : [...new Set(db.dm_players
    .filter(r => r.name === a.p_name && r.fp === a.p_fp).map(r => r.token))].map(token => ({ token })),
};

async function readJson(req) {
  let b = ""; for await (const c of req) b += c;
  try { return JSON.parse(b); } catch { return {}; }
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  res.setHeader("Date", new Date().toUTCString());

  if (url.pathname.startsWith("/auth/v1/")) {
    const ep = url.pathname.slice("/auth/v1/".length);
    const body = req.method === "GET" ? {} : await readJson(req);
    res.setHeader("Content-Type", "application/json");
    if (ep === "signup" && req.method === "POST") {
      if (authUsers.has(body.email)) return void res.writeHead(422).end('{"msg":"exists"}');
      const u = { id: "u" + ++seq, email: body.email, password: body.password };
      authUsers.set(u.email, u);
      return void res.writeHead(200).end(JSON.stringify(authSession(u)));
    }
    if (ep === "token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        const u = authUsers.get(body.email);
        if (!u || u.password !== body.password)
          return void res.writeHead(400).end('{"error":"invalid_grant"}');
        return void res.writeHead(200).end(JSON.stringify(authSession(u)));
      }
      if (grant === "refresh_token") {
        const uid = sessions.get(body.refresh_token);
        const u = uid && [...authUsers.values()].find(x => x.id === uid);
        if (!u) return void res.writeHead(400).end('{"error":"invalid_grant"}');
        return void res.writeHead(200).end(JSON.stringify(authSession(u)));
      }
    }
    if (ep === "user" && req.method === "PUT") {
      const u = bearerUser(req);
      if (!u) return void res.writeHead(401).end('{"msg":"no"}');
      if (body.password) u.password = body.password;
      return void res.writeHead(200).end(JSON.stringify({ id: u.id, email: u.email }));
    }
    if (ep === "logout" && req.method === "POST") return void res.writeHead(204).end();
    return void res.writeHead(404).end('{"msg":"unknown auth endpoint"}');
  }

  if (url.pathname === "/functions/v1/delete-account" && req.method === "POST") {
    const u = bearerUser(req);
    if (!u) return void res.writeHead(401).end("unauthorized");
    db.dm_identities = db.dm_identities.filter(r => r.user_id !== u.id);
    authUsers.delete(u.email);
    return void res.writeHead(200).end("ok");
  }

  // like PostgREST: a bearer that is neither the anon key nor a live session is an expired JWT
  const bearer = (/^Bearer (.+)$/.exec(req.headers.authorization || "") || [])[1];
  if (url.pathname.startsWith("/rest/v1/") && bearer && bearer !== "mock" && !sessions.has(bearer))
    return void res.writeHead(401, { "Content-Type": "application/json" }).end('{"code":"PGRST301","message":"JWT expired"}');

  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const fn = RPC[url.pathname.slice("/rest/v1/rpc/".length)];
    if (LEGACY || !fn || req.method !== "POST")
      return void res.writeHead(404, { "Content-Type": "application/json" }).end('{"code":"PGRST202"}');
    res.writeHead(200, { "Content-Type": "application/json" });
    return void res.end(JSON.stringify(fn(await readJson(req))));
  }

  if (url.pathname === "/rest/v1/dm_admins") {
    if (LEGACY) return void res.writeHead(404, { "Content-Type": "application/json" }).end('{"code":"42P01"}');
    const u = bearerUser(req);
    res.writeHead(200, { "Content-Type": "application/json" });
    return void res.end(JSON.stringify(u && admins.has(u.id) ? [{ user_id: u.id }] : []));
  }

  if (url.pathname.startsWith("/rest/v1/")) {
    const table = url.pathname.slice("/rest/v1/".length);
    if (!db[table]) return void res.writeHead(404).end("no such table");

    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      const hidden = !LEGACY && NAMED.includes(table) && !isAdmin(req);
      return void res.end(JSON.stringify(hidden ? [] : query(table, url.searchParams)));
    }
    if (req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const row = JSON.parse(body);
      // 005: anon may claim a session star; a manual star needs an admin
      if (!LEGACY && table === "dm_stars" && !isAdmin(req) && (row.source === "manual" || row.session == null))
        return void res.writeHead(403, { "Content-Type": "application/json" })
          .end('{"code":"42501","message":"new row violates row-level security policy"}');
      const uq = UNIQUE[table];
      // like Postgres, a NULL never collides with anything
      if (uq && db[table].some(r => uq.every(k =>
            row[k] != null && r[k] != null && String(r[k]) === String(row[k])))) {
        res.writeHead(409, { "Content-Type": "application/json" });
        return void res.end(JSON.stringify({ code: "23505", message: "duplicate key" }));
      }
      const now = new Date().toISOString();
      db[table].push({ id: "id" + ++seq, _seq: seq, round: 0,
                       started_at: now, joined_at: now, created_at: now,
                       awarded_on: now.slice(0, 10), ...row });
      return void res.writeHead(201).end();
    }
    return void res.writeHead(405).end();
  }

  if (url.pathname === "/__admin") {
    const u = authUsers.get(url.searchParams.get("email") || "");
    if (!u) return void res.writeHead(404).end("no such user: sign up first");
    admins.add(u.id);
    return void res.writeHead(200).end("ok");
  }
  if (url.pathname === "/__reset") {
    for (const k of Object.keys(db)) db[k] = [];
    return void res.writeHead(200).end("ok");
  }
  if (url.pathname === "/__dump") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return void res.end(JSON.stringify(db, null, 1));
  }

  const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname)
    .replace(/^(\.\.[/\\])+/, "");
  try {
    const buf = await readFile(join(ROOT, rel));
    res.writeHead(200, { "Content-Type": MIME[extname(rel)] || "application/octet-stream",
                         "Cache-Control": "no-store" });
    res.end(buf);
  } catch { res.writeHead(404).end("not found"); }
}).listen(PORT, () => {
  console.log(`mock supabase + static files on http://localhost:${PORT}`);
  console.log(`  beamer  http://localhost:${PORT}/?session=gewaltenteilung-ch&host=1`);
  console.log(`  phone   http://localhost:${PORT}/?session=gewaltenteilung-ch`);
});
