# dm-quiz

Democracy Matters session quiz, Kahoot-style. The beamer runs the game;
participants scan a QR code to join from their phones. Everyone answers the
same question at the same time, and after each one the beamer shows how the
room voted, the explanation, and the running leaderboard. This is the
**Quiz** and **Check** beat of the DM Learning Loop.

Built on the engine from the `noeggi-kahoot` wedding app (timer, speed
scoring, streak bonus, i18n, synthesized offline audio, Supabase-with-local-
fallback). That repo stays frozen; all work happens here.

Spec: [`docs/dm-quiz-spec.md`](docs/dm-quiz-spec.md) ·
Skin: [`docs/design-tokens.md`](docs/design-tokens.md)

## URLs

| URL | What it is |
|---|---|
| `/` | Session picker, built from `packs/sessions.json` |
| `/?session=<id>` | Player view — join from a phone and follow the beamer |
| `/?session=<id>&host=1` | Host view for the beamer — drives the game |

## Running a session

1. Open the host view on the beamer: `?session=<id>&host=1`. It shows the join
   QR and the names of everyone who has joined, live.
2. Participants scan the QR, type a name, and land in the lobby.
3. Press **Start the quiz**. Every phone shows the same question at the same
   time, counting down from the same clock.
4. The host reveals automatically once everyone has answered or the timer runs
   out — or press **Show answer** to cut it short. The reveal shows how the room
   voted, the explanation, and the leaderboard, on the beamer and on every phone.
5. **Next** moves on. After the last question the beamer shows a podium.
   **New round** puts everyone back in the lobby with a clean slate.

Keyboard on the beamer: <kbd>Space</kbd> or <kbd>Enter</kbd> presses whatever
the current button is, so a presenter remote works.

Before a session, check that the Supabase project is **Active** in the
dashboard. The keep-alive cron below usually handles it. If the project is
down the beamer says so — and phones fall back to **solo mode**, where each
person plays the pack at their own pace on their own device.

### Modes

| | Live | Solo |
|---|---|---|
| When | Supabase reachable | no config, or the database is down |
| Driven by | the host view | the player |
| Everyone on the same question | yes | no |
| Room results and leaderboard | yes | no |
| Option order | identical on every device | shuffled per device |

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

- 2–4 options per question; A/B is fine. `correct` is the index into the
  **unshuffled** array. In live mode the displayed order is shuffled but
  identical on every device (seeded from the session and question id), so the
  beamer's "A" is everyone's "A". Solo mode shuffles per device.
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

Three insert-only tables — `dm_players` (who is in the room), `dm_answers`
(one row per answer) and `dm_state` (which question the host has up). The SQL,
including the RLS policies and a note on the trust model, is in
[`docs/supabase.sql`](docs/supabase.sql).

Put the project URL and the **anon/public** key in `src/config.json` and
rebuild. Both are public by design — they ship in the client. The database
password and the `service_role` key must never go in this repo.

With no config the app runs in solo mode.

### Developing without a Supabase project

```bash
npm run mock
```

serves the repo and fakes the three tables in memory. Point `src/config.json`
at `http://localhost:4173` with any non-empty key, rebuild, and the full live
mode works locally. See [`tools/mock-supabase.mjs`](tools/mock-supabase.mjs).

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
tools/               mock Supabase for local development
vendor/              qrcode-generator (MIT)
assets/fonts/        Poppins woff2 subsets (SIL OFL)
index.html           build output, committed, served by Pages
```
