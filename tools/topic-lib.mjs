// Shared bits for new-topic / check-topic / render-topic.
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const p = (...a) => join(ROOT, ...a);
export const read = (...a) => readFileSync(p(...a), "utf8");
export const readJSON = (...a) => JSON.parse(read(...a));

// The topic every new one is scaffolded from. Its structure carries over, never its content.
export const GOLDEN = "gewaltenteilung-ch";
export const LANGS = ["de", "en", "fr", "it"];
export const PILLARS = ["civics", "comm", "action"];

// Every file a topic owns. `{id}` is the topic id.
export const FILES = {
  pack: "packs/{id}.json",
  deck: "slides/{id}.html",
  card: "slides/topic-card-{id}.html",
  content: "content/{id}.html",
  regie: "content/regie-{id}.html",
  runbook: "docs/runbook-{id}.md",
  brief: "topics/{id}/README.md",
};
export const file = (key, id) => FILES[key].replaceAll("{id}", id);

// Rendered PDFs: German has no suffix, the others carry .<lang>.
export const pdfName = (base, lang) => `slides/${base}${lang === "de" ? "" : "." + lang}.pdf`;

// A scaffolded file carries this line until a person has replaced the golden content.
export const MARKER = "SCAFFOLD — copied from " + GOLDEN + "; replace every topic text, then delete this line";

// Strings that only belong to the golden topic. In any other topic they mean golden
// content survived the rewrite.
export const GOLDEN_LEFTOVERS = ["Gewaltenteilung", "Separation of powers", "Séparation des pouvoirs",
  "Separazione dei poteri", "Nadu4ABEmxQ", "e1cN5KuB5s0", "faule Apfel", "Skeptiker-Kit"];

// The PDF stamp: the sha of the HTML a PDF was rendered from. A PDF whose stamp does
// not match its HTML is stale — the git log has «PDFs hingen zurück» twice (54f47e8, 4944325).
export const STAMPS = "slides/pdf-stamps.json";
export const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
export const stamps = () => (existsSync(p(STAMPS)) ? readJSON(STAMPS) : {});

export function chromePath() {
  const c = [process.env.CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return c.find((x) => x && existsSync(x)) || null;
}
