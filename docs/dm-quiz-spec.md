# dm-quiz — Build Spec (v1)

**Goal:** Democracy Matters session quiz on the wedding-kahoot engine. Participants join
via QR on their phones, answer the session's topic questions, and a per-session live
leaderboard runs on the beamer (host view). This implements the "Quiz" and "Check" beats
of the DM Learning Loop.

## Base & source of truth

- Base code: the deployed single-file app in the `noeggi-kahoot` repo
  (tigerraph.github.io/noeggi-kahoot). **The original build pipeline (template.html,
  questions.json, build script) lived in a chat container and is gone.** First task:
  extract a clean template from the built `index.html` — question data and images sit in
  two identifiable injected JSON constants — and re-establish a minimal build
  (template + pack injection or runtime fetch).
- The wedding repo stays frozen. All work happens in the new `dm-quiz` repo.

## Carries over unchanged

Timer + speed scoring + streak bonus, DE/FR/EN i18n plumbing, Web-Audio engine
(incl. iOS silent-switch unlock), name entry, Supabase client pattern with graceful
offline fallback (local list, 📱 vs 🌍 indicator).

## Strip (wedding-specific)

All wedding questions, photos and base64 media, bonus-photo unlock system, the gated
outtake, the retro/80s theme, and the 23er/Blitz modes. v1 has exactly one mode: play
the current session's pack.

## New: sessions

- URL param `?session=<id>`. Registry `packs/sessions.json` maps id → pack file, title
  (per language), date.
- Unknown or missing session id → show a simple session picker from the registry.
- Leaderboard is scoped to the session id.

## New: topic packs

`packs/<id>.json`, schema per question: `id`, optional `img`, `q` (per language), `o`
(2–4 options per language; A/B is fine), `correct` (index), `explanation` (per
language), `sure` (bool). **New vs wedding:** after the answer reveal, show the
one-line `explanation` — this is the Learning Loop "Check" beat.

Per-pack settings: `timer_ms` (default 20000).

Pack #1 ships in this batch: `gewaltenteilung-ch.json` (3 A/B questions).

## New: host view

`?session=<id>&host=1` → full-screen view for the beamer:
- Big QR code of the join URL (embed a small MIT QR generator, e.g. qrcode-generator;
  no runtime CDN)
- Live top-10 leaderboard, polling Supabase every 3–5 s
- Player count

## Supabase (fresh project — Rafa creates it, then pastes URL + anon key into config)

```sql
create table dm_scores (
  id uuid primary key default gen_random_uuid(),
  session text not null,
  name varchar(14) not null,
  score int not null,
  correct int not null,
  total int not null,
  created_at timestamptz default now()
);
alter table dm_scores enable row level security;
create policy "anon insert" on dm_scores for insert to anon with check (true);
create policy "anon read"   on dm_scores for select to anon using (true);
```

Mirror the wedding app's client pattern (anon key, insert + read, fallback when
unreachable).

## Ops: free-tier pausing

Supabase free projects pause after ~7 days without API activity; DM meets ~monthly, so
the project would sleep before every session. Add `.github/workflows/keep-alive.yml`:
cron twice a week, one REST `select` on `dm_scores` (URL + anon key as repo secrets).
Still worth a 30-second "project Active?" check in the dashboard before each session —
the local fallback keeps the quiz itself playable either way.

## Skin (DM/DAY8 tokens, replaces the chalet palette)

- blue `#435CC6` (primary / buttons), green `#A8D272` (correct), teal `#5EB9A9`
  (accent), cream `#FDF2D0` (postit surfaces), dark `#1B2329` (background),
  ink `#22313C` (text on light)
- Typography: Poppins (ExtraBold titles, Regular body). No polaroids, no confetti
  gimmicks — clean DAY8-card look.

## i18n

Keep the plumbing; ship **EN + DE** strings for the DM UI. FR can follow later.

## Acceptance

1. Two phones + one host view on `?session=gewaltenteilung-ch`: phones join via the
   host QR, play 3 questions, explanations show after each reveal.
2. Scores appear on the host leaderboard within 5 s of finishing.
3. A second session id yields a separate, empty leaderboard.
4. Supabase unreachable → quiz still playable, local list with 📱 indicator.
