#!/usr/bin/env node
/*
 * npm run check-topic -- <id>        one topic
 * npm run check-topic -- --all       every topic in packs/sessions.json (CI runs this)
 *   --no-browser                     skip the headless-Chrome checks (QR, timer)
 *
 * The rules the git log shows were learned the hard way:
 *  - 52598c5  every quiz question had a second defensible answer → each question states why the other
 *             options are wrong (`unique`), and a person has checked it (`sure: true`)
 *  - 0f9587a / 206c7f0  German text left in other languages → tools/check-i18n.py, plus complete packs
 *             per language
 *  - 54f47e8 / 4944325  PDFs lagged behind the slides → every PDF's stamp must match its HTML
 *  - 9c77b9f  one dead line killed all four QR codes and the timer → the deck is opened in headless
 *             Chrome per language and the QR codes and the timer must be there
 *  - house rules: no ß; no scaffold marker or golden-topic text left in a new topic.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { p, read, readJSON, file, pdfName, chromePath, sha, stamps, GOLDEN, LANGS, PILLARS, MARKER, GOLDEN_LEFTOVERS } from "./topic-lib.mjs";

const args = process.argv.slice(2);
const noBrowser = args.includes("--no-browser");
const sessions = readJSON("packs/sessions.json");
const ids = args.includes("--all")
  ? [...new Set(Object.values(sessions).map((s) => s.pack.replace(/\.json$/, "")))]
  : args.filter((a) => !a.startsWith("--"));
if (!ids.length) { console.error("usage: npm run check-topic -- <id> | --all [--no-browser]"); process.exit(1); }

// Topics built before these rules keep their shape: the golden pack has no `unique` field.
const LEGACY = new Set([GOLDEN]);
const chrome = noBrowser ? null : chromePath();
let bad = 0;
const fail = (id, m) => { console.log(`🔴 ${id}: ${m}`); bad++; };

for (const id of ids) {
  const before = bad;
  const entry = Object.entries(sessions).find(([k, s]) => k === id || s.pack === `${id}.json`);
  if (!entry) { fail(id, "no line in packs/sessions.json"); continue; }
  const [, reg] = entry;
  if (!PILLARS.includes(reg.pillar)) fail(id, `pillar «${reg.pillar}» is none of ${PILLARS.join(", ")}`);
  for (const k of ["pack", "deck", "card", "content", "regie", "runbook"])
    if (!existsSync(p(file(k, id)))) fail(id, `${file(k, id)} missing`);
  if (bad > before) continue;

  // ── pack ──
  const pack = readJSON(file("pack", id));
  const langs = Object.keys(pack.questions[0]?.q || {}).filter((l) => LANGS.includes(l));
  if (pack.id !== id) fail(id, `pack id «${pack.id}» ≠ «${id}»`);
  if (!langs.includes("de")) fail(id, "pack has no German");
  if (pack.questions.length < 1) fail(id, "pack has no questions");
  pack.questions.forEach((q, i) => {
    const n = `question ${i + 1} (${q.id})`;
    for (const l of langs) {
      if (!q.q?.[l]) fail(id, `${n}: no question text in ${l}`);
      if (!q.explanation?.[l]) fail(id, `${n}: no explanation in ${l} (the Check beat)`);
      const o = q.o?.[l];
      if (!Array.isArray(o) || o.length < 2 || o.length > 4) fail(id, `${n}: ${l} needs 2–4 options`);
      else if (o.length !== q.o.de.length) fail(id, `${n}: ${l} has ${o.length} options, de has ${q.o.de.length}`);
      else if (new Set(o).size !== o.length) fail(id, `${n}: ${l} has two identical options`);
    }
    if (!(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < (q.o?.de?.length || 0))) fail(id, `${n}: «correct» is not an index into the options`);
    if (!LEGACY.has(id)) {
      if (!q.unique || /\[/.test(q.unique)) fail(id, `${n}: «unique» must say why every other option is wrong (52598c5: second defensible answers)`);
      if (q.sure !== true) fail(id, `${n}: «sure» is not true — a person has not checked this question yet`);
    }
  });

  // ── text files: scaffold marker, golden leftovers, placeholders, ß ──
  const texts = ["pack", "deck", "card", "content", "regie", "runbook"].map((k) => [file(k, id), read(file(k, id))]);
  for (const [rel, s] of texts) {
    if (s.includes(MARKER)) fail(id, `${rel}: still carries the SCAFFOLD line`);
    if (/\[(Platzhalter|Frage|Antwort|Titel|Eine Zeile|Warum)/.test(s)) fail(id, `${rel}: placeholder text left`);
    if (s.includes("ß")) fail(id, `${rel}: contains ß (Swiss spelling: ss)`);
    if (id !== GOLDEN) {
      const left = GOLDEN_LEFTOVERS.filter((w) => s.includes(w));
      if (left.length) fail(id, `${rel}: golden-topic text left — ${left.join(", ")}`);
    }
  }

  // ── PDFs current ──
  const st = stamps();
  for (const [key, base] of [["deck", id], ["card", `topic-card-${id}`]]) {
    const src = read(file(key, id));
    for (const l of langs) {
      const pdf = pdfName(base, l);
      if (!existsSync(p(pdf))) fail(id, `${pdf} missing — npm run render-topic -- ${id}`);
      else if (st[pdf] !== sha(src + "|" + l)) fail(id, `${pdf} is older than ${file(key, id)} — npm run render-topic -- ${id}`);
    }
  }

  // ── deck in a real browser: QR codes and timer alive in every language ──
  if (chrome) {
    for (const l of langs) {
      const url = pathToFileURL(p(file("deck", id))).href + "?lang=" + l;
      let dom = "";
      try {
        dom = execFileSync(chrome, ["--headless", "--disable-gpu", "--virtual-time-budget=3000", "--dump-dom", url],
          { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] });
      } catch (e) { fail(id, `deck (${l}) did not open in Chrome: ${e.message.split("\n")[0]}`); continue; }
      for (const q of ["qr", "qr-star", "qr-content", "qr-host"]) {
        const m = dom.match(new RegExp(`id="${q}"[^>]*>([\\s\\S]{0,40})`));
        if (!m || !m[1].includes("<svg")) fail(id, `deck (${l}): QR «${q}» is empty — a script error on the slide (9c77b9f)`);
      }
      if (!/id="t2"/.test(dom) || !/id="t2go"/.test(dom)) fail(id, `deck (${l}): exercise timer (#t2 / #t2go) missing`);
      if (!dom.includes(`?session=${id}`)) fail(id, `deck (${l}): no link to ?session=${id}`);
    }
  } else if (!noBrowser) fail(id, "no Chrome found for the QR/timer check (set CHROME, or pass --no-browser)");

  if (bad === before) console.log(`✅ ${id}: pack (${langs.join("/")}), files, PDFs, ${chrome ? "QR + timer," : ""} house rules`);
}

// i18n dictionaries over every deck and card (German left in other languages)
try { execFileSync("python3", [p("tools/check-i18n.py")], { cwd: p(), stdio: "inherit" }); }
catch { fail("slides", "tools/check-i18n.py found German that stays German in other languages"); }

console.log(bad ? `\n${bad} problem(s).` : "\nAll topic checks pass.");
process.exit(bad ? 1 : 0);
