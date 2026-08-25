# dm-quiz

Democracy Matters session quiz. Participants join from their phones by
scanning a QR code, answer the session's questions, and a live leaderboard
runs on the beamer. This is the **Quiz** and **Check** beat of the DM
Learning Loop.

Built on the engine from the `noeggi-kahoot` wedding app (timer, speed
scoring, streak bonus, i18n, synthesized offline audio, Supabase-with-local-
fallback). That repo stays frozen; all work happens here.

Spec: [`docs/dm-quiz-spec.md`](docs/dm-quiz-spec.md) ·
Skin: [`docs/design-tokens.md`](docs/design-tokens.md)

## URLs

| URL | What it is |
|---|---|
| `/` | Session picker, built from `packs/sessions.json` |
| `/?session=<id>` | Player view — join, play, see your result |
| `/?session=<id>&host=1` | Host view for the beamer — join QR, live top-10, player count |

## Running a session

1. Open the host view on the beamer: `?session=<id>&host=1`.
2. Participants scan the QR. It points at the same page without `host=1`.
3. They enter a name and play. The leaderboard refreshes every 4 seconds.

Before a session, check that the Supabase project is **Active** in the
dashboard. The keep-alive cron below usually handles it, but if the project
is paused the quiz still runs — scores just stay on each device (📱 instead
of 🌍 next to the leaderboard title).

## Adding a session

No rebuild needed — packs are fetched at runtime.

1. Add `packs/<id>.json`.
2. Add a line to `packs/sessions.json` pointing at it.

Pack schema:

```json
{
  "id": "my-topic",
  "title": { "en": "…", "de": "…" },
  "timer_ms": 20000,
  "questions": [
    {
      "id": "q1",
      "img": null,
      "q":  { "en": "…", "de": "…" },
      "o":  { "en": ["…", "…"], "de": ["…", "…"] },
      "correct": 1,
      "explanation": { "en": "…", "de": "…" },
      "sure": true
    }
  ]
}
```

- 2–4 options per question; A/B is fine. Option order is shuffled per player,
  `correct` is the index into the **unshuffled** array.
- `explanation` is shown after the reveal — the Learning Loop "Check" beat.
- `img` is an optional relative path; `null` for none.
- `timer_ms` defaults to 20000.
- `sure` is an authoring flag ("we have checked this fact"). It carries over
  from the wedding pack schema and the app does not read it.

## Build

```bash
npm run build
```

`build.mjs` injects the Poppins subsets, the vendored QR library, the audio
engine and `src/config.json` into `src/template.html` and writes `index.html`
at the repo root, which is what GitHub Pages serves. **Commit the rebuilt
`index.html`** — CI fails the build if it has drifted from `src/`.

Edit `src/template.html`, never `index.html`.

## Supabase

One table, `dm_scores`, with anon insert + select. The SQL is in the spec.
Put the project URL and the **anon/public** key in `src/config.json` and
rebuild. Both are public by design — they ship in the client. The database
password and the `service_role` key must never go in this repo.

With no config the app runs local-only: scores persist per device in
`localStorage`, scoped by session id.

### Keep-alive

Free-tier projects pause after ~7 days of no API traffic and DM meets about
monthly. `.github/workflows/keep-alive.yml` pings the REST API twice a week.
It needs two repo secrets: `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

## Layout

```
src/template.html    the app — edit this
src/audio.js         synthesized audio engine, carried over unchanged
src/config.json      Supabase URL + anon key
build.mjs            template + fonts + qrcode + audio + config -> index.html
packs/               session registry and topic packs, fetched at runtime
vendor/              qrcode-generator (MIT)
assets/fonts/        Poppins woff2 subsets (SIL OFL)
index.html           build output, committed, served by Pages
```
