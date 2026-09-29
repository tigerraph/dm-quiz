-- dm-quiz — migration 006: DM moves out of «public» into its own schema «dm»
--
-- Paste the whole file into the Supabase SQL editor and press Run. Safe to run
-- again: every step checks what is already there. The last result table shows
-- one ✅ or ❌ line per check. Undo: docs/supabase-migration-006-rollback.sql.
--
-- Why (Rafa, 18.09.2026): one Supabase project, two apps, never crossed. The
-- wedding quiz (noeggi-kahoot) already lives in the schema «noeggi»; DM was the
-- one app still sitting in «public». After this, each app has its own schema
-- and its own grants, and neither can reach the other by a missing prefix.
--
-- What moves (ALTER ... SET SCHEMA keeps every row, index, constraint, RLS
-- policy and grant; nothing is copied or dropped):
--   tables     dm_players dm_answers dm_state dm_kicks dm_stars
--              dm_token_links dm_identities dm_admins
--   functions  dm_is_admin dm_roster dm_round_answers dm_session_stars
--              dm_stars_for_tokens dm_rescue_tokens        (from migration 005)
-- The function bodies of 005 name public.dm_* and set search_path = public,
-- so they are rewritten for «dm» (search_path empty, every name qualified).
-- The policies that call dm_is_admin() follow the function by its id.
--
-- AFTER RUNNING: add «dm» to Project Settings -> Data API -> Exposed schemas
-- (keep public, graphql_public and noeggi). Until that is saved, the app gets
-- 406 for «dm», falls back to public, finds nothing there and shows solo mode.
-- The window is the minute between Run and Save; do it outside a session.
--
-- Needs 005 (dm_admins). Does not touch the schema «noeggi» or anything else.

-- ------------------------------------------------------------ before counts
create temp table if not exists _dm006_before (tbl text primary key, n bigint);
truncate _dm006_before;
create temp table if not exists _dm006_noeggi (n bigint);
truncate _dm006_noeggi;
insert into _dm006_noeggi
  select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'noeggi';

-- ------------------------------------------------------------------- move
-- One DO block = one transaction: either everything moves or nothing does.
do $$
declare
  t text; f text; n bigint;
  in_public boolean; in_dm boolean;
  tabs text[] := array['dm_players','dm_answers','dm_state','dm_kicks','dm_stars',
                       'dm_token_links','dm_identities','dm_admins'];
  fns  text[] := array['dm_is_admin()','dm_roster(text,int)','dm_round_answers(text,int)',
                       'dm_session_stars(text)','dm_stars_for_tokens(text[])',
                       'dm_rescue_tokens(text,text)'];
begin
  if to_regclass('public.dm_admins') is null and to_regclass('dm.dm_admins') is null then
    raise exception 'dm_admins not found: run docs/supabase-migration-005.sql first';
  end if;

  create schema if not exists dm;

  foreach t in array tabs loop
    in_public := to_regclass('public.' || t) is not null;
    in_dm     := to_regclass('dm.' || t) is not null;
    if in_public and in_dm then
      raise exception 'both public.% and dm.% exist: resolve by hand, nothing was moved', t, t;
    end if;
    if not in_public and not in_dm then
      raise exception 'table % is in neither public nor dm: wrong project?', t;
    end if;
    execute format('select count(*) from %s.%I', case when in_dm then 'dm' else 'public' end, t) into n;
    insert into _dm006_before values (t, n);
    if in_public then
      execute format('alter table public.%I set schema dm', t);
    end if;
  end loop;

  foreach f in array fns loop
    if to_regprocedure('public.' || f) is not null then
      if to_regprocedure('dm.' || f) is not null then
        raise exception 'both public.% and dm.% exist: resolve by hand', f, f;
      end if;
      execute format('alter function public.%s set schema dm', f);
    end if;
  end loop;
end $$;

-- --------------------------------------------------------------- grants
-- Table and function grants moved with the objects. A new schema grants
-- nothing, so the roles need USAGE to see into it at all. service_role is the
-- delete-account edge function.
grant usage on schema dm to anon, authenticated, service_role;

-- ------------------------------------------- 005's functions, now for «dm»
-- Same signatures, columns and limits as 005. CREATE OR REPLACE keeps each
-- function's id, so its grants and the policies that call it stay attached.
create or replace function dm.dm_is_admin() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from dm.dm_admins where user_id = auth.uid())
$$;

create or replace function dm.dm_roster(p_session text, p_round int)
  returns table (token text, name text)
  language sql stable security definer set search_path = '' as $$
  select p.token, p.name::text from dm.dm_players p
   where p.session = p_session and p.round = p_round
   order by p.joined_at limit 200
$$;

create or replace function dm.dm_round_answers(p_session text, p_round int)
  returns table (token text, name text, q_index int, choice int, correct boolean, points int)
  language sql stable security definer set search_path = '' as $$
  select a.token, a.name::text, a.q_index, a.choice, a.correct, a.points from dm.dm_answers a
   where a.session = p_session and a.round = p_round
   limit 2000
$$;

