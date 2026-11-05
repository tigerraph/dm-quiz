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
 * Schemas, like PostgREST (docs/supabase-migration-006-dm-schema.sql): a request
 * picks its schema with Accept-Profile (GET) or Content-Profile (POST); without
 * one it gets the first exposed schema, public. A profile that is not exposed
 * gets 406 PGRST106; a table or function outside the schema that holds DM gets
 * 404. By default DM sits in «dm» and public,noeggi,dm are exposed (after 006).
 *   --schemas public,noeggi      exposed schemas (before 006: dm not exposed)
 *   --tables-in public           where DM's tables are (before 006; also --legacy)
 *   --self                       serve index.html pointed at this mock (URL + key
 *                                "mock"), so the committed build can be tested
 *                                without editing src/config.json
 * GET /__log lists every REST request with its profile and status.
 * GET /__mail lists the reset, sign-in and invite mails the real project would send, with their links.
 *
 * People page (docs/supabase-migration-007-people.sql): dm_admins rows carry a role,
 * 'admin' or 'moderator'. GET /__admin?email=…&role=admin flags the admin (default:
 * moderator, which is what every dm_admins row was before 007). The rpc/ functions
 * dm_people, dm_set_moderator, dm_invite_moderator, dm_cancel_invite and
 * dm_claim_invite check the caller like the SQL does and answer 403 (42501) when
 * it is not the admin. Sessions carry the amr and session id GoTrue puts in the
 * JWT: a password login is «password», the link in a mail «magiclink» or «recovery».
 *   --no-007                     before 007: those functions answer 404 PGRST202
 * GET /__users lists the accounts with their open sessions; GET /__invites the open invites.
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
const SELF = process.argv.includes("--self");
const arg = (name, dflt) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : dflt; };
const EXPOSED = arg("--schemas", LEGACY ? "public,noeggi" : "public,noeggi,dm").split(",");
const TABLES_IN = arg("--tables-in", LEGACY ? "public" : "dm");
const NO007 = process.argv.includes("--no-007");
const restLog = [];
const admins = new Map();      // user id -> {role, added_at, added_by}: the rows of dm_admins
const invites = new Map();     // email -> {invited_by, invited_at}: dm_invites (007)

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
const sessMeta  = new Map();   // access/refresh token -> {sid, amr}: the session's JWT claims
/* mail the real project would send (password reset, sign-in link): kept here instead,
   GET /__mail lists it, so the flows can be tested end to end without an inbox */
