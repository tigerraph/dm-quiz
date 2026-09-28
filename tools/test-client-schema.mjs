#!/usr/bin/env node
/*
 * The built app (index.html) against tools/mock-supabase.mjs in the states the
 * DM schema move passes through (docs/supabase-migration-006-dm-schema.sql):
 *
 *   before   006 not run: tables in public, «dm» not exposed
 *            → the app asks for «dm», gets 406 PGRST106, repeats in public
 *   after    006 run and «dm» exposed
 *            → every REST call carries the «dm» profile, none touches public
 *
 * In both, a headless Chrome opens the beamer (host) and a phone (player). The
 * host must write its lobby row, and every REST call must end in a 2xx. So the
 * client can be merged before the migration and keeps working after it.
 *
 *   npm run build && node tools/test-client-schema.mjs
 */
import { spawn, execFile } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromePath } from "./topic-lib.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const chrome = chromePath();
if (!chrome) { console.error("✗ no Chrome found (set CHROME)"); process.exit(1); }

let bad = 0;
const ok = (cond, what) => { console.log(`${cond ? "✓" : "✗"} ${what}`); if (!cond) bad++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function mock(port, args) {
  const p = spawn(process.execPath, [join(ROOT, "tools/mock-supabase.mjs"), String(port), "--self", ...args],
    { stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((res, rej) => {
    p.stdout.on("data", d => { if (String(d).includes("mock supabase")) res(); });
    p.on("exit", c => rej(new Error("mock exited " + c)));
  });
  return p;
}
const open = (url, profileDir) => new Promise(r => execFile(chrome, ["--headless", "--disable-gpu",
  `--user-data-dir=${profileDir}`, "--virtual-time-budget=6000", "--dump-dom", url],
  { maxBuffer: 64 << 20, timeout: 60000 }, (e, out) => r(out || "")));

const SCENARIOS = [
  { name: "before 006", port: 4191, args: ["--schemas", "public,noeggi", "--tables-in", "public"], fallback: true },
  { name: "after 006",  port: 4192, args: [], fallback: false },
];

for (const sc of SCENARIOS) {
  const srv = await mock(sc.port, sc.args);
  const base = `http://localhost:${sc.port}`;
  try {
    const tmp = join(process.env.RUNNER_TEMP || process.env.TMPDIR || "/tmp", `dmq-chrome-${sc.port}-${Date.now()}`);
    await open(`${base}/?session=probe&host=1`, tmp + "-host");
    await open(`${base}/?session=probe`, tmp + "-phone");
    await sleep(200);
    const db = await (await fetch(`${base}/__dump`)).json();
    const log = await (await fetch(`${base}/__log`)).json();

    ok(db.dm_state.some(r => r.session === "probe" && r.phase === "lobby"), `${sc.name}: host wrote its lobby row`);
    ok(log.length >= 4, `${sc.name}: ${log.length} REST calls seen`);
    const finals = log.filter(e => !(e.status === 406 && e.profile === "dm"));
    const failing = finals.filter(e => !(e.status >= 200 && e.status < 300));
    ok(failing.length === 0, `${sc.name}: every REST call ends in 2xx`
      + (failing.length ? "  ✗ " + failing.map(e => `${e.method} ${e.path} [${e.profile}] ${e.status}`).join("; ") : ""));
    const refused = log.filter(e => e.status === 406);
    if (sc.fallback) {
      ok(log[0].profile === "dm" && log[0].status === 406, `${sc.name}: first call asks for «dm» and is refused (406)`);
      ok(finals.every(e => e.profile === null), `${sc.name}: the app falls back to public`);
      ok(refused.length <= 2, `${sc.name}: refused at most once per page (${refused.length} × 406 over 2 pages)`);
    } else {
      ok(refused.length === 0, `${sc.name}: no call refused`);
      ok(log.every(e => e.profile === "dm"), `${sc.name}: every call carries the «dm» profile`);
    }
  } finally { srv.kill(); }
}

console.log(bad ? `\n${bad} check(s) failed.` : "\nThe client works before and after the schema move.");
process.exit(bad ? 1 : 0);
