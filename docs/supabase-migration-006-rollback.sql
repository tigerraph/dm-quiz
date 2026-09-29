-- dm-quiz — rollback of migration 006: DM goes back from «dm» into «public»
--
-- Order matters:
--   1. FIRST remove «dm» from Project Settings -> Data API -> Exposed schemas
--      and save. The app then gets 406 for «dm» and falls back to public
--      by itself (rest() in src/template.html).
--   2. Then paste this whole file into the Supabase SQL editor and press Run.
-- The other way round, «dm» is exposed but empty for a minute, the app gets
-- 404 instead of 406 and does not fall back until step 1 is done.
--
-- Safe to run again. Moves every table and function back with its rows,
-- indexes, policies and grants, restores the function bodies of migration 005
-- word for word, and leaves the (then empty) schema «dm» in place: dropping a
-- schema that the Data API may still expose is the one step that can hurt the
-- other app in this project, so it is left for later, by hand, if wanted.
-- Does not touch the schema «noeggi».

create temp table if not exists _dm006rb_before (tbl text primary key, n bigint);
truncate _dm006rb_before;

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
    insert into _dm006rb_before values (t, n);
    if in_dm then
      execute format('alter table dm.%I set schema public', t);
    end if;
  end loop;

  foreach f in array fns loop
    if to_regprocedure('dm.' || f) is not null then
      if to_regprocedure('public.' || f) is not null then
        raise exception 'both public.% and dm.% exist: resolve by hand', f, f;
      end if;
      execute format('alter function dm.%s set schema public', f);
    end if;
  end loop;
end $$;

-- -------------------------------------------- 005's function bodies, as they were
create or replace function public.dm_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dm_admins where user_id = auth.uid())
$$;

create or replace function public.dm_roster(p_session text, p_round int)
  returns table (token text, name text)
  language sql stable security definer set search_path = public as $$
  select p.token, p.name::text from public.dm_players p
   where p.session = p_session and p.round = p_round
   order by p.joined_at limit 200
$$;

create or replace function public.dm_round_answers(p_session text, p_round int)
  returns table (token text, name text, q_index int, choice int, correct boolean, points int)
  language sql stable security definer set search_path = public as $$
  select a.token, a.name::text, a.q_index, a.choice, a.correct, a.points from public.dm_answers a
   where a.session = p_session and a.round = p_round
   limit 2000
$$;

create or replace function public.dm_session_stars(p_session text)
  returns table (token text, name text)
  language sql stable security definer set search_path = public as $$
  select s.token, s.name::text from public.dm_stars s
   where s.session = p_session
   order by s.created_at limit 500
$$;

create or replace function public.dm_stars_for_tokens(p_tokens text[])
  returns table (id uuid, token text, pillar text, topic text, session text, awarded_on date, source text)
  language sql stable security definer set search_path = public as $$
  select s.id, s.token, s.pillar, s.topic, s.session, s.awarded_on, s.source from public.dm_stars s
   where s.token = any (p_tokens[1:500])
   order by s.awarded_on limit 500
$$;

create or replace function public.dm_rescue_tokens(p_name text, p_fp text)
  returns table (token text)
  language sql stable security definer set search_path = public as $$
  select distinct p.token from public.dm_players p
   where p_fp is not null and p_fp <> '' and p.name = p_name and p.fp = p_fp
   limit 200
$$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- checks
create temp table if not exists _dm006rb_check (n int, check_name text, ok boolean, detail text);
truncate _dm006rb_check;

do $$
declare v bigint; w bigint; t text; bad text;
begin
  select count(*) into v from pg_tables where schemaname = 'public' and tablename like 'dm\_%';
  insert into _dm006rb_check values (1, 'All 8 DM tables are back in public', v = 8, v || ' tables in public');

  select string_agg(tablename, ', ') into bad from pg_tables where schemaname = 'dm';
  insert into _dm006rb_check values (2, 'Schema dm holds no table', bad is null, coalesce(bad, 'empty'));

  bad := null;
  for t, w in select tbl, n from _dm006rb_before loop
    execute format('select count(*) from public.%I', t) into v;
    if v <> w then bad := concat_ws(', ', bad, t || ' ' || w || '→' || v); end if;
  end loop;
  select sum(n) into v from _dm006rb_before;
  insert into _dm006rb_check values (3, 'Every row moved back', bad is null,
    coalesce('changed: ' || bad, v || ' rows over 8 tables, same as before'));

  select string_agg(p.proname, ', ') into bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'dm';
  insert into _dm006rb_check values (4, 'Schema dm holds no function', bad is null, coalesce(bad, 'empty'));

  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into v from public.dm_players;
  reset role;
  insert into _dm006rb_check values (5, 'Anon still cannot list players', v = 0, v || ' rows visible');
  perform set_config('request.jwt.claims', '', true);
end $$;

select case when ok then '✅' else '❌' end as " ", check_name, detail
  from _dm006rb_check order by n;
