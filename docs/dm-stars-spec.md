# dm-stars — Pillar Star Passport (spec, 2026-08-26)

**Goal:** participants collect a star per session in the pillar the session's
topic belongs to — like a coffee stamp card, but across the three DM
curriculum pillars. The passport ("My DM") lives in the same app as the quiz,
behind the same QR code.

Sources: Rafa's sketches ([`reference/dm-stars-sketches.pdf`](reference/dm-stars-sketches.pdf)),
the pillar overview ([`reference/dm-journey-pillars.png`](reference/dm-journey-pillars.png)),
and the Learning Loop deck (Bottom-line beat: "Collect your pillar star ★").

## Pillars and levels

Three pillars, ids fixed forever (they go into the database):

| id | EN | DE | FR | IT |
|---|---|---|---|---|
| `civics` | Civics & Basic Concepts | Staatskunde & Grundbegriffe | Civisme & concepts de base | Educazione civica & concetti di base |
| `comm` | Communication & Social Media | Kommunikation & Social Media | Communication & réseaux sociaux | Comunicazione & social media |
| `action` | Action & Mobilisation | Aktion & Mobilisierung | Action & mobilisation | Azione & mobilitazione |

- **DM Champion** — at least **3 stars in every pillar** (9+ total).
- **DM Master** — the second lap: at least **6 stars in every pillar**.
  Any 6, not 6 distinct topics.

The live deck (`slides/gewaltenteilung-ch.html`) says it right: 3★ per pillar
→ Champion, 6★ → Master. The old "3 → Master" wording survives only in
Fritz's original Canva export (`reference/DM_Format_Learning-Loop_…pdf`),
which has no editable source and stays as-is as a historical reference.

## One QR, three modes

The session QR (`?session=<id>`) is printed on the **first and the last slide**
of every session. What the phone shows depends on the newest `dm_state` row:

| Latest phase | Phone shows |
|---|---|
| none, or `done` | **My DM** passport (default resting state) |
| `lobby` / `question` / `reveal` | the quiz, exactly as today |
| `stars` *(new)* | the star-claim screen |

So scanning at the start drops you into the lobby; scanning at the end (or
still having the page open) drops you into the claim. The passport is always
reachable via a "My DM" button in the header, in every mode.

## Identity — three layers

1. **Device token** (exists today, localStorage) — the primary key for
   everything. Works with zero friction, dies with the browser data.
2. **Name + canvas fingerprint** — a *rescue hint*, not an identity. On every
   join we store a canvas-fingerprint hash next to the player row. When a
   device shows up with a fresh token but the entered name matches a previous
   player and the fingerprint is close, the app asks "Are you the Anna from
   30.1.?" — confirming inserts a link row joining the two tokens. Canvas
   output is deliberately randomized on iOS/Safari, so this is best-effort
   only and never automatic.
3. **Account** (email + password, Supabase Auth) — the real preservation
   mechanism. Logging in links the current device token to the account;
   stars follow the account across any device.

A person's stars = the stars of every token connected to them (via links or
account). Merging is computed client-side; workshop scale makes that trivial.

## Star award flow

