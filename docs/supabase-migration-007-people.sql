-- dm-quiz — migration 007: the People page (the admin makes and removes moderators)
--
-- Paste the whole file into the Supabase SQL editor and press Run. Safe to run
-- again: every step checks what is already there. The last result table shows
-- one ✅ or ❌ line per check. Undo: docs/supabase-migration-007-rollback.sql.
--
-- Why (Rafa, 05.11.2026, mock A «Tap a person»): moderators were made by pasting
-- SQL into dm_admins and invited from the Supabase dashboard. The People page
-- (dmatters.org/?view=people, linked from the Moderator kit) replaces that.
-- Only the admin may make or remove moderators; nobody can lock the admin out.
--
-- What this creates or changes, all in the schema «dm», nothing else:
--   dm_admins       two new columns:
--                     role      'admin' or 'moderator' (every existing row is
--                               'moderator', except the one below)
--                     added_by  who made this person a moderator
--                   the admin = the row added first (yours since migration 005,
--                   18.09.2026). Check 2 below shows its email. Nothing else in
--                   the table changes: everyone in it still sees the Moderator kit.
--                   Logged-in users keep reading their own row, and lose the table
--                   rights to write it (row-level security already refused that).
--   dm_invites      new table: email, invited_by, invited_at. One row per invite
--                   that has not been accepted yet. Nobody reads or writes it
--                   directly; only the functions below do.
--   functions       each one checks on the server who is calling, and refuses
--                   (error 42501) when it is not the admin:
--     dm_is_people_admin()        true only for the admin
--     dm_people()                 the My DM accounts (anyone who has logged in to
--                                 My DM, every moderator, every open invite) with
--                                 email, quiz name, role, dates. Admin only.
--     dm_set_moderator(uid, on)   switch moderator on or off. Admin only; never the
--                                 admin's own row, never another admin.
--     dm_invite_moderator(email)  existing account: moderator at once. New email:
--                                 an invite row; the page then has Supabase send the
--                                 person a sign-in mail. Admin only.
--     dm_cancel_invite(email)     removes an open invite. Admin only.
--     dm_claim_invite()           the invited person, after opening the link in the
--                                 mail, choosing a password and signing out every
--                                 other device: becomes moderator. Only for the
--                                 address that was invited, only within 14 days,
--                                 only from a session that came from the mail link.
--
-- What this does NOT touch: the players, answers, stars and the other DM tables;
-- dm_is_admin() (still «is in dm_admins», so moderators keep exactly what they
-- have today); the auth users themselves; the schema «noeggi». No mail is sent by
-- running this. The service key is not needed and not used.
--
-- Needs 006 (DM in the schema «dm»). If DM is still in «public», this stops before
-- changing anything and says so.

-- ------------------------------------------------------------ before counts
create temp table if not exists _dm007_before (n bigint);
truncate _dm007_before;

do $$
begin
  if to_regclass('dm.dm_admins') is null then
    if to_regclass('public.dm_admins') is not null then
      raise exception 'DM is still in the schema public: run docs/supabase-migration-006-dm-schema.sql first (nothing was changed)';
    end if;
    raise exception 'dm_admins not found: run docs/supabase-migration-005.sql and 006 first (nothing was changed)';
  end if;
end $$;

insert into _dm007_before select count(*) from dm.dm_admins;

-- ------------------------------------------------------------------ roles
alter table dm.dm_admins add column if not exists role text not null default 'moderator';
alter table dm.dm_admins add column if not exists added_by uuid references auth.users (id) on delete set null;
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'dm_admins_role_check' and conrelid = 'dm.dm_admins'::regclass) then
    alter table dm.dm_admins add constraint dm_admins_role_check check (role in ('admin', 'moderator'));
  end if;
end $$;

-- only the functions below write dm_admins (row-level security already allowed no
-- writes; this takes the table rights away too). Reading one's own row stays.
revoke insert, update, delete, truncate on dm.dm_admins from anon, authenticated;

-- the admin: the row added first, only if there is no admin yet (a second run changes nothing)
update dm.dm_admins set role = 'admin'
 where not exists (select 1 from dm.dm_admins where role = 'admin')
   and user_id = (select user_id from dm.dm_admins order by added_at nulls last, user_id limit 1);

