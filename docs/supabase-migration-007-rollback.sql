-- dm-quiz — rollback of migration 007 (the People page)
--
-- Paste the whole file into the Supabase SQL editor and press Run. Safe to run
-- again. Removes what 007 created: the six dm_* functions of the People page, the
-- table dm_invites (open invites are lost; nobody is mailed), and the columns
-- role and added_by of dm_admins. Every row of dm_admins stays, so everyone who
-- moderates today still sees the Moderator kit; the admin becomes a plain row
-- again, as before 007 (its write rights, which row-level security never let
-- anyone use, stay removed). The People page then says «waiting for the database
-- update» and changes nothing. Does not touch any other table or the schema «noeggi».

drop function if exists dm.dm_claim_invite();
drop function if exists dm.dm_cancel_invite(text);
drop function if exists dm.dm_invite_moderator(text);
drop function if exists dm.dm_set_moderator(uuid, boolean);
drop function if exists dm.dm_people();
drop function if exists dm.dm_is_people_admin();
drop table if exists dm.dm_invites;
alter table if exists dm.dm_admins drop constraint if exists dm_admins_role_check;
alter table if exists dm.dm_admins drop column if exists added_by;
alter table if exists dm.dm_admins drop column if exists role;

notify pgrst, 'reload schema';

create temp table if not exists _dm007rb_check (n int, check_name text, ok boolean, detail text);
truncate _dm007rb_check;
do $$
declare v bigint; s text;
begin
  select string_agg(p.proname, ', ') into s from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'dm' and p.proname in ('dm_is_people_admin', 'dm_people', 'dm_set_moderator',
     'dm_invite_moderator', 'dm_cancel_invite', 'dm_claim_invite');
  insert into _dm007rb_check values (1, 'People functions removed', s is null, coalesce('still there: ' || s, 'none left'));
  insert into _dm007rb_check values (2, 'dm_invites removed', to_regclass('dm.dm_invites') is null, 'ok');
  select count(*) into v from information_schema.columns
   where table_schema = 'dm' and table_name = 'dm_admins' and column_name in ('role', 'added_by');
  insert into _dm007rb_check values (3, 'dm_admins back to user_id, added_at', v = 0, v || ' extra columns');
  select count(*) into v from dm.dm_admins;
  insert into _dm007rb_check values (4, 'Every moderator still in dm_admins', v > 0, v || ' rows');
end $$;

select case when ok then '✅' else '❌' end as " ", check_name, detail
  from _dm007rb_check order by n;
