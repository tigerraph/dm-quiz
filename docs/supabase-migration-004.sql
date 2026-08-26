-- dm-quiz — migration 004: pillar stars (see docs/dm-stars-spec.md)
--
-- Run once in the Supabase SQL editor. Adds the star passport tables and the
-- fingerprint column. Insert-only for anon, like everything else.

-- ------------------------------------------------------------------- stars
-- One row per star. Claims carry the session id; manual host adds carry
-- session NULL (Postgres treats NULLs as distinct, so the unique constraint
-- only ever bites on real claims: one star per session per device).
create table dm_stars (
  id         uuid primary key default gen_random_uuid(),
  token      text not null,             -- device id that claimed / was picked
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
create index dm_stars_session_idx on dm_stars (session);

-- ------------------------------------------------------------------- links
-- Same-person links between tokens. 'device' rows are written on every join
-- (stable device id <-> per-session quiz token), so stars keyed either way
-- land in the same passport. 'fingerprint' and 'host' are for the rescue
-- flow and host-side merges (later build steps).
create table dm_token_links (
  id         uuid primary key default gen_random_uuid(),
  token_a    text not null,
  token_b    text not null,
  method     text not null check (method in ('device','fingerprint','host')),
  created_at timestamptz default now(),
  unique (token_a, token_b)
);

-- --------------------------------------------------------------- accounts
-- Account <-> token links; written only by a logged-in user (build step 5).
create table dm_identities (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  token      text not null,
  created_at timestamptz default now(),
  unique (user_id, token)
);

-- ------------------------------------------------------------ fingerprint
-- Canvas-fingerprint hash next to the roster row — a rescue hint, never an
-- identity (Safari randomizes canvas output on purpose).
alter table dm_players add column if not exists fp text;

-- --------------------------------------------------------------------- RLS
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