-- ------------------------------------------------------------------ invites
create table if not exists dm.dm_invites (
  email      text primary key check (email = lower(email) and length(email) <= 254),
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now()
);
alter table dm.dm_invites enable row level security;
-- no policy and no grant: only the security-definer functions below read or write it
revoke all on dm.dm_invites from anon, authenticated;

-- ------------------------------------------------------------- functions
-- security definer: they run with the owner's rights, so each one checks the caller
-- itself. search_path is empty and every name is qualified (like 006).

create or replace function dm.dm_is_people_admin() returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (select 1 from dm.dm_admins where user_id = auth.uid() and role = 'admin')
$$;

create or replace function dm.dm_people()
  returns table (user_id uuid, email text, name text, role text, moderator_since timestamptz,
                 account_since timestamptz, last_seen timestamptz, invited_at timestamptz, is_me boolean)
  language plpgsql stable security definer set search_path = '' as $$
begin
  if not dm.dm_is_people_admin() then
    raise exception 'only the admin can see this list' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text,
           (select p.name::text from dm.dm_players p
             where p.token in (select d.token from dm.dm_identities d where d.user_id = u.id
                               union select l.token_b from dm.dm_token_links l
                                       join dm.dm_identities d on d.token = l.token_a where d.user_id = u.id)
             order by p.joined_at desc nulls last limit 1),
           a.role, a.added_at, u.created_at, u.last_sign_in_at, i.invited_at, u.id = auth.uid()
      from auth.users u
      left join dm.dm_admins a on a.user_id = u.id
      left join dm.dm_invites i on i.email = lower(u.email)
     where a.user_id is not null or i.email is not null
        or exists (select 1 from dm.dm_identities d where d.user_id = u.id)
    union all
    select null::uuid, i.email, null::text, null::text, null::timestamptz,
           null::timestamptz, null::timestamptz, i.invited_at, false
      from dm.dm_invites i
     where not exists (select 1 from auth.users u where lower(u.email) = i.email)
    limit 2000;
end $$;

create or replace function dm.dm_set_moderator(p_user uuid, p_on boolean) returns text
  language plpgsql volatile security definer set search_path = '' as $$
declare e text;
begin
  if not dm.dm_is_people_admin() then
    raise exception 'only the admin can change moderators' using errcode = '42501';
  end if;
  if p_user is null or p_on is null then
    raise exception 'missing argument' using errcode = '22004';
  end if;
  if p_user = auth.uid() then
    raise exception 'you cannot change your own access' using errcode = '42501';
  end if;
  if exists (select 1 from dm.dm_admins where user_id = p_user and role = 'admin') then
    raise exception 'an admin cannot be changed here' using errcode = '42501';
  end if;
  select lower(u.email) into e from auth.users u where u.id = p_user;
  if not found then
    raise exception 'no such account' using errcode = 'P0002';
  end if;
  if p_on then
    insert into dm.dm_admins (user_id, role, added_by) values (p_user, 'moderator', auth.uid())
      on conflict (user_id) do nothing;
  else
    delete from dm.dm_admins where user_id = p_user and role = 'moderator';
  end if;
  delete from dm.dm_invites where email = e;
  return case when p_on then 'moderator' else 'player' end;
end $$;

create or replace function dm.dm_invite_moderator(p_email text) returns text
  language plpgsql volatile security definer set search_path = '' as $$
declare e text := lower(btrim(coalesce(p_email, ''))); uid uuid;
begin
  if not dm.dm_is_people_admin() then
    raise exception 'only the admin can invite moderators' using errcode = '42501';
  end if;
  if length(e) > 254 or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    raise exception 'not an email address' using errcode = '22023';
  end if;
  select u.id into uid from auth.users u where lower(u.email) = e limit 1;
  if uid is not null and exists (select 1 from dm.dm_admins where user_id = uid) then
    return 'already';
  end if;
  -- an account that existed before any invite: the admin knows the person, moderator at once
  if uid is not null and not exists (select 1 from dm.dm_invites where email = e) then
    insert into dm.dm_admins (user_id, role, added_by) values (uid, 'moderator', auth.uid())
      on conflict (user_id) do nothing;
    return 'moderator';
  end if;
  -- a new address, or an invite sent again: the person has to open the link in the mail
  insert into dm.dm_invites (email, invited_by) values (e, auth.uid())
    on conflict (email) do update set invited_at = now(), invited_by = excluded.invited_by;
  return 'invite';
