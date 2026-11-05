#!/usr/bin/env node
/*
 * The session QR opens the game (Rafa, 05.11.2026). A phone that scans
 * ?session=<id> with a fresh browser must land on «your name → join», never on
 * the star passport with its sign-up form, whatever the session's state is:
 *
 *   no row     no host has opened the session yet (Elections before its first night)
 *   done       last time's game is over
 *   old stars  a claim window left over from an earlier sitting
 *
 * Joining then waits in the lobby, writes no row into the old round, and puts the
 * player on the roster the moment the host opens the next lobby. What must keep
 * working: a claim window opened in this sitting, &view=mydm (star passport QR),
 * &host=1 (beamer). Every session in packs/sessions.json, all four languages.
 *
 * Headless Chrome against tools/mock-supabase.mjs; tools/test-qr-join.html taps
 * through the app in a 380 px iframe.
 *
 *   npm run build && node tools/test-qr-join.mjs
 */
import { spawn, execFile } from "node:child_process";
import { join, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromePath } from "./topic-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = chromePath();
if (!chrome) { console.error("✗ no Chrome found (set CHROME)"); process.exit(1); }

let bad = 0;
const ok = (cond, what) => { console.log(`${cond ? "✓" : "✗"} ${what}`); if (!cond) bad++; };
const PORT = 4193, BASE = `http://localhost:${PORT}`;
const TMP = process.env.RUNNER_TEMP || process.env.TMPDIR || "/tmp";
const registry = JSON.parse(readFileSync(join(ROOT, "packs/sessions.json"), "utf8"));
const SESSIONS = Object.keys(registry).filter(k => !registry[k].draft && k !== "probe");
const LANGS = ["en", "de", "fr", "it"];

const srv = spawn(process.execPath, [join(ROOT, "tools/mock-supabase.mjs"), String(PORT), "--self"],
  { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((res, rej) => {
  srv.stdout.on("data", d => { if (String(d).includes("mock supabase")) res(); });
  srv.on("exit", c => rej(new Error("mock exited " + c)));
});

let n = 0;
const dump = url => new Promise(r => execFile(chrome, ["--headless", "--disable-gpu", "--window-size=380,800",
  `--user-data-dir=${join(TMP, `dmq-qr-${PORT}-${Date.now()}-${n++}`)}`, "--virtual-time-budget=20000", "--dump-dom", url],
  { maxBuffer: 64 << 20, timeout: 90000 }, (e, out) => r(out || "")));
/* opens the app through the harness; returns what the harness saw */
async function phone(appUrl, opts = {}) {
  const h = new URLSearchParams({ u: appUrl, ...opts });
  const dom = await dump(`${BASE}/tools/test-qr-join.html?${h}`);
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  try { return JSON.parse(m[1].replaceAll("&quot;", '"').replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">")); }
  catch { return {}; }
}
const db = async () => (await fetch(`${BASE}/__dump`)).json();
const seed = row => fetch(`${BASE}/rest/v1/dm_state`, { method: "POST",
  headers: { apikey: "mock", Authorization: "Bearer mock", "Content-Type": "application/json", "Content-Profile": "dm" },
  body: JSON.stringify(row) });
const ago = ms => new Date(Date.now() - ms).toISOString();
const isJoin = s => s && s.phase === "join" && s.nameField && s.joinBtn && !s.signUp;

try {
  // 1. no row at all: every session, every language → the join screen with the session's title
  for (const id of SESSIONS) {
    for (const l of LANGS) {
      const r = await phone(`/?session=${id}`, { lang: l });
      const want = registry[id].title[l] || registry[id].title.en;
      ok(isJoin(r.first) && r.first.h1 === want, `${id} ${l}, no round yet: join screen «${want}»`
        + (isJoin(r.first) ? "" : `  (got ${JSON.stringify(r.first)})`));
    }
  }

  // 2. join with no round yet, then the host opens the lobby
  const s0 = SESSIONS[0];
  let r = await phone(`/?session=${s0}`, { name: "Ana", open: "0" });
  ok(r.afterJoin && r.afterJoin.phase === "lobby" && r.waiting === true, `${s0}: joining with no round waits in the lobby`);
  ok(r.afterOpen && r.afterOpen.phase === "lobby", `${s0}: still in the lobby once the host opens it`);
  let rows = (await db()).dm_players.filter(p => p.session === s0 && p.token === r.token);
  ok(rows.length === 1 && rows[0].round === 0 && rows[0].name === "Ana", `${s0}: on the roster of the host's round once it opens (${rows.length} row)`);

  // 3. last time's game is over: join, no row in the old round, on the next one
  const s1 = SESSIONS[1] || s0;
  await seed({ session: s1, phase: "done", q_index: 9, round: 2, started_at: ago(30 * 60e3) });
  r = await phone(`/?session=${s1}`, { name: "Ben", open: "3" });
  ok(isJoin(r.first), `${s1}, last round done: join screen` + (isJoin(r.first) ? "" : `  (got ${JSON.stringify(r.first)})`));
  ok(r.afterJoin && r.afterJoin.phase === "lobby", `${s1}: joining after the last round waits in the lobby, not on the old podium`);
  rows = (await db()).dm_players.filter(p => p.session === s1 && p.token === r.token);
  ok(!rows.some(p => p.round === 2), `${s1}: no row in the finished round 2`);
  ok(rows.some(p => p.round === 3), `${s1}: on the roster of round 3 once the host opens it`);

  // 4. a claim window from an earlier sitting → join; one opened in this sitting → claim
  const s2 = SESSIONS[2] || s0;
  await seed({ session: s2, phase: "stars", q_index: -1, round: 1, started_at: ago(3 * 86400e3) });
  r = await phone(`/?session=${s2}`);
  ok(isJoin(r.first), `${s2}, claim window 3 days old: join screen`);
  await seed({ session: s2, phase: "stars", q_index: -1, round: 1, started_at: ago(60e3) });
  r = await phone(`/?session=${s2}`);
  ok(r.first && r.first.phase === "claim", `${s2}, claim window opened a minute ago: claim screen (${r.first && r.first.phase})`);

  // 5. the other two QRs still do what they say
  r = await phone(`/?session=${s0}&view=mydm`);
  ok(r.first && r.first.phase === "passport", `${s0}&view=mydm: star passport (${r.first && r.first.phase})`);
  await fetch(`${BASE}/__reset`);
  r = await phone(`/?session=${s0}&host=1`);
  const st = (await db()).dm_state.filter(x => x.session === s0);
  ok(st.length === 1 && st[0].phase === "lobby", `${s0}&host=1: the beamer opens a lobby`);
} finally { srv.kill(); }

console.log(bad ? `\n${bad} check(s) failed.` : "\nThe session QR opens the game in every state.");
process.exit(bad ? 1 : 0);
