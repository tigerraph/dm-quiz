#!/usr/bin/env node
// Tests for src/daily.js (daily lesson: pick, streak, title ladder). No deps.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const D = new Function(readFileSync(join(root, "src", "daily.js"), "utf8") + "\nreturn DAILY;")();

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("ok  " + name); };

const q = id => ({ id, q: { en: id }, o: { en: ["a", "b"] }, correct: 0 });
const packs = {
  "a.json": { questions: ["a1", "a2", "a3", "a4"].map(q) },
  "b.json": { questions: ["b1", "b2", "b3"].map(q) },
  "d.json": { questions: ["d1"].map(q) },
};
const registry = {
  a: { pack: "a.json" }, probe: { pack: "a.json" }, b: { pack: "b.json" },
  d: { pack: "d.json", draft: true },
};

test("pool: listed packs once each, drafts left out", () => {
  const p = D.pool(registry, packs);
  assert.equal(p.length, 7);
  assert.equal(new Set(p.map(x => x.key)).size, 7);
  assert.ok(!p.some(x => x.pack === "d.json"));
});

test("pool: same order on every call (every device)", () => {
  assert.deepEqual(D.pool(registry, packs), D.pool(registry, packs));
});

test("pick: three a day, same date same three", () => {
  const p = D.pool(registry, packs);
  assert.equal(D.pick(p, "2026-10-06").length, 3);
  assert.deepEqual(D.pick(p, "2026-10-06"), D.pick(p, "2026-10-06"));
  assert.notDeepEqual(D.pick(p, "2026-10-06"), D.pick(p, "2026-10-07"));
});

test("pick: the whole pool comes round before repeats", () => {
  const p = D.pool(registry, packs); // 7 questions, 3 a day -> all 7 within 3 days
  const seen = new Set();
  for (const d of ["2026-10-06", "2026-10-07", "2026-10-08"]) D.pick(p, d).forEach(x => seen.add(x.key));
  assert.equal(seen.size, 7);
});

test("pick: small and empty pools", () => {
  const p = D.pool({ x: { pack: "d.json" } }, packs);
  assert.equal(D.pick(p, "2026-10-06").length, 1);
  assert.deepEqual(D.pick([], "2026-10-06"), []);
});

test("streak: first lesson starts at 1", () => {
  const s = D.complete(D.blank(), "2026-10-06");
  assert.deepEqual(s, { last: "2026-10-06", streak: 1, best: 1, days: 1 });
});

test("streak: consecutive days count up, across a month end", () => {
  let s = D.blank();
  for (const d of ["2026-09-29", "2026-09-30", "2026-10-01"]) s = D.complete(s, d);
  assert.equal(s.streak, 3); assert.equal(s.days, 3);
});

test("streak: across the DST switch (25.10.2026)", () => {
  let s = D.complete(D.blank(), "2026-10-24");
  s = D.complete(s, "2026-10-25"); s = D.complete(s, "2026-10-26");
  assert.equal(s.streak, 3);
});

test("streak: a second lesson the same day changes nothing", () => {
  const s = D.complete(D.blank(), "2026-10-06");
  assert.deepEqual(D.complete(s, "2026-10-06"), s);
});

test("streak: a missed day restarts at 1, best and days kept", () => {
  let s = D.blank();
  for (const d of ["2026-10-01", "2026-10-02", "2026-10-03"]) s = D.complete(s, d);
  s = D.complete(s, "2026-10-05");
  assert.equal(s.streak, 1); assert.equal(s.best, 3); assert.equal(s.days, 4);
});

test("current: alive today and yesterday, 0 after a gap", () => {
  const s = { last: "2026-10-05", streak: 4, best: 4, days: 4 };
  assert.equal(D.current(s, "2026-10-05"), 4);
  assert.equal(D.current(s, "2026-10-06"), 4);
  assert.equal(D.current(s, "2026-10-07"), 0);
  assert.equal(D.current(null, "2026-10-07"), 0);
});

test("norm: garbage in storage becomes a blank state", () => {
  assert.deepEqual(D.norm("x"), D.blank());
  assert.deepEqual(D.norm({ streak: -3, days: "7", last: 5 }), D.blank());
});

test("rank: ladder thresholds Zaungast -> Bundesrat", () => {
  assert.equal(D.rank(0).title.de, "Zaungast");
  assert.equal(D.rank(2).title.de, "Zaungast");
  assert.equal(D.rank(3).title.de, "Stimmbürger:in");
  assert.equal(D.rank(7).title.de, "Gemeinderat");
  assert.equal(D.rank(21).title.de, "Grossrat");
  assert.equal(D.rank(60).title.de, "Nationalrat");
  assert.equal(D.rank(120).title.de, "Ständerat");
  assert.equal(D.rank(365).title.de, "Bundesrat");
  assert.equal(D.rank(9999).next, null);
});

test("rank: progress to the next title", () => {
  const r = D.rank(14); // Gemeinderat at 7, Grossrat at 21
  assert.equal(r.next.de, "Grossrat"); assert.equal(r.toGo, 7); assert.equal(r.pct, 50);
  assert.equal(D.rank(7).promoted, true); assert.equal(D.rank(8).promoted, false);
  assert.equal(D.rank(0).promoted, false);
});

test("ladder: every title in all four languages, no Eszett", () => {
  for (const s of D.LADDER) for (const l of ["de", "en", "fr", "it"]) {
    assert.ok(s.t[l], `${s.days} ${l}`); assert.ok(!s.t[l].includes("ß"));
  }
});

console.log(`\n${n} tests passed`);
