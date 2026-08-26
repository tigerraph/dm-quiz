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
 * Development only. Never deploy this, and remember to put the real
 * Supabase URL and anon key back in src/config.json before committing.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 4173);

const db = { dm_state: [], dm_players: [], dm_answers: [], dm_kicks: [] };
let seq = 0;

const MIME = { ".html":"text/html", ".json":"application/json", ".js":"text/javascript",
               ".woff2":"font/woff2", ".css":"text/css", ".svg":"image/svg+xml",
               ".png":"image/png", ".jpg":"image/jpeg" };

// PostgREST filters are "col=eq.value"; that is the only operator this app uses.
const eqVal = v => (v.startsWith("eq.") ? decodeURIComponent(v.slice(3)) : null);

function query(table, sp) {
  let rows = db[table].slice();
  for (const [k, v] of sp.entries()) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    const want = eqVal(v);
    if (want !== null) rows = rows.filter(r => String(r[k]) === want);
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
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  res.setHeader("Date", new Date().toUTCString());

  if (url.pathname.startsWith("/rest/v1/")) {
    const table = url.pathname.slice("/rest/v1/".length);
    if (!db[table]) return void res.writeHead(404).end("no such table");

    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return void res.end(JSON.stringify(query(table, url.searchParams)));
    }
    if (req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const row = JSON.parse(body);
      const uq = UNIQUE[table];
      if (uq && db[table].some(r => uq.every(k => String(r[k]) === String(row[k])))) {
        res.writeHead(409, { "Content-Type": "application/json" });
        return void res.end(JSON.stringify({ code: "23505", message: "duplicate key" }));
      }
      const now = new Date().toISOString();
      db[table].push({ id: "id" + ++seq, _seq: seq, round: 0,
                       started_at: now, joined_at: now, created_at: now, ...row });
      return void res.writeHead(201).end();
    }
    return void res.writeHead(405).end();
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