end $$;

create or replace function dm.dm_cancel_invite(p_email text) returns text
  language plpgsql volatile security definer set search_path = '' as $$
begin
  if not dm.dm_is_people_admin() then
    raise exception 'only the admin can cancel invites' using errcode = '42501';
  end if;
  delete from dm.dm_invites where email = lower(btrim(coalesce(p_email, '')));
  return case when found then 'cancelled' else 'none' end;
end $$;

-- The invited person, right after the mail link: proves the inbox is theirs (the session
-- came from the link, not from a password) and that nobody else is signed in to the
-- account (someone who registered the address first and knows its password is shut out:
-- the page sets the new password and signs out every other device before calling this).
create or replace function dm.dm_claim_invite() returns text
  language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); e text; j jsonb := auth.jwt(); amr jsonb; sid text;
begin
  if uid is null then return 'none'; end if;
  select lower(u.email) into e from auth.users u where u.id = uid;
  if e is null or not exists (select 1 from dm.dm_invites i
                               where i.email = e and i.invited_at > now() - interval '14 days') then
    return 'none';
  end if;
  amr := coalesce(j -> 'amr', '[]'::jsonb);
  if jsonb_typeof(amr) <> 'array' or not exists (
       select 1 from jsonb_array_elements(amr) x
        where x ->> 'method' in ('otp', 'magiclink', 'invite', 'recovery', 'email/signup', 'signup')) then
    return 'not-from-link';
  end if;
  sid := j ->> 'session_id';
  if sid is null or exists (select 1 from auth.sessions s
                             where s.user_id = uid and s.id::text <> sid
                               and (s.not_after is null or s.not_after > now())) then
    return 'other-sessions';
  end if;
  if exists (select 1 from dm.dm_admins where user_id = uid) then
    delete from dm.dm_invites where email = e;
    return 'moderator';
  end if;
  insert into dm.dm_admins (user_id, role, added_by)
    select uid, 'moderator', i.invited_by from dm.dm_invites i where i.email = e
    on conflict (user_id) do nothing;
  delete from dm.dm_invites where email = e;
  return 'moderator';
end $$;

-- who may call what: nobody by default; logged-in users the functions (which then check
-- the caller); anon only dm_is_people_admin (always false for anon)
do $$
declare f text;
begin
  foreach f in array array['dm_is_people_admin()', 'dm_people()', 'dm_set_moderator(uuid,boolean)',
    'dm_invite_moderator(text)', 'dm_cancel_invite(text)', 'dm_claim_invite()'] loop
    execute format('revoke all on function dm.%s from public, anon, authenticated', f);
    execute format('grant execute on function dm.%s to authenticated', f);
  end loop;
end $$;
grant execute on function dm.dm_is_people_admin() to anon;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------- checks
-- Each check runs as the role it is about, then the results are the last table.
-- The checks change nothing: every call that would change something is one that
-- must be refused.
create temp table if not exists _dm007_check (n int, check_name text, ok boolean, detail text);
truncate _dm007_check;

do $$
declare
  v bigint; w bigint; admin_id text; mod_id text; s text; refused boolean;
