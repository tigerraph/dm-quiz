-- dm-quiz — Supabase schema (live, host-driven mode)
--
-- Replaces the single dm_scores table in the original spec. Live mode needs
-- three things the old schema could not express: who is in the room, what
-- each player answered on each question, and which question the host has
-- currently put on the beamer.
--
-- Everything is INSERT-only. No UPDATE or DELETE is granted to anon, so a
-- participant cannot rewrite someone else's answer or edit the roster.

-- ---------------------------------------------------------------- presence
-- One row per device per session. Written when a player joins.
create table dm_players (
  id        uuid primary key default gen_random_uuid(),
  session   text not null,
  token     text not null,             -- random, generated on the device
  name      varchar(14) not null,
  round     int not null default 0,    -- so "New round" clears the roster
  joined_at timestamptz default now(),
  unique (session, token, round)
);
create index dm_players_session_idx on dm_players (session, round, joined_at);

-- ----------------------------------------------------------------- answers
-- One row per player per question. The unique constraint is what stops a
-- player answering the same question twice.
create table dm_answers (
  id         uuid primary key default gen_random_uuid(),
  session    text not null,
  token      text not null,
  name       varchar(14) not null,
  round      int not null default 0,   -- bumped by the host on "New round"
  q_index    int not null,
  choice     int,                      -- null = ran out of time
  correct    boolean not null,
  points     int not null,
  created_at timestamptz default now(),
  unique (session, token, round, q_index)
);
create index dm_answers_session_idx on dm_answers (session, round, q_index);

-- ------------------------------------------------------------- game state
-- Append-only: the host inserts a new row per beat, and every client reads
-- the newest row for the session. Append-only keeps this insert-only too.
-- phase is one of: lobby | question | reveal | done
create table dm_state (
  id         uuid primary key default gen_random_uuid(),
  session    text not null,
  phase      text not null,
  q_index    int not null default -1,
  round      int not null default 0,
  started_at timestamptz default now()
);
create index dm_state_session_idx on dm_state (session, started_at desc);

-- ------------------------------------------------------------- moderation
-- Anything typed into the name box is projected to the room, so the host needs
-- a way to take someone off the screen. Insert-only like the rest: clients
-- filter kicked tokens out of the roster, leaderboard and answer counts.
create table dm_kicks (
  id         uuid primary key default gen_random_uuid(),
  session    text not null,
  token      text not null,
  created_at timestamptz default now(),
  unique (session, token)
);
create index dm_kicks_session_idx on dm_kicks (session);

-- --------------------------------------------------------------------- RLS
alter table dm_players enable row level security;
alter table dm_answers enable row level security;
alter table dm_state   enable row level security;
alter table dm_kicks   enable row level security;

create policy "anon insert" on dm_players for insert to anon with check (true);
create policy "anon read"   on dm_players for select to anon using (true);
create policy "anon insert" on dm_answers for insert to anon with check (true);
create policy "anon read"   on dm_answers for select to anon using (true);
create policy "anon insert" on dm_state   for insert to anon with check (true);
create policy "anon read"   on dm_state   for select to anon using (true);
create policy "anon insert" on dm_kicks   for insert to anon with check (true);
create policy "anon read"   on dm_kicks   for select to anon using (true);

-- Trust model: anyone holding the anon key (i.e. anyone who scanned the QR)
-- can insert a dm_state row and therefore drive the game. That is fine for a
-- room of workshop participants and keeps the client key-free. It is NOT ok
-- for a public link — if this ever goes public, move state writes behind an
-- edge function with a host secret.
