#!/usr/bin/env node
/*
 * npm run new-topic -- <id> [--pillar civics|comm|action] [--title "Deutscher Titel"]
 *
 * One step to add a Special Topic. Creates:
 *   topics/<id>/source/          drop folder for raw material (PDFs, notes, links) — gitignored,
 *                                the Pages site is public and sources are not ours to publish
 *   topics/<id>/README.md        the brief: governing question, Swiss angle, pillar, sources, video
 *   packs/<id>.json              3 placeholder questions (DE), with the `unique` field the check requires
 *   slides/<id>.html             deck, copied from the golden topic with the id rewired
 *   slides/topic-card-<id>.html  topic card, same
 *   content/<id>.html            participant page, same
 *   content/regie-<id>.html      phone run sheet, same
 *   docs/runbook-<id>.md         runbook in the 5/10/5/5 format, same
 *   packs/sessions.json          a registry line with "draft": true (reachable by URL, hidden in the picker)
 *
 * The copied files keep the golden topic's content and carry a SCAFFOLD line: `npm run check-topic`
 * fails until every golden text is replaced (skill .claude/skills/dm-topic writes the content).
 */
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { p, read, readJSON, file, GOLDEN, PILLARS, MARKER } from "./topic-lib.mjs";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--"));
const opt = (k, d) => { const i = args.indexOf("--" + k); return i >= 0 ? args[i + 1] : d; };
const pillar = opt("pillar", "civics");
const title = opt("title", "[Titel]");

const die = (m) => { console.error("✗ " + m); process.exit(1); };
if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) die("usage: npm run new-topic -- <kebab-case-id> [--pillar civics|comm|action] [--title \"…\"]");
if (id === GOLDEN || id === "probe") die(`«${id}» is taken`);
if (!PILLARS.includes(pillar)) die(`pillar must be one of ${PILLARS.join(", ")}`);
const sessions = readJSON("packs/sessions.json");
if (sessions[id] || existsSync(p(file("pack", id)))) die(`topic «${id}» exists already`);

const write = (rel, s) => { mkdirSync(dirname(p(rel)), { recursive: true }); writeFileSync(p(rel), s); console.log("  + " + rel); };

// 1. drop folder + brief
mkdirSync(p("topics", id, "source"), { recursive: true });
console.log(`  + topics/${id}/source/   ← drop PDFs, notes, links here`);
write(file("brief", id), `# ${title} — Brief

- **Pillar:** ${pillar}
- **Governing question (the «warum»):** [Platzhalter]
- **Swiss angle:** [Platzhalter]
- **Sources** (files in \`source/\`, links here): [Platzhalter]
- **Video** (DE ≤ 5 min, backup, EN or ch.ch text): [Platzhalter]
- **Languages:** DE first; EN/FR/IT only when Rafa asks.
`);

// 2. pack — placeholders only; nothing of the golden pack is copied
const q = (n) => ({
  id: `q${n}`, img: null,
  q: { de: `[Frage ${n}]` },
  o: { de: ["[Antwort A]", "[Antwort B]"] },
  correct: 0,
  explanation: { de: "[Eine Zeile: warum — der Check-Beat des Learning Loop]" },
  unique: "[Warum jede andere Option falsch ist — keine zweite vertretbare Antwort]",
  sure: false,
});
write(file("pack", id), JSON.stringify({ id, title: { de: title }, timer_ms: 30000, questions: [q(1), q(2), q(3)] }, null, 1) + "\n");

// 3. deck, card, content page, run sheet, runbook — golden structure, id rewired, marker on top
const html = (s) => s.replace(/<!doctype html>/i, (m) => `${m}\n<!-- ${MARKER} -->`);
const md = (s) => `<!-- ${MARKER} -->\n${s}`;
for (const [key, wrap] of [["deck", html], ["card", html], ["content", html], ["regie", html], ["runbook", md]]) {
  const src = read(file(key, GOLDEN)).replaceAll(GOLDEN, id);
  write(file(key, id), wrap(src));
}

// 4. registry — draft until check-topic passes and a person drops the flag
sessions[id] = { pack: `${id}.json`, pillar, materials: true, title: { de: title }, date: null, draft: true };
writeFileSync(p("packs/sessions.json"), JSON.stringify(sessions, null, 2) + "\n");
console.log(`  ~ packs/sessions.json   (+ «${id}», draft)`);

console.log(`
Next:
  1. Drop sources in topics/${id}/source/, fill topics/${id}/README.md.
  2. Write the content (skill .claude/skills/dm-topic): pack, deck, card, content page, run sheet, runbook.
  3. npm run render-topic -- ${id}      (PDFs, only languages the deck is finished in)
  4. npm run check-topic -- ${id}       (must pass), then remove "draft": true in packs/sessions.json.
  Test link: https://tigerraph.github.io/dm-quiz/?session=${id}`);
