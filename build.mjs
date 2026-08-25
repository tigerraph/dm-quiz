#!/usr/bin/env node
/*
 * dm-quiz build — minimal, dependency-free.
 *
 * The original wedding-app pipeline is gone; this replaces it. It takes
 * src/template.html and injects four things:
 *
 *   __FONTS__    @font-face rules with the Poppins subsets base64-inlined
 *   __QRCODE__   vendor/qrcode.js verbatim (MIT), so the host view needs no CDN
 *   __AUDIO__    src/audio.js, the synthesized offline audio engine
 *   __CONFIG__   src/config.json plus a build stamp
 *
 * Question data is NOT injected — packs are fetched at runtime from packs/,
 * so a new session needs only a JSON file and a registry line, no rebuild.
 *
 * Output: index.html at the repo root (what GitHub Pages serves).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const p = (...a) => join(root, ...a);
const read = (...a) => readFileSync(p(...a), "utf8");

const FONTS = [
  { weight: 400, file: "poppins-400-latin.woff2", range: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
  { weight: 400, file: "poppins-400-latin-ext.woff2", range: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" },
  { weight: 800, file: "poppins-800-latin.woff2", range: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" },
  { weight: 800, file: "poppins-800-latin-ext.woff2", range: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" },
];

function fontCss() {
  return FONTS.map(f => {
    const b64 = readFileSync(p("assets", "fonts", f.file)).toString("base64");
    return `@font-face{font-family:'Poppins';font-style:normal;font-weight:${f.weight};`
         + `font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2');`
         + `unicode-range:${f.range};}`;
  }).join("\n");
}

function stamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `build ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} `
       + `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const config = JSON.parse(read("src", "config.json"));
config.build = stamp();

// Injected inside a <script> block, so no closing tag may survive verbatim.
const guard = s => s.replace(/<\/script/gi, "<\\/script");

const html = read("src", "template.html")
  .replace("__FONTS__", () => fontCss())
  .replace("__QRCODE__", () => guard(read("vendor", "qrcode.js")))
  .replace("__AUDIO__", () => guard(read("src", "audio.js")))
  .replace("__CONFIG__", () => JSON.stringify(config));

for (const token of ["__FONTS__", "__QRCODE__", "__AUDIO__", "__CONFIG__"]) {
  if (html.includes(token)) throw new Error(`placeholder ${token} was not replaced`);
}

writeFileSync(p("index.html"), html);

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  console.warn("!  src/config.json has no Supabase URL/anon key — the app will run\n"
             + "   in local-only mode (scores stay on the device, 📱 indicator).");
}
console.log(`index.html  ${(html.length / 1024).toFixed(1)} kB  (${config.build})`);
