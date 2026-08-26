-- dm-quiz — migration 002: replayable rounds + player moderation
--
-- Run this once, in the Supabase SQL editor, against an existing project that
-- already has migration 001 (docs/supabase.sql). New projects can just run
-- supabase.sql, which already includes everything below.
--
-- Two problems this fixes:
--
-- 1. "New round" did not reset. dm_answers was unique on
--    (session, token, q_index), so a returning player's second-round answer
--    was rejected as a duplicate, their first-round score stood, and the
--    leaderboard summed every round together.
--
-- 2. There was no way to take a player off the beamer. Anything typed into
--    the name box is projected to the room, and nothing could remove it.

-- ------------------------------------------------------------------ rounds
alter table dm_answers add column if not exists round int not null default 0;
alter table dm_state   add column if not exists round int not null default 0;

-- the unique key has to include the round, or a replay still collides
alter table dm_answers drop constraint if exists dm_answers_session_token_q_index_key;
alter table dm_answers add  constraint dm_answers_session_token_round_q_index_key
  unique (session, token, round, q_index);

drop index if exists dm_answers_session_idx;
create index dm_answers_session_idx on dm_answers (session, round, q_index);

-- -------------------------------------------------------------- moderation
-- Insert-only, like everything else: the host inserts a row and every client
-- filters that token out of the roster, the leaderboard and the answer counts.
-- Nothing is deleted, so the audit trail survives.
create table if not exists dm_kicks (
  id         uuid primary key default gen_random_uuid(),
  session    text not null,
  token      text not null,
  created_at timestamptz default now(),
  unique (session, token)
);
create index if not exists dm_kicks_session_idx on dm_kicks (session);

alter table dm_kicks enable row level security;

do $$ begin
  create policy "anon insert" on dm_kicks for insert to anon with check (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "anon read" on dm_kicks for select to anon using (true);
exception when duplicate_object then null; end $$;

-- Same trust model as the rest: anyone holding the anon key can insert a kick,
-- exactly as they can insert a dm_state row and drive the game. Fine for a room
-- of workshop participants; not fine for a public link.
