#!/usr/bin/env node
/*
 * Proves migration 007 (the People page: the admin makes and removes moderators,
 * invites by email) on a real Postgres (PGlite) set up like a Supabase project:
 * anon / authenticated / service_role, auth.users, auth.sessions, auth.uid() and
 * auth.jwt(), DM in the schema «dm» (001-006 run first).
 *
 *   npm i --no-save @electric-sql/pglite@0.3 && node tools/test-people-schema.mjs
 *
 * Every rule is tested the way PostgREST runs a call (role + JWT claims, one
 * transaction), as anon, a logged-in player, a moderator, the admin, and the
 * invited person: only the admin lists accounts and changes moderators, nobody
 * changes the admin, an invite is only claimed from the mail link by the invited
 * address with nobody else signed in. Then 007 again, its rollback, 007 once more.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = f => readFileSync(join(ROOT, "docs", f), "utf8");
const ADMIN = "11111111-1111-1111-1111-111111111111";   // the admin, flagged by 005 in September
const MOD   = "33333333-3333-3333-3333-333333333333";   // a moderator added by hand later (like David)
const USER  = "22222222-2222-2222-2222-222222222222";   // a player with a My DM account
const OTHER = "44444444-4444-4444-4444-444444444444";   // an auth user that never used My DM
const NEW   = "55555555-5555-5555-5555-555555555555";   // created by the invite mail (GoTrue)
const SQUAT = "66666666-6666-6666-6666-666666666666";   // registered someone else's address first
const S_NEW = "aaaaaaaa-0000-0000-0000-000000000001", S_OTHERDEV = "aaaaaaaa-0000-0000-0000-000000000002";

let bad = 0;
const ok = (cond, what) => { console.log(`${cond ? "✓" : "✗"} ${what}`); if (!cond) bad++; };

async function project() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email varchar(255), created_at timestamptz default now(),
      last_sign_in_at timestamptz);
    create table auth.sessions (id uuid primary key, user_id uuid, not_after timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
      $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    grant execute on function auth.jwt() to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    insert into auth.users (id, email, created_at) values
      ('${ADMIN}', 'Admin@Example.org', '2026-09-01'), ('${MOD}', 'mod@example.org', '2026-10-01'),
      ('${USER}', 'player@example.org', '2026-10-02'), ('${OTHER}', 'wedding@example.org', '2026-10-03');
  `);
  await db.exec(sql("supabase.sql"));
  await db.exec(sql("supabase-migration-004.sql"));
  await db.exec(sql("supabase-migration-005.sql").replace("__ADMIN_EMAIL__", "admin@example.org"));
  return db;
}

const db = await project();
await db.exec(sql("supabase-migration-006-dm-schema.sql"));
await db.exec(`
  update dm.dm_admins set added_at = '2026-09-18' where user_id = '${ADMIN}';
  insert into dm.dm_admins (user_id, added_at) values ('${MOD}', '2026-11-05 18:00');   -- the SQL Rafa pasted
  insert into dm.dm_identities (user_id, token) values ('${USER}', 'dev-player'), ('${ADMIN}', 'dev-admin');
  insert into dm.dm_token_links (token_a, token_b, method) values ('dev-player', 'quiz-player', 'device');
  insert into dm.dm_players (session, token, name, round, joined_at) values
    ('s1', 'quiz-player', 'Anna', 0, '2026-10-10'), ('s2', 'quiz-player', 'Anna B.', 0, '2026-11-01');
`);

// ------------------------------------------------------------------ helpers
const lastTable = res => res[res.length - 1].rows;
async function runChecks(file, label) {
  const rows = lastTable(await db.exec(sql(file)));
  const failed = rows.filter(r => r[" "] !== "✅");
  ok(rows.length > 0 && failed.length === 0,
    `${label}: ${rows.length - failed.length}/${rows.length} ✅`
    + (failed.length ? "  ✗ " + failed.map(r => `${r.check_name} (${r.detail})`).join("; ") : ""));
  return rows;
}
// one call the way PostgREST runs it: role + JWT claims, one transaction
async function as(claims, q, params = []) {
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await tx.exec(`set local role ${claims.role}`);
    return (await tx.query(q, params)).rows;
  });
}
const anon = { role: "anon" };
const user = (sub, method = "password", session_id = "aaaaaaaa-0000-0000-0000-0000000000ff") =>
  ({ role: "authenticated", sub, session_id, amr: [{ method, timestamp: 1 }] });
const errOf = async fn => { try { await fn(); return null; } catch (e) { return e; } };
const refused = async (claims, q, params) => {
  const e = await errOf(() => as(claims, q, params));
  return !!e && (e.code === "42501" || /permission denied|only the admin|cannot change|cannot be changed/.test(e.message));
};
const one = async (claims, q, params) => Object.values((await as(claims, q, params))[0])[0];
const admins = async () => (await db.query(`select user_id::text, role from dm.dm_admins order by user_id`)).rows;
const isMod = async id => (await db.query(`select 1 from dm.dm_admins where user_id = $1`, [id])).rows.length === 1;

// ---------------------------------------------------------------- migration
const rows = await runChecks("supabase-migration-007-people.sql", "007");
ok(/admin@example\.org/i.test(rows.find(r => r.check_name.startsWith("Exactly one admin")).detail),
  "007: the admin is the row added first (shown by email in check 2)");
ok((await admins()).find(a => a.user_id === MOD).role === "moderator", "007: the moderator added later stays a moderator");
await runChecks("supabase-migration-007-people.sql", "007 run again");
ok((await admins()).filter(a => a.role === "admin").length === 1, "007 run again: still exactly one admin");

// dm_is_admin() is what the Moderator kit and the admin reads use: unchanged for every moderator
ok(await one(user(MOD), `select dm.dm_is_admin()`) === true, "moderator still passes dm_is_admin() (sees the kit)");
ok(await one(user(ADMIN), `select dm.dm_is_admin()`) === true, "admin still passes dm_is_admin()");
ok(await one(user(MOD), `select dm.dm_is_people_admin()`) === false, "moderator is not the people admin");
ok(await one(user(ADMIN), `select dm.dm_is_people_admin()`) === true, "admin is the people admin");
ok(await one(anon, `select dm.dm_is_people_admin()`) === false, "anon is not the people admin");

// ------------------------------------------------------------- who may list
ok(await refused(anon, `select * from dm.dm_people()`), "anon cannot list accounts");
ok(await refused(user(USER), `select * from dm.dm_people()`), "a player cannot list accounts");
ok(await refused(user(MOD), `select * from dm.dm_people()`), "a moderator cannot list accounts");
const list = await as(user(ADMIN), `select * from dm.dm_people()`);
const byId = id => list.find(r => r.user_id === id);
ok(list.length === 3, `admin lists the My DM accounts (${list.length}: admin, moderator, player)`);
ok(!byId(OTHER), "an auth user that never used My DM is not listed");
ok(byId(ADMIN).role === "admin" && byId(ADMIN).is_me === true, "the admin's own row: role admin, is_me");
ok(byId(MOD).role === "moderator", "the moderator's row: role moderator");
ok(byId(USER).role === null && byId(USER).name === "Anna B.", "the player's row: no role, latest quiz name");

// ------------------------------------------------------------- direct table access
ok(await refused(user(ADMIN), `select * from dm.dm_invites`), "nobody reads dm_invites directly, not even the admin");
ok(await refused(user(USER), `insert into dm.dm_admins (user_id) values ('${USER}')`), "a player cannot insert into dm_admins");
ok(await refused(user(MOD), `update dm.dm_admins set role = 'admin' where user_id = '${MOD}'`), "a moderator cannot make itself admin");
ok((await admins()).find(a => a.user_id === MOD).role === "moderator", "…still a moderator");
ok(await refused(user(ADMIN), `delete from dm.dm_admins where user_id = '${MOD}'`), "even the admin changes dm_admins only through the functions");
ok(await isMod(MOD), "…and the moderator is still there");
ok(await one(user(MOD), `select count(*)::int from dm.dm_admins`) === 1, "a moderator still reads its own dm_admins row (adminStatus())");

// ------------------------------------------------------------- switching
ok(await refused(anon, `select dm.dm_set_moderator($1, true)`, [USER]), "anon cannot switch");
ok(await refused(user(USER), `select dm.dm_set_moderator($1, true)`, [USER]), "a player cannot make itself moderator");
ok(await refused(user(MOD), `select dm.dm_set_moderator($1, true)`, [USER]), "a moderator cannot make moderators");
ok(await refused(user(MOD), `select dm.dm_set_moderator($1, false)`, [ADMIN]), "a moderator cannot remove the admin");
ok(!(await isMod(USER)) && (await isMod(ADMIN)), "…nothing changed");
ok(await refused(user(ADMIN), `select dm.dm_set_moderator($1, false)`, [ADMIN]), "the admin cannot switch themselves off");
ok(await isMod(ADMIN), "…the admin is still admin");
ok(await one(user(ADMIN), `select dm.dm_set_moderator($1, true)`, [USER]) === "moderator", "admin makes the player a moderator");
ok(await isMod(USER) && await one(user(USER), `select dm.dm_is_admin()`) === true, "…who now passes dm_is_admin()");
ok(await one(user(ADMIN), `select dm.dm_set_moderator($1, true)`, [USER]) === "moderator", "switching on twice is harmless");
ok(await one(user(ADMIN), `select dm.dm_set_moderator($1, false)`, [USER]) === "player", "admin removes the moderator");
ok(!(await isMod(USER)) && await one(user(USER), `select dm.dm_is_admin()`) === false, "…who no longer passes dm_is_admin()");
const missing = await errOf(() => as(user(ADMIN), `select dm.dm_set_moderator($1, true)`, ["99999999-9999-9999-9999-999999999999"]));
ok(missing && /no such account/.test(missing.message), "an unknown account is refused");
ok(await refused(user(ADMIN), `select dm.dm_set_moderator(null, true)`) === false
   && !!(await errOf(() => as(user(ADMIN), `select dm.dm_set_moderator(null, true)`))), "a missing argument is an error");

// ------------------------------------------------------------- inviting
ok(await refused(user(MOD), `select dm.dm_invite_moderator('new@example.org')`), "a moderator cannot invite");
ok(await refused(anon, `select dm.dm_invite_moderator('new@example.org')`), "anon cannot invite");
const badMail = await errOf(() => as(user(ADMIN), `select dm.dm_invite_moderator('not-an-email')`));
ok(badMail && /not an email/.test(badMail.message), "an invalid address is refused");
ok(await one(user(ADMIN), `select dm.dm_invite_moderator('PLAYER@example.org ')`) === "moderator",
  "inviting an existing account (any case, spaces) makes it moderator at once");
ok(await isMod(USER), "…it is in dm_admins");
ok(await one(user(ADMIN), `select dm.dm_invite_moderator('player@example.org')`) === "already", "inviting a moderator again: already");
ok(await one(user(ADMIN), `select dm.dm_invite_moderator('admin@example.org')`) === "already", "inviting the admin: already");
await as(user(ADMIN), `select dm.dm_set_moderator($1, false)`, [USER]);
ok(await one(user(ADMIN), `select dm.dm_invite_moderator('New@Example.org')`) === "invite", "a new address becomes an open invite");
let l2 = await as(user(ADMIN), `select * from dm.dm_people()`);
ok(l2.some(r => r.user_id === null && r.email === "new@example.org" && r.invited_at), "…listed as invite sent, no account yet");
ok(await one(user(ADMIN), `select dm.dm_invite_moderator('new@example.org')`) === "invite", "sending it again keeps one invite");
ok((await db.query(`select count(*)::int n from dm.dm_invites`)).rows[0].n === 1, "…one row");

// the mail goes out: GoTrue creates the account the moment the sign-in mail is sent
await db.exec(`insert into auth.users (id, email) values ('${NEW}', 'new@example.org')`);
l2 = await as(user(ADMIN), `select * from dm.dm_people()`);
ok(l2.filter(r => r.email === "new@example.org").length === 1 && l2.find(r => r.user_id === NEW).invited_at,
  "once the account exists the invite shows on that account, once");
ok(await one(user(ADMIN), `select dm.dm_invite_moderator('new@example.org')`) === "invite",
  "inviting again while the invite is open keeps it an invite (the link is still needed)");
ok(!(await isMod(NEW)), "…not moderator yet");

// ------------------------------------------------------------- claiming
await db.exec(`insert into auth.sessions (id, user_id) values ('${S_NEW}', '${NEW}'), ('${S_OTHERDEV}', '${NEW}')`);
ok(await one(user(USER, "magiclink", S_NEW), `select dm.dm_claim_invite()`) === "none", "someone without an invite claims nothing");
ok(await one(user(NEW, "password", S_NEW), `select dm.dm_claim_invite()`) === "not-from-link", "a password sign-in cannot claim");
ok(await one({ role: "authenticated", sub: NEW, session_id: S_NEW }, `select dm.dm_claim_invite()`) === "not-from-link", "no amr claim: cannot claim");
ok(await one(user(NEW, "magiclink", S_NEW), `select dm.dm_claim_invite()`) === "other-sessions", "another device still signed in: cannot claim");
ok(await one({ role: "authenticated", sub: NEW, amr: [{ method: "magiclink" }] }, `select dm.dm_claim_invite()`) === "other-sessions", "no session id: cannot claim");
ok(!(await isMod(NEW)), "…still not moderator");
await db.exec(`delete from auth.sessions where id = '${S_OTHERDEV}'`);   // the page signs out every other device
ok(await refused(anon, `select dm.dm_claim_invite()`), "anon cannot even call the claim");
ok(await one(user(NEW, "magiclink", S_NEW), `select dm.dm_claim_invite()`) === "moderator", "from the mail link, alone: moderator");
ok(await isMod(NEW) && (await admins()).find(a => a.user_id === NEW).role === "moderator", "…in dm_admins as moderator");
ok((await db.query(`select added_by::text from dm.dm_admins where user_id = $1`, [NEW])).rows[0].added_by === ADMIN, "…added_by the admin");
ok((await db.query(`select count(*)::int n from dm.dm_invites`)).rows[0].n === 0, "…the invite is used up");
ok(await one(user(NEW, "magiclink", S_NEW), `select dm.dm_claim_invite()`) === "none", "a second claim finds nothing");

// an invite older than 14 days is dead
await db.exec(`insert into auth.users (id, email) values ('${SQUAT}', 'late@example.org');
  insert into dm.dm_invites (email, invited_at) values ('late@example.org', now() - interval '15 days');
  insert into auth.sessions (id, user_id) values ('aaaaaaaa-0000-0000-0000-000000000003', '${SQUAT}')`);
ok(await one(user(SQUAT, "magiclink", "aaaaaaaa-0000-0000-0000-000000000003"), `select dm.dm_claim_invite()`) === "none",
  "an invite older than 14 days cannot be claimed");

// cancel
ok(await refused(user(MOD), `select dm.dm_cancel_invite('late@example.org')`), "a moderator cannot cancel invites");
ok(await one(user(ADMIN), `select dm.dm_cancel_invite('LATE@example.org')`) === "cancelled", "the admin cancels an invite");
ok(await one(user(ADMIN), `select dm.dm_cancel_invite('late@example.org')`) === "none", "…cancelling twice is harmless");
await as(user(ADMIN), `select dm.dm_invite_moderator('third@example.org')`);
await db.exec(`insert into auth.users (id, email) values ('77777777-7777-7777-7777-777777777777', 'third@example.org')`);
ok(await one(user(ADMIN), `select dm.dm_set_moderator($1, false)`, ["77777777-7777-7777-7777-777777777777"]) === "player"
   && (await db.query(`select count(*)::int n from dm.dm_invites`)).rows[0].n === 0, "switching off a pending person cancels their invite");

// ------------------------------------------------------------- run again, rollback, again
const before = await admins();
await runChecks("supabase-migration-007-people.sql", "007 a third time");
ok(JSON.stringify(await admins()) === JSON.stringify(before), "007 again: dm_admins unchanged");
await runChecks("supabase-migration-007-rollback.sql", "007 rollback");
ok((await db.query(`select count(*)::int n from dm.dm_admins`)).rows[0].n === before.length, "rollback: every moderator still in dm_admins");
ok(await one(user(MOD), `select dm.dm_is_admin()`) === true, "rollback: moderators still see the kit");
await runChecks("supabase-migration-007-rollback.sql", "007 rollback run again");
await runChecks("supabase-migration-007-people.sql", "007 after rollback");
ok((await admins()).find(a => a.role === "admin").user_id === ADMIN, "007 after rollback: the admin is the same person");
const rb = await errOf(() => db.exec(sql("supabase-migration-006-rollback.sql")));
ok(rb && /run docs\/supabase-migration-007-rollback\.sql first/.test(rb.message), "006 rollback stops while 007 is in place");
await runChecks("supabase-migration-006-dm-schema.sql", "006 run again after 007");

// guard: DM still in public (006 not run) → 007 stops, changes nothing
const old = await project();
const e = await errOf(() => old.exec(sql("supabase-migration-007-people.sql")));
ok(e && /run docs\/supabase-migration-006-dm-schema\.sql first/.test(e.message), "before 006: 007 stops with «run 006 first»");
ok((await old.query(`select count(*)::int n from information_schema.columns
  where table_name = 'dm_admins' and column_name = 'role'`)).rows[0].n === 0, "before 006: nothing changed");

console.log(bad ? `\n${bad} check(s) failed.` : "\nAll People-page migration checks pass.");
process.exit(bad ? 1 : 0);
