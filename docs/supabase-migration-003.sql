-- dm-quiz — migration 003: scope the roster to the round
--
-- Run once in the Supabase SQL editor. New projects can just run
-- docs/supabase.sql, which already includes this.
--
-- The bug: dm_players was unique on (session, token) with no round, so a row
-- written the first time someone joined stayed in the roster forever. Opening
-- a fresh game showed players from a session hours earlier.
--
-- That is worse than cosmetic. The host reveals a question automatically once
-- answers >= players, so a leftover player who will never answer makes the
-- count unreachable and the auto-advance never fires — the host has to press
-- "Show answer" for every single question.
--
-- Scoping the roster to the round makes "New round" clear it, exactly as it
-- already clears the answers. Players who are still on the page re-register
-- themselves for the new round automatically, so nobody retypes a name.

alter table dm_players add column if not exists round int not null default 0;

alter table dm_players drop constraint if exists dm_players_session_token_key;
alter table dm_players add  constraint dm_players_session_token_round_key
  unique (session, token, round);

drop index if exists dm_players_session_idx;
create index dm_players_session_idx on dm_players (session, round, joined_at);
