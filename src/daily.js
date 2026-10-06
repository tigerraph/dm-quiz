/* Daily lesson — pure logic, no DOM, no storage.
 *
 * Injected into index.html by build.mjs and tested on its own by
 * tools/test-daily.mjs. Everything takes dates as local "YYYY-MM-DD" strings
 * so the tests can travel in time without touching the clock.
 *
 * Spec (Rafa 29.09.2026, mock https://claude.ai/artifact/MgyhdLG1BSZZhj5Qq6tXcx):
 * a solo mode with three questions a day, a streak, and a title ladder that
 * climbs the Swiss offices from Zaungast to Bundesrat.
 */
const DAILY = (() => {
  const PER_DAY = 3;

  /* Days of lessons done -> title. The days count lessons completed in total,
     not the current streak: a missed day breaks the streak, never the title. */
  const LADDER = [
    { days: 0,   t: { de: "Zaungast",       en: "Onlooker",              fr: "Spectateur",            it: "Spettatore" } },
    { days: 3,   t: { de: "Stimmbürger:in", en: "Voter",                 fr: "Citoyen·ne",            it: "Cittadino/a" } },
    { days: 7,   t: { de: "Gemeinderat",    en: "Municipal councillor",  fr: "Conseiller communal",   it: "Consigliere comunale" } },
    { days: 21,  t: { de: "Grossrat",       en: "Cantonal MP",           fr: "Député au Grand Conseil", it: "Gran consigliere" } },
    { days: 60,  t: { de: "Nationalrat",    en: "National Councillor",   fr: "Conseiller national",   it: "Consigliere nazionale" } },
    { days: 120, t: { de: "Ständerat",      en: "Councillor of States",  fr: "Conseiller aux Etats",  it: "Consigliere agli Stati" } },
    { days: 365, t: { de: "Bundesrat",      en: "Federal Councillor",    fr: "Conseiller fédéral",    it: "Consigliere federale" } },
  ];

  function iso(d) {
    const p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  /* Whole days since 1970-01-01 for a local date string (UTC arithmetic, so
     daylight-saving switches never make a day 23 or 25 hours long). */
  function dayNum(s) {
    const m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return NaN;
    return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
  }

  function hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* The pool: every question of every listed (non-draft) session, each pack
     once even when two sessions share it (the rehearsal session does).
     packs: { file: packJson }. Returns [{ pack, qi, key }] in a fixed order. */
  function pool(registry, packs) {
    const seen = new Set(), out = [];
    for (const id of Object.keys(registry || {})) {
      const s = registry[id];
      if (!s || s.draft || !s.pack || seen.has(s.pack)) continue;
      seen.add(s.pack);
      const p = packs[s.pack];
      if (!p || !Array.isArray(p.questions)) continue;
      p.questions.forEach((q, qi) => out.push({ pack: s.pack, qi, key: `${s.pack}#${q.id || qi}` }));
    }
    // one fixed shuffle, so neighbouring days mix topics; stable across devices
    const r = rng(hash32(out.map(x => x.key).join("|")));
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }

  /* Today's three: walk the fixed order three at a time, one step per day, so
     the whole pool comes round before anything repeats. Same date, same three,
     on every device. A pool smaller than three gives what there is. */
  function pick(all, dateStr) {
    const n = all.length;
    if (!n) return [];
    const k = Math.min(PER_DAY, n);
    const start = ((dayNum(dateStr) * k) % n + n) % n;
    const out = [];
    for (let i = 0; i < k; i++) out.push(all[(start + i) % n]);
    return out;
  }

  /* state: { last: "YYYY-MM-DD" | null, streak, best, days } */
  function blank() { return { last: null, streak: 0, best: 0, days: 0 }; }
  function norm(s) {
    s = s && typeof s === "object" ? s : {};
    const n = v => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    return { last: typeof s.last === "string" ? s.last : null, streak: n(s.streak), best: n(s.best), days: n(s.days) };
  }
  /* The streak as it stands today: alive if the last lesson was today or
     yesterday, otherwise 0. */
  function current(s, today) {
    s = norm(s);
    if (!s.last) return 0;
    const gap = dayNum(today) - dayNum(s.last);
    return gap === 0 || gap === 1 ? s.streak : 0;
  }
  function doneToday(s, today) { return norm(s).last === today; }
  /* Finishing a lesson. A second lesson on the same day changes nothing. */
  function complete(s, today) {
    s = norm(s);
    if (s.last === today) return s;
    const streak = current(s, today) + 1;
    return { last: today, streak, best: Math.max(s.best, streak), days: s.days + 1 };
  }

  /* Where the days put you: { i, title, next, toGo, pct } (titles are objects
     by language; next is null at the top of the ladder). */
  function rank(days) {
    days = Math.max(0, Math.floor(days || 0));
    let i = 0;
    while (i + 1 < LADDER.length && days >= LADDER[i + 1].days) i++;
    const cur = LADDER[i], nxt = LADDER[i + 1] || null;
    return {
      i, title: cur.t, next: nxt ? nxt.t : null,
      toGo: nxt ? nxt.days - days : 0,
      pct: nxt ? Math.round(100 * (days - cur.days) / (nxt.days - cur.days)) : 100,
      promoted: days === cur.days && i > 0,
    };
  }

  return { PER_DAY, LADDER, iso, dayNum, pool, pick, blank, norm, current, doneToday, complete, rank };
})();