const outbox = [];
const links  = new Map();      // one-time token -> {uid, type, redirect}
const sends  = new Map();      // email -> send times, for the 429 a real project returns
function mailLink(u, type, redirect) {
  const tok = type.slice(0, 1) + "-" + ++seq;
  links.set(tok, { uid: u.id, type, redirect });
  const link = `http://localhost:${PORT}/auth/v1/verify?token=${tok}&type=${type}&redirect_to=${encodeURIComponent(redirect)}`;
  outbox.push({ to: u.email, type, link, at: new Date().toISOString() });
}
function tooMany(email) {
  const now = Date.now(), t = (sends.get(email) || []).filter(x => now - x < 60000);
  t.push(now); sends.set(email, t);
  return t.length > 3;           // more than 3 mails a minute to one address
}
function authSession(u, amr = "password", sid = "sess-" + ++seq) {
  const at = "at-" + ++seq, rt = "rt-" + ++seq;
  sessions.set(at, u.id); sessions.set(rt, u.id);
  sessMeta.set(at, { sid, amr }); sessMeta.set(rt, { sid, amr });
  u.last_sign_in_at = new Date().toISOString();
  return { access_token: at, refresh_token: rt, token_type: "bearer",
           user: { id: u.id, email: u.email } };
}
function bearerUser(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  const uid = m && sessions.get(m[1]);
  return uid ? [...authUsers.values()].find(u => u.id === uid) : null;
}
const bearerMeta = req => sessMeta.get((/^Bearer (.+)$/.exec(req.headers.authorization || "") || [])[1]) || null;
const isAdmin = req => { const u = bearerUser(req); return !!(u && admins.has(u.id)); };
const isPeopleAdmin = req => { const u = bearerUser(req); return !!(u && admins.get(u.id)?.role === "admin"); };
// a refusal the way PostgREST reports a raised exception
class Refused extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const onlyAdmin = (req, what) => {
  if (!bearerUser(req)) throw new Refused(401, "42501", "permission denied for function " + what);
  if (!isPeopleAdmin(req)) throw new Refused(403, "42501", "only the admin can " + what);
};
const userById = id => [...authUsers.values()].find(u => u.id === id);
const userByEmail = e => [...authUsers.values()].find(u => u.email.toLowerCase() === e);
const EMAIL_OK = e => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
const freshInvite = e => { const i = invites.get(e); return i && Date.now() - Date.parse(i.invited_at) < 14 * 864e5; };
const liveSids = uid => new Set([...sessions].filter(([, id]) => id === uid).map(([t]) => sessMeta.get(t)?.sid));
function latestName(uid) {
  const toks = new Set(db.dm_identities.filter(r => r.user_id === uid).map(r => r.token));
  for (const l of db.dm_token_links) if (toks.has(l.token_a)) toks.add(l.token_b);
  const p = db.dm_players.filter(r => toks.has(r.token)).sort((a, b) => (a.joined_at < b.joined_at ? 1 : -1))[0];
  return p ? p.name : null;
}
// the functions of migration 007: same arguments, columns and refusals
const PEOPLE = {
  dm_people: (a, req) => {
    onlyAdmin(req, "see this list");
    const me = bearerUser(req);
    const rows = [...authUsers.values()]
      .filter(u => admins.has(u.id) || invites.has(u.email.toLowerCase()) || db.dm_identities.some(r => r.user_id === u.id))
      .map(u => ({ user_id: u.id, email: u.email, name: latestName(u.id), role: admins.get(u.id)?.role || null,
        moderator_since: admins.get(u.id)?.added_at || null, account_since: u.created_at, last_seen: u.last_sign_in_at || null,
        invited_at: invites.get(u.email.toLowerCase())?.invited_at || null, is_me: u.id === me.id }));
    for (const [email, i] of invites) if (!userByEmail(email))
      rows.push({ user_id: null, email, name: null, role: null, moderator_since: null, account_since: null,
        last_seen: null, invited_at: i.invited_at, is_me: false });
    return rows;
  },
  dm_set_moderator: (a, req) => {
    onlyAdmin(req, "change moderators");
    if (!a.p_user || typeof a.p_on !== "boolean") throw new Refused(400, "22004", "missing argument");
    if (a.p_user === bearerUser(req).id) throw new Refused(403, "42501", "you cannot change your own access");
    if (admins.get(a.p_user)?.role === "admin") throw new Refused(403, "42501", "an admin cannot be changed here");
    const u = userById(a.p_user);
    if (!u) throw new Refused(404, "P0002", "no such account");
    if (a.p_on) { if (!admins.has(u.id)) admins.set(u.id, { role: "moderator", added_at: new Date().toISOString(), added_by: bearerUser(req).id }); }
    else admins.delete(u.id);
    invites.delete(u.email.toLowerCase());
    return a.p_on ? "moderator" : "player";
  },
  dm_invite_moderator: (a, req) => {
    onlyAdmin(req, "invite moderators");
    const e = String(a.p_email || "").trim().toLowerCase();
    if (!EMAIL_OK(e)) throw new Refused(400, "22023", "not an email address");
    const u = userByEmail(e);
    if (u && admins.has(u.id)) return "already";
    if (u && !invites.has(e)) { admins.set(u.id, { role: "moderator", added_at: new Date().toISOString(), added_by: bearerUser(req).id }); return "moderator"; }
    invites.set(e, { invited_by: bearerUser(req).id, invited_at: new Date().toISOString() });
    return "invite";
  },
  dm_cancel_invite: (a, req) => {
    onlyAdmin(req, "cancel invites");
    return invites.delete(String(a.p_email || "").trim().toLowerCase()) ? "cancelled" : "none";
  },
  dm_claim_invite: (a, req) => {
    const u = bearerUser(req), m = bearerMeta(req);
    if (!u) throw new Refused(401, "42501", "permission denied for function dm_claim_invite");
    const e = u.email.toLowerCase();
    if (!freshInvite(e)) return "none";
    if (!m || !["otp", "magiclink", "invite", "recovery", "email/signup", "signup"].includes(m.amr)) return "not-from-link";
    if ([...liveSids(u.id)].some(sid => sid !== m.sid)) return "other-sessions";
    if (!admins.has(u.id)) admins.set(u.id, { role: "moderator", added_at: new Date().toISOString(), added_by: invites.get(e).invited_by });
    invites.delete(e);
    return "moderator";
  },
};
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
      const u = { id: "u" + ++seq, email: body.email, password: body.password, created_at: new Date().toISOString() };
      authUsers.set(u.email, u);
      return void res.writeHead(200).end(JSON.stringify(authSession(u)));
    }
    if (ep === "token" && req.method === "POST") {
      const grant = url.searchParams.get("grant_type");
      if (grant === "password") {
        const u = authUsers.get(body.email);
        if (!u || !u.password || u.password !== body.password)
          return void res.writeHead(400).end('{"error":"invalid_grant"}');
        return void res.writeHead(200).end(JSON.stringify(authSession(u)));
      }
      if (grant === "refresh_token") {
        const uid = sessions.get(body.refresh_token);
        const u = uid && [...authUsers.values()].find(x => x.id === uid);
        if (!u) return void res.writeHead(400).end('{"error":"invalid_grant"}');
        const m = sessMeta.get(body.refresh_token) || {};
        return void res.writeHead(200).end(JSON.stringify(authSession(u, m.amr, m.sid)));
      }
    }
    if (ep === "user" && req.method === "PUT") {
      const u = bearerUser(req);
      if (!u) return void res.writeHead(401).end('{"msg":"no"}');
      if (body.password) u.password = body.password;
      return void res.writeHead(200).end(JSON.stringify({ id: u.id, email: u.email }));
    }
    // like GoTrue: scope=others ends every other session of this user, global all of them
    if (ep === "logout" && req.method === "POST") {
      const u = bearerUser(req), m = bearerMeta(req), scope = url.searchParams.get("scope") || "local";
      if (u && m) for (const [tok, id] of [...sessions]) {
        if (id !== u.id) continue;
        const sid = sessMeta.get(tok)?.sid;
        if (scope === "global" || (scope === "others" ? sid !== m.sid : sid === m.sid)) { sessions.delete(tok); sessMeta.delete(tok); }
      }
      return void res.writeHead(204).end();
    }
    if (ep === "user" && req.method === "GET") {
      const u = bearerUser(req);
      if (!u) return void res.writeHead(401).end('{"msg":"no"}');
      return void res.writeHead(200).end(JSON.stringify({ id: u.id, email: u.email }));
    }
    // password reset: like GoTrue, 200 whether or not the email has an account
    if (ep === "recover" && req.method === "POST") {
      if (body.email && tooMany(body.email)) return void res.writeHead(429).end('{"error_code":"over_email_send_rate_limit","msg":"email rate limit exceeded"}');
      const u = authUsers.get(body.email);
      if (u) mailLink(u, "recovery", url.searchParams.get("redirect_to") || `http://localhost:${PORT}/`);
      return void res.writeHead(200).end("{}");
    }
    // sign-in link (magic link); create_user:false refuses an unknown email, create_user:true
    // (the People page's invite) creates the account first, with no password anyone knows
    if (ep === "otp" && req.method === "POST") {
      if (body.email && tooMany(body.email)) return void res.writeHead(429).end('{"error_code":"over_email_send_rate_limit","msg":"email rate limit exceeded"}');
      let u = authUsers.get(body.email);
      if (!u && body.create_user === true && body.email) {
        u = { id: "u" + ++seq, email: body.email, password: null, created_at: new Date().toISOString() };
        authUsers.set(u.email, u);
      }
      if (!u) return void res.writeHead(422).end('{"error_code":"otp_disabled","msg":"Signups not allowed for otp"}');
      mailLink(u, "magiclink", url.searchParams.get("redirect_to") || `http://localhost:${PORT}/`);
      return void res.writeHead(200).end("{}");
    }
    // the link in the mail: one use, then back to the site with the session in the hash
    if (ep === "verify" && req.method === "GET") {
      const l = links.get(url.searchParams.get("token") || "");
      const to = (l && l.redirect) || url.searchParams.get("redirect_to") || `http://localhost:${PORT}/`;
      if (!l) return void res.writeHead(303, { Location: to + "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired" }).end();
      links.delete(url.searchParams.get("token"));
      const u = [...authUsers.values()].find(x => x.id === l.uid);
      const sess = authSession(u, l.type);
      return void res.writeHead(303, { Location: `${to}#access_token=${sess.access_token}&refresh_token=${sess.refresh_token}&expires_in=3600&token_type=bearer&type=${l.type}` }).end();
    }
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

  if (url.pathname.startsWith("/rest/v1/")) {
    const read = req.method === "GET" || req.method === "HEAD";
    const profile = req.headers[read ? "accept-profile" : "content-profile"] || null;
    const entry = { method: req.method, path: url.pathname.slice("/rest/v1/".length), profile };
    restLog.push(entry);
    res.on("finish", () => { entry.status = res.statusCode; });
    const schema = profile || EXPOSED[0];
    if (!EXPOSED.includes(schema))
      return void res.writeHead(406, { "Content-Type": "application/json" }).end(JSON.stringify({
        code: "PGRST106", message: `Invalid schema: ${schema}`,
        hint: `Only the following schemas are exposed: ${EXPOSED.join(", ")}` }));
    if (schema !== TABLES_IN)
      return void res.writeHead(404, { "Content-Type": "application/json" })
        .end(JSON.stringify({ code: "PGRST205", message: `no DM table or function in schema ${schema}` }));
  }

  if (url.pathname.startsWith("/rest/v1/rpc/")) {
    const name = url.pathname.slice("/rest/v1/rpc/".length);
    const fn = RPC[name] || (!NO007 && PEOPLE[name]);
    if (LEGACY || !fn || req.method !== "POST")
      return void res.writeHead(404, { "Content-Type": "application/json" }).end('{"code":"PGRST202"}');
    try {
      const out = fn(await readJson(req), req);
      res.writeHead(200, { "Content-Type": "application/json" });
      return void res.end(JSON.stringify(out));
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      return void res.writeHead(e.status, { "Content-Type": "application/json" })
        .end(JSON.stringify({ code: e.code, message: e.message, details: null, hint: null }));
    }
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
    const role = url.searchParams.get("role") === "admin" ? "admin" : "moderator";
    admins.set(u.id, { role, added_at: new Date().toISOString(), added_by: null });
    return void res.writeHead(200).end("ok");
  }
  if (url.pathname === "/__users") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return void res.end(JSON.stringify([...authUsers.values()].map(u => ({ id: u.id, email: u.email,
      role: admins.get(u.id)?.role || null, hasPassword: !!u.password, sessions: [...liveSids(u.id)].length })), null, 1));
  }
  if (url.pathname === "/__invites") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return void res.end(JSON.stringify([...invites].map(([email, i]) => ({ email, ...i })), null, 1));
  }
  if (url.pathname === "/__mail") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return void res.end(JSON.stringify(outbox, null, 1));
  }
  if (url.pathname === "/__log") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return void res.end(JSON.stringify(restLog, null, 1));
  }
  if (url.pathname === "/__reset") {
    for (const k of Object.keys(db)) db[k] = [];
    restLog.length = 0;
    return void res.writeHead(200).end("ok");
  }
  if (url.pathname === "/__dump") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return void res.end(JSON.stringify(db, null, 1));
  }

  const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname)
    .replace(/^(\.\.[/\\])+/, "");
  try {
    let buf = await readFile(join(ROOT, rel));
    if (SELF && rel.replace(/^[/\\]/, "") === "index.html")
      buf = buf.toString()
        .replace(/"supabaseUrl":"[^"]*"/, `"supabaseUrl":"http://localhost:${PORT}"`)
        .replace(/"supabaseAnonKey":"[^"]*"/, `"supabaseAnonKey":"mock"`);
    res.writeHead(200, { "Content-Type": MIME[extname(rel)] || "application/octet-stream",
                         "Cache-Control": "no-store" });
    res.end(buf);
  } catch { res.writeHead(404).end("not found"); }
}).listen(PORT, () => {
  console.log(`mock supabase + static files on http://localhost:${PORT}`);
  console.log(`  beamer  http://localhost:${PORT}/?session=gewaltenteilung-ch&host=1`);
  console.log(`  phone   http://localhost:${PORT}/?session=gewaltenteilung-ch`);
});
