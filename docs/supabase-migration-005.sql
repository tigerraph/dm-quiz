-- dm-quiz — migration 005: admins, and people's names only for admins
--
-- Paste the whole file into the Supabase SQL editor and press Run. Safe to run
-- again: every step checks what is already there. The last result table shows
-- one ✅ or ❌ line per check.
--
-- Why (Rafa, 18.09.2026): the admin page lists people and their stars, and the
-- site is public. Until now anyone holding the anon key (it ships in the page)
-- could read every name in dm_players, dm_answers and dm_stars.
--
-- After this migration:
--   * dm_admins holds the Supabase Auth users who are admins; each user can read
--     only their own row, which is how the app knows whether to show admin entries.
--   * anon can no longer select from dm_players, dm_answers or dm_stars. Admins
--     (logged in) read them directly; the admin page and the host's manual star
--     add use that.
--   * The live game and the passport read through narrow functions instead:
--       dm_roster(session, round)          the room's roster, one session at a time
--       dm_round_answers(session, round)   that round's answers, for the leaderboard
--       dm_session_stars(session)          who claimed this session's star
--       dm_stars_for_tokens(tokens[])      a passport's own stars, no names
--       dm_rescue_tokens(name, fp)         rescue-flow candidates, tokens only
--     None of them lists people across sessions.
--   * Inserts: anon may still join, answer and claim a session star; a manual
--     star (source 'manual') needs an admin.
--
-- dm_state, dm_kicks, dm_token_links and dm_identities hold no names and stay
-- as they are.

-- the admin: the email of the My DM account to flag ---------------------------
-- The repo keeps a placeholder (the site and this repo are public); the copy
-- handed over for the SQL editor carries the real address. With the placeholder
-- nothing is flagged and check 1 below shows ❌. More admins: run again with
-- another email, or insert into dm_admins by hand.
create temp table if not exists _dm005_admin_email (email text);
truncate _dm005_admin_email;
insert into _dm005_admin_email values ('__ADMIN_EMAIL__');

-- ------------------------------------------------------------------ admins
create table if not exists public.dm_admins (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  added_at timestamptz default now()
);
alter table public.dm_admins enable row level security;
drop policy if exists "own row" on public.dm_admins;
create policy "own row" on public.dm_admins for select to authenticated
  using (user_id = auth.uid());
grant select on public.dm_admins to authenticated;

insert into public.dm_admins (user_id)
  select u.id from auth.users u join _dm005_admin_email e on lower(u.email) = lower(e.email)
  on conflict (user_id) do nothing;

create or replace function public.dm_is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dm_admins where user_id = auth.uid())
$$;
revoke all on function public.dm_is_admin() from public;
grant execute on function public.dm_is_admin() to anon, authenticated;

-- --------------------------------------------------- reads: admins only
drop policy if exists "anon read"  on public.dm_players;
drop policy if exists "anon read"  on public.dm_answers;
drop policy if exists "anon read"  on public.dm_stars;
drop policy if exists "admin read" on public.dm_players;
drop policy if exists "admin read" on public.dm_answers;
drop policy if exists "admin read" on public.dm_stars;
create policy "admin read" on public.dm_players for select to authenticated using (public.dm_is_admin());
create policy "admin read" on public.dm_answers for select to authenticated using (public.dm_is_admin());
create policy "admin read" on public.dm_stars   for select to authenticated using (public.dm_is_admin());

-- ------------------------------------------ star inserts: claims vs manual
drop policy if exists "anon insert"  on public.dm_stars;
drop policy if exists "anon claim"   on public.dm_stars;
drop policy if exists "admin insert" on public.dm_stars;
create policy "anon claim" on public.dm_stars for insert to anon
  with check (source = 'claim' and session is not null);
create policy "admin insert" on public.dm_stars for insert to authenticated
  with check (public.dm_is_admin());

-- ------------------------------------------------ narrow reads for the app
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

do $$
declare f text;
begin
  foreach f in array array[
    'dm_roster(text,int)', 'dm_round_answers(text,int)', 'dm_session_stars(text)',
    'dm_stars_for_tokens(text[])', 'dm_rescue_tokens(text,text)'] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- checks
-- Each check runs as the role it is about (anon, or a logged-in non-admin),
-- then the results are shown as the last table.
create temp table if not exists _dm005_check (n int, check_name text, ok boolean, detail text);
truncate _dm005_check;

do $$
declare
  v int; w int; x int; y int; z int;
  admins text;
  some_session text; some_round int;
begin
  select string_agg(u.email, ', ') into admins
    from public.dm_admins a join auth.users u on u.id = a.user_id;
  insert into _dm005_check values (1, 'Admin account flagged', admins is not null,
    coalesce(admins, 'no auth user with the email at the top of this file: sign up in My DM first, then run again'));

  select session, round into some_session, some_round from public.dm_players order by joined_at desc limit 1;

  -- as anon (anyone with the public key)
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  select count(*) into v from public.dm_players;
  select count(*) into w from public.dm_answers;
  select count(*) into x from public.dm_stars;
  select count(*) into y from public.dm_roster(some_session, some_round);
  select count(*) into z from public.dm_admins;
  reset role;
  insert into _dm005_check values
    (2, 'Anon cannot list players', v = 0, v || ' rows visible'),
    (3, 'Anon cannot list answers', w = 0, w || ' rows visible'),
    (4, 'Anon cannot list stars',   x = 0, x || ' rows visible'),
    (5, 'Live roster still works for one session', some_session is null or y > 0,
        coalesce('session «' || some_session || '»: ' || y || ' players', 'no players yet, nothing to test')),
    (6, 'Anon cannot see the admin list', z = 0, z || ' rows visible');

  -- as a logged-in user who is not an admin (a random id, so never in dm_admins)
  perform set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', gen_random_uuid())::text, true);
  set local role authenticated;
  select count(*) into v from public.dm_players;
  select count(*) into x from public.dm_stars;
  reset role;
  insert into _dm005_check values
    (7, 'Logged-in non-admin cannot list players or stars', v = 0 and x = 0, v || ' players, ' || x || ' stars visible');

  -- as the admin
  select a.user_id::text into admins from public.dm_admins a limit 1;
  if admins is not null then
    perform set_config('request.jwt.claims',
      json_build_object('role', 'authenticated', 'sub', admins)::text, true);
    set local role authenticated;
    select count(*) into v from public.dm_players;
    select count(*) into x from public.dm_stars;
    reset role;
    select count(*) into w from public.dm_players;
    select count(*) into y from public.dm_stars;
    insert into _dm005_check values
      (8, 'Admin sees all players and stars', v = w and x = y, v || ' players, ' || x || ' stars');
  else
    insert into _dm005_check values (8, 'Admin sees all players and stars', false, 'no admin flagged yet (see check 1)');
  end if;
  perform set_config('request.jwt.claims', '', true);
end $$;

select case when ok then '✅' else '❌' end as " ", check_name, detail
  from _dm005_check order by n;