- The host view gets an **"Award star ★"** button (available from the last
  question's reveal onward). Pressing it appends a `dm_state` row with phase
  `stars`. This is the Bottom-line beat.
- Every phone in the session — and anyone scanning the last-slide QR — sees
  the claim screen: pillar, topic, big **"Collect my star"** button.
- Claiming inserts one `dm_stars` row; `unique (session, token)` stops
  double-dipping. The window closes when the host starts the next lobby.
- The star's **pillar** comes from the session registry (see below); its
  **topic** is the pack title; its **date** is the claim date. The passport
  renders exactly the sketch: one row per pillar, stars with dates.

## Manual star add — host only

Host view, "Add a star" form: pick a person **from the roster** (anyone who
has ever joined a session, from `dm_players`), pick the pillar (required),
topic name and date optional. Inserts a `dm_stars` row with `source =
'manual'`. Paper-era backfill: the person scans the QR and enters their name
once, then the host adds their old stars.

(As with everything else here, "host only" is a UI convention, not enforced —
same trust model as driving the quiz.)

## My DM page

Per the sketch:

- Passport: the three pillar rows, earned stars with dates, progress to the
  next level (Champion → Master).
- Name (editable — writes a new `dm_players`-style row, newest wins).
- Account block: create account / log in (email + password), change password,
  **delete account**. Change password is plain Supabase Auth. Delete cannot
  be done from the client — the database is insert-only for anon — so it
  needs a small **Edge Function** using the service role, or stays "email
  Rafa" in v1. Spec'd as Edge Function, built last.

## Demo accounts

`?demo=1` on the player URL loads a canned local passport (no database
writes): one profile mid-way (2/1/0 stars), one fresh Champion, one one star
short of Master. For testing the claim flow end-to-end, use the existing
`probe` session against the real database.

## Registry change

Each entry in `packs/sessions.json` gets a `pillar` field:

```json
"gewaltenteilung-ch": { "pack": "...", "pillar": "civics", ... }
```

`probe` gets `"pillar": "civics"` too — probe claims are real rows, filter by
session when counting anything that matters.

## Schema — migration 004

Canonical file: [`supabase-migration-004.sql`](supabase-migration-004.sql).
(003 is the earlier roster-round fix — unrelated.)
One addition over the sketch below: `dm_token_links.method` also allows
`'device'` — a link written on every join between the stable device id and
the per-session quiz token, so stars keyed either way land in one passport.

```sql
-- stars: one row per star, insert-only like everything else
create table dm_stars (
  id         uuid primary key default gen_random_uuid(),
  token      text not null,             -- device that claimed / was picked
  name       varchar(14) not null,
  pillar     text not null check (pillar in ('civics','comm','action')),
  session    text,                      -- null for manual adds
  topic      text,                      -- display name; pack title for claims
  awarded_on date not null default current_date,
  source     text not null default 'claim' check (source in ('claim','manual')),
  created_at timestamptz default now(),
  unique (session, token)
);
create index dm_stars_token_idx on dm_stars (token);

-- fingerprint hint on the roster
alter table dm_players add column if not exists fp text;

-- token↔token links (fingerprint rescue, host merge)
create table dm_token_links (
  id         uuid primary key default gen_random_uuid(),
  token_a    text not null,
  token_b    text not null,
  method     text not null check (method in ('fingerprint','host')),
  created_at timestamptz default now(),
  unique (token_a, token_b)
);

-- account↔token links; requires a logged-in user
create table dm_identities (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  token      text not null,
  created_at timestamptz default now(),
  unique (user_id, token)
);

alter table dm_stars       enable row level security;
alter table dm_token_links enable row level security;
alter table dm_identities  enable row level security;

create policy "anon insert" on dm_stars       for insert to anon with check (true);
create policy "anon read"   on dm_stars       for select to anon using (true);
create policy "anon insert" on dm_token_links for insert to anon with check (true);
create policy "anon read"   on dm_token_links for select to anon using (true);
create policy "auth insert" on dm_identities  for insert to authenticated
  with check (auth.uid() = user_id);
create policy "anon read"   on dm_identities  for select to anon using (true);
```

Note `unique (session, token)` allows one star per session id — if a session
id is ever re-run on a later date, give the rerun its own id (registry
entries are cheap).

Trust model unchanged: anyone with the anon key can insert stars for any
token. Fine for a room; not fine for a public link. If stars ever gate
anything real, claims move behind an edge function.

## Build order

1. ~~Migration 004~~ — applied.
2. ~~Passport view + mode switch + `stars` phase + claim flow + host button.~~ Live.
3. ~~Manual add form in the host view.~~ Live.
4. ~~Fingerprint hint + rescue prompt.~~ Built — join stores a canvas-hash in
   `dm_players.fp`; a fresh device joining with a known name + matching hash
   is offered "Are you the Anna with n ★?"; accepting writes a
   `dm_token_links` row (`method: fingerprint`). Never automatic.
5. ~~Accounts.~~ Built — email+password via GoTrue REST, no SDK. Signup/login
   links the device id into `dm_identities`; the passport closure follows
   the account across devices. Change password inline; logout.
   **Rafa, once:** in the
   [Auth settings](https://supabase.com/dashboard/project/bvglvdcndhqrvpnghrkp/auth/providers)
   either disable "Confirm email" (zero-friction, recommended for workshops)
   or leave it on — the UI copes ("confirm your email, then log in"), but
   Supabase's default mailer sends only a few mails per hour.
6. ~~Delete-account edge function.~~ Written at
   `supabase/functions/delete-account/index.ts` — deletes the calling user
   plus their identity links (star rows stay; they are pseudonymous tokens).
   **Rafa, once:** `supabase functions deploy delete-account --project-ref
   bvglvdcndhqrvpnghrkp`. Until deployed, the button soft-fails with "ask
   the moderator".
7. ~~Update Learning Loop slide (Champion).~~ Done in the live deck
   (`slides/gewaltenteilung-ch.html`, babc10d). Demo mode shipped.
   **Everything in this spec is now live.**

## Open items (post-v1, Rafa 2026-08-27)

- **Forgot password** — decided: build later. Logged-in change-password
  exists; a forgotten password currently has no recovery. Needs GoTrue
  `/recover` plus redirect handling back into the app.
- **Rescue only fires at lobby join.** Someone who scans only during the
  claim window enters a name there but is never offered the restore prompt.
  Small extension if it ever bites.
- **Trust hardening, when stars gate something real.** Today anyone with the
  anon key can insert stars (same open model as the quiz). Escalation path,
  cheapest first: (a) a short claim code shown on the beamer during the
  claim window, required to collect; (b) awards behind an edge function
  with a host secret, removing the anon insert on `dm_stars` entirely.
  Decision deferred until it matters.
