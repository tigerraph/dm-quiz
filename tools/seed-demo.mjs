#!/usr/bin/env node
/*
 * Fill a session with a plausible room, so the beamer can be checked with
 * something that looks like a real group rather than "Pa", "Pb", "test1".
 *
 *   node tools/seed-demo.mjs                        # 22 players -> probe, mock
 *   node tools/seed-demo.mjs --session probe -n 14  # against the mock
 *   node tools/seed-demo.mjs --live -n 18           # against real Supabase
 *
 * Defaults to the local mock (tools/mock-supabase.mjs) precisely so that a
 * stray run cannot drop demo names onto a real session's leaderboard. --live
 * reads src/config.json and refuses any session that is not a scratch one.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Swiss-plausible first names, the mix you would actually get in a DM room.
const NAMES = [
  "Anna", "Marc", "Lea", "Jonas", "Sofia", "Elias", "Nadia", "Tobias",
  "Mira", "Luca", "Chiara", "Ben", "Yara", "Noah", "Zoe", "Timo",
  "Alina", "Finn", "Rahel", "Jan", "Ida", "Samir", "Nina", "David",
  "Livia", "Andrin", "Sarah", "Nico", "Elena", "Robin",
];

// Sessions it is safe to write demo data into. A real session must never
// end up with fake players on its leaderboard.
const SCRATCH = /^(probe|demo|test|scratch)/;

const args = process.argv.slice(2);
const flag = (k, d) => {
  const i = args.indexOf(k);
  return i === -1 ? d : args[i + 1];
};
const SESSION = flag("--session", "probe");
const COUNT = Math.min(+flag("-n", 22), NAMES.length);
const ROUND = +flag("--round", 0);
const LIVE = args.includes("--live");

let base = "http://localhost:4173", key = "mock";
if (LIVE) {
  const cfg = JSON.parse(readFileSync(join(ROOT, "src", "config.json"), "utf8"));
  base = cfg.supabaseUrl;
  key = cfg.supabaseAnonKey;
  if (!base || !key) { console.error("src/config.json has no Supabase URL/key"); process.exit(1); }
  if (!SCRATCH.test(SESSION)) {
    console.error(`Refusing to seed "${SESSION}" on the live project.`);
    console.error(`Demo players on a real leaderboard cannot be deleted with the anon key.`);
    console.error(`Use a scratch session (probe, demo, test…) or drop --live.`);
    process.exit(1);
  }
}

const post = (table, row) =>
  fetch(`${base}/rest/v1/${table}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`,
               "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });

// A believable spread: most of the room wrong on the counter-intuitive first
// question, steadily better after the explanation. That is the shape the
// Learning Loop is meant to produce, so it is the shape worth eyeballing.
const CORRECT_SHARE = [0.35, 0.7, 0.88];

const pack = JSON.parse(readFileSync(join(ROOT, "packs", "gewaltenteilung-ch.json"), "utf8"));
const players = NAMES.slice(0, COUNT).map((name, i) => ({ name, token: `demo-${i}` }));

const run = async () => {
  await post("dm_state", { session: SESSION, phase: "lobby", q_index: -1, round: ROUND });
  for (const p of players) {
    await post("dm_players", { session: SESSION, token: p.token, name: p.name, round: ROUND });
  }

  for (let q = 0; q < pack.questions.length; q++) {
    const correct = pack.questions[q].correct;
    const nRight = Math.round(players.length * (CORRECT_SHARE[q] ?? 0.75));
    const shuffled = players.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < shuffled.length; i++) {
      const ok = i < nRight;
      // 500 base + up to 500 for speed, so scores separate the way they do live
      const points = ok ? 500 + Math.round(120 + Math.random() * 380) : 0;
      await post("dm_answers", {
        session: SESSION, token: shuffled[i].token, name: shuffled[i].name,
        round: ROUND, q_index: q,
        choice: ok ? correct : (correct === 0 ? 1 : 0),
        correct: ok, points,
      });
    }
  }
  console.log(`Seeded ${players.length} players over ${pack.questions.length} questions`);
  console.log(`  session ${SESSION} · round ${ROUND} · ${LIVE ? base : "mock " + base}`);
  console.log(`  beamer  ${LIVE ? "https://tigerraph.github.io/dm-quiz" : base}/?session=${SESSION}&host=1`);
};

run().catch(e => { console.error(e.message); process.exit(1); });
