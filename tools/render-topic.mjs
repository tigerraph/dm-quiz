#!/usr/bin/env node
/*
 * npm run render-topic -- <id> [--langs de,en]
 *
 * Renders the deck and the topic card to PDF with headless Chrome — the recipe from
 * .claude/skills/dm-topic (--no-pdf-header-footer, srgb) — one PDF per language, and
 * records the sha of the HTML each PDF came from in slides/pdf-stamps.json, so
 * check-topic can tell a stale PDF from a current one. Default languages: those the
 * pack's first question is written in.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { p, read, readJSON, file, pdfName, chromePath, sha, stamps, STAMPS, LANGS } from "./topic-lib.mjs";

const args = process.argv.slice(2);
const id = args.find((a) => !a.startsWith("--"));
const li = args.indexOf("--langs");
if (!id) { console.error("usage: npm run render-topic -- <id> [--langs de,en]"); process.exit(1); }
const pack = readJSON(file("pack", id));
const langs = li >= 0 ? args[li + 1].split(",") : Object.keys(pack.questions[0].q).filter((l) => LANGS.includes(l));
const chrome = chromePath();
if (!chrome) { console.error("✗ no Chrome found (set CHROME=/path/to/chrome)"); process.exit(1); }

const st = stamps();
for (const [key, base] of [["deck", id], ["card", `topic-card-${id}`]]) {
  const rel = file(key, id);
  if (!existsSync(p(rel))) { console.error(`✗ ${rel} missing`); process.exit(1); }
  const src = read(rel);
  for (const lang of langs) {
    const out = pdfName(base, lang);
    const url = pathToFileURL(p(rel)).href + "?lang=" + lang;
    execFileSync(chrome, ["--headless", "--disable-gpu", "--force-color-profile=srgb", "--no-pdf-header-footer",
      "--virtual-time-budget=4000", `--print-to-pdf=${p(out)}`, url], { stdio: "ignore" });
    st[out] = sha(src + "|" + lang);
    console.log(`  ✓ ${out}`);
  }
}
writeFileSync(p(STAMPS), JSON.stringify(Object.fromEntries(Object.entries(st).sort()), null, 1) + "\n");
console.log(`  ~ ${STAMPS}\nLook at every page of every PDF before calling it done.`);
