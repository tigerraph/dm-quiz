#!/usr/bin/env node
/*
 * Slide thumbnails for the site: slides/<id>.html -> assets/thumbs/<id>-1..4.jpg (640×360, EN)
 *
 * The session pages and the Moderator kit show the first four slides of each deck
 * (concept B «Session first», Rafa 03.11.2026). Run after a deck changes:
 *
 *   npm run thumbs                 every listed session with a deck
 *   npm run thumbs -- elections    one deck
 *
 * Needs Playwright, which this repo does not install (it stays dependency-free):
 * point PLAYWRIGHT at any checkout that has it, e.g.
 *   PLAYWRIGHT=~/Claude/Projects/boomerang-web/node_modules/playwright npm run thumbs
 * It drives the installed Google Chrome (or CHROME=/path/to/chrome).
 * A missing thumbnail is not an error on the site: the image is simply left out.
 */
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reg = JSON.parse(readFileSync(join(root, "packs", "sessions.json"), "utf8"));
const only = process.argv.slice(2);
const ids = (only.length ? only : Object.keys(reg)).filter(id => existsSync(join(root, "slides", id + ".html")));

let pw;
try {
  pw = process.env.PLAYWRIGHT ? createRequire(import.meta.url)(process.env.PLAYWRIGHT.replace(/^~/, process.env.HOME)) : await import("playwright");
} catch (e) {
  console.error("Playwright not found. Set PLAYWRIGHT=/path/to/node_modules/playwright (see the header of this file).");
  process.exit(1);
}
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await pw.chromium.launch(existsSync(chrome) ? { executablePath: chrome } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 0.5 });
mkdirSync(join(root, "assets", "thumbs"), { recursive: true });
for (const id of ids) {
  for (let n = 1; n <= 4; n++) {
    const url = pathToFileURL(join(root, "slides", id + ".html")).href + `?lang=en&present=1&slide=${n}`;
    await page.goto(url, { waitUntil: "load" });
    await page.addStyleTag({ content: ".dk-bar,.dk-prog,.dk-hint{display:none!important}" });
    await page.waitForTimeout(400);
    const out = join(root, "assets", "thumbs", `${id}-${n}.jpg`);
    await page.screenshot({ path: out, type: "jpeg", quality: 78 });
    console.log("assets/thumbs/" + id + "-" + n + ".jpg");
  }
}
await browser.close();