create or replace function dm.dm_session_stars(p_session text)
  returns table (token text, name text)
  language sql stable security definer set search_path = '' as $$
  select s.token, s.name::text from dm.dm_stars s
   where s.session = p_session
   order by s.created_at limit 500
$$;

create or replace function dm.dm_stars_for_tokens(p_tokens text[])
  returns table (id uuid, token text, pillar text, topic text, session text, awarded_on date, source text)
  language sql stable security definer set search_path = '' as $$
  select s.id, s.token, s.pillar, s.topic, s.session, s.awarded_on, s.source from dm.dm_stars s
   where s.token = any (p_tokens[1:500])
   order by s.awarded_on limit 500
$$;

create or replace function dm.dm_rescue_tokens(p_name text, p_fp text)
  returns table (token text)
  language sql stable security definer set search_path = '' as $$
  select distinct p.token from dm.dm_players p
   where p_fp is not null and p_fp <> '' and p.name = p_name and p.fp = p_fp
   limit 200
$$;

-- re-assert 005's execute rights (a no-op when they moved along, which they do)
do $$
declare f text;
begin
  foreach f in array array['dm_is_admin()', 'dm_roster(text,int)', 'dm_round_answers(text,int)',
    'dm_session_stars(text)', 'dm_stars_for_tokens(text[])', 'dm_rescue_tokens(text,text)'] loop
    execute format('revoke all on function dm.%s from public', f);
    execute format('grant execute on function dm.%s to anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- checks
-- Each check runs as the role it is about, then the results are the last table.
create temp table if not exists _dm006_check (n int, check_name text, ok boolean, detail text);
truncate _dm006_check;

do $$
declare
  v bigint; w bigint; x bigint; y bigint; z bigint; t text;
  bad text; admin_id text;
  some_session text; some_round int;
begin
  -- 1-3: everything is in dm, nothing DM is left in public
  select count(*) into v from pg_tables where schemaname = 'dm' and tablename like 'dm\_%';
  insert into _dm006_check values (1, 'All 8 DM tables are in schema dm', v = 8, v || ' tables in dm');

  select string_agg(tablename, ', ') into bad from pg_tables
   where schemaname = 'public' and tablename like 'dm\_%';
  insert into _dm006_check values (2, 'No DM table left in public', bad is null, coalesce(bad, 'none'));

  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'dm\_%';
  insert into _dm006_check values (3, 'No DM function left in public', bad is null, coalesce(bad, 'none'));

  -- 4: no row lost
  bad := null;
  for t, w in select tbl, n from _dm006_before loop
    execute format('select count(*) from dm.%I', t) into v;
    if v <> w then bad := concat_ws(', ', bad, t || ' ' || w || '→' || v); end if;
  end loop;
  select sum(n) into v from _dm006_before;
  insert into _dm006_check values (4, 'Every row moved', bad is null,
    coalesce('changed: ' || bad, v || ' rows over 8 tables, same as before'));

  -- 5: function bodies no longer point at public
  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'dm' and p.prosrc ilike '%public.%';
  insert into _dm006_check values (5, 'DM functions read only from dm', bad is null, coalesce('still public: ' || bad, 'ok'));

  -- 6: the wedding quiz's schema is untouched
  select count(*) into v from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'noeggi';
  select n into w from _dm006_noeggi;
  insert into _dm006_check values (6, 'Schema noeggi untouched', v = w, w || ' objects before, ' || v || ' after');

  select session, round into some_session, some_round from dm.dm_players order by joined_at desc limit 1;

  -- 7-10: as anon (anyone with the public key)
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into v from dm.dm_players;
  select count(*) into w from dm.dm_stars;
  select count(*) into y from dm.dm_roster(some_session, some_round);
  select count(*) into z from dm.dm_state;
  reset role;
  select count(*) into x from dm.dm_state;
  insert into _dm006_check values
    (7, 'Anon still cannot list players', v = 0, v || ' rows visible'),
    (8, 'Anon still cannot list stars',   w = 0, w || ' rows visible'),
    (9, 'Live roster works through dm.dm_roster', some_session is null or y > 0,
        coalesce('session «' || some_session || '»: ' || y || ' players', 'no players yet, nothing to test')),
    (10, 'Anon reads game state in dm', z = x, z || ' of ' || x || ' dm_state rows');

  -- 11: as the admin
  select a.user_id::text into admin_id from dm.dm_admins a limit 1;
  if admin_id is not null then
    perform set_config('request.jwt.claims',
      json_build_object('role', 'authenticated', 'sub', admin_id)::text, true);
    set local role authenticated;
    select count(*) into v from dm.dm_players;
    select count(*) into x from dm.dm_stars;
    reset role;
    select count(*) into w from dm.dm_players;
    select count(*) into y from dm.dm_stars;
    insert into _dm006_check values
      (11, 'Admin still sees all players and stars', v = w and x = y, v || ' players, ' || x || ' stars');
  else
    insert into _dm006_check values (11, 'Admin still sees all players and stars', false, 'no admin in dm.dm_admins');
  end if;
  perform set_config('request.jwt.claims', '', true);
end $$;

select case when ok then '✅' else '❌' end as " ", check_name, detail
  from _dm006_check order by n;