begin
  select count(*) into v from information_schema.columns
   where table_schema = 'dm' and table_name = 'dm_admins' and column_name in ('role', 'added_by');
  insert into _dm007_check values (1, 'dm_admins has role and added_by', v = 2, v || ' of 2 columns');

  select count(*), string_agg(u.email, ', ') into v, s
    from dm.dm_admins a left join auth.users u on u.id = a.user_id where a.role = 'admin';
  insert into _dm007_check values (2, 'Exactly one admin (only they change moderators)', v = 1,
    coalesce(s, 'nobody: dm_admins is empty, flag the admin with migration 005 first'));

  select count(*) into v from dm.dm_admins;
  select n into w from _dm007_before;
  select string_agg(coalesce(u.email, a.user_id::text), ', ') into s
    from dm.dm_admins a left join auth.users u on u.id = a.user_id where a.role = 'moderator';
  insert into _dm007_check values (3, 'Everyone in dm_admins is still there (Moderator kit unchanged)', v = w,
    w || ' before, ' || v || ' after · moderators: ' || coalesce(s, 'none besides the admin'));

  -- the claim function reads auth.sessions (who else is signed in): the owner must be able to
  begin
    perform 1 from auth.sessions limit 1;
    insert into _dm007_check values (4, 'Invite check can see sign-ins (auth.sessions)', true, 'ok');
  exception when others then
    insert into _dm007_check values (4, 'Invite check can see sign-ins (auth.sessions)', false, sqlerrm);
  end;

  -- as anon (anyone with the public key)
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  set local role anon;
  begin perform * from dm.dm_people(); refused := false; exception when others then refused := true; end;
  begin perform * from dm.dm_invites; v := 1; exception when others then v := 0; end;
  reset role;
  insert into _dm007_check values
    (5, 'Anon cannot list accounts', refused, case when refused then 'refused' else 'LISTED' end),
    (6, 'Anon cannot read invites', v = 0, case when v = 0 then 'refused' else 'READ' end);

  -- as a logged-in user who is not in dm_admins (a random id)
  perform set_config('request.jwt.claims',
    json_build_object('role', 'authenticated', 'sub', gen_random_uuid())::text, true);
  set local role authenticated;
  begin perform * from dm.dm_people(); refused := false; exception when others then refused := true; end;
  begin perform dm.dm_invite_moderator('nobody@example.org'); v := 0; exception when others then v := 1; end;
  begin perform dm.dm_set_moderator(gen_random_uuid(), true); w := 0; exception when others then w := 1; end;
  reset role;
  insert into _dm007_check values (7, 'Logged-in non-moderator cannot list, invite or switch', refused and v = 1 and w = 1,
    case when refused and v = 1 and w = 1 then 'all three refused' else 'NOT REFUSED' end);

  -- as a moderator who is not the admin
  select a.user_id::text into mod_id from dm.dm_admins a where a.role = 'moderator' limit 1;
  if mod_id is not null then
    perform set_config('request.jwt.claims',
      json_build_object('role', 'authenticated', 'sub', mod_id)::text, true);
    set local role authenticated;
    begin perform * from dm.dm_people(); refused := false; exception when others then refused := true; end;
    begin perform dm.dm_set_moderator(mod_id::uuid, false); v := 0; exception when others then v := 1; end;
    reset role;
    insert into _dm007_check values (8, 'A moderator cannot list or switch (only the admin can)', refused and v = 1,
      case when refused and v = 1 then 'refused' else 'NOT REFUSED' end);
  else
    insert into _dm007_check values (8, 'A moderator cannot list or switch (only the admin can)', true,
      'no moderator besides the admin yet, nothing to test');
  end if;

  -- as the admin
  select a.user_id::text into admin_id from dm.dm_admins a where a.role = 'admin' limit 1;
  if admin_id is not null then
    perform set_config('request.jwt.claims',
      json_build_object('role', 'authenticated', 'sub', admin_id)::text, true);
    set local role authenticated;
    select count(*) into v from dm.dm_people();
    begin perform dm.dm_set_moderator(admin_id::uuid, false); refused := false; exception when others then refused := true; end;
    reset role;
    insert into _dm007_check values
      (9, 'The admin sees the My DM accounts', v > 0, v || ' accounts and invites'),
      (10, 'The admin cannot switch themselves off', refused, case when refused then 'refused' else 'NOT REFUSED' end);
  else
    insert into _dm007_check values
      (9, 'The admin sees the My DM accounts', false, 'no admin (see check 2)'),
      (10, 'The admin cannot switch themselves off', false, 'no admin (see check 2)');
  end if;
  perform set_config('request.jwt.claims', '', true);
end $$;

select case when ok then '✅' else '❌' end as " ", check_name, detail
  from _dm007_check order by n;
