#!/usr/bin/env node
/*
 * Proves migration 006 (DM from «public» into «dm») and its rollback on a real
 * Postgres (PGlite) set up like a Supabase project: anon / authenticated /
 * service_role, auth.users and auth.uid(), Supabase's default grants on public,
 * and a stand-in for the wedding quiz's schema «noeggi».
 *
 *   npm i --no-save @electric-sql/pglite@0.3 && node tools/test-dm-schema.mjs
 *
 * Steps: docs/supabase.sql + 004 + 005 with data → 006 → 006 again → rollback →
 * 006 again. After each, the script's own ✅/❌ table must be all ✅, and the
 * app's reads and writes are replayed as anon, a logged-in non-admin and the
 * admin, the way PostgREST would run them.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const sql = f => readFileSync(join(ROOT, "docs", f), "utf8");
const ADMIN = "11111111-1111-1111-1111-111111111111";
const USER  = "22222222-2222-2222-2222-222222222222";

let bad = 0;
const ok = (cond, what) => { console.log(`${cond ? "✓" : "✗"} ${what}`); if (!cond) bad++; };

const db = new PGlite();

// ---------------------------------------------------- a Supabase-like project
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  insert into auth.users values ('${ADMIN}', 'admin@example.org'), ('${USER}', 'someone@example.org');

  -- the wedding quiz, as migrated on 18.09.: must come out untouched
  create schema noeggi;
  create table noeggi.scores (id serial primary key, name text, score int);
  insert into noeggi.scores (name, score) values ('Gast', 984), ('Gast 2', 700);
`);

await db.exec(sql("supabase.sql"));
await db.exec(sql("supabase-migration-004.sql"));
await db.exec(sql("supabase-migration-005.sql").replace("__ADMIN_EMAIL__", "admin@example.org"));

await db.exec(`
  insert into dm_players (session, token, name, round, fp) values
    ('s1','t1','Anna',0,'fpA'), ('s1','t2','Ben',0,'fpB'), ('s2','t3','Cleo',1,null);
  insert into dm_answers (session, token, name, round, q_index, choice, correct, points) values
    ('s1','t1','Anna',0,0,1,true,900), ('s1','t2','Ben',0,0,2,false,0);
  insert into dm_state (session, phase, q_index, round) values ('s1','lobby',-1,0), ('s1','question',0,0);
  insert into dm_kicks (session, token) values ('s1','t9');
  insert into dm_stars (token, name, pillar, session, topic, source) values
    ('t1','Anna','civics','s1','Gewaltenteilung','claim'), ('t3','Cleo','comm',null,'Manual','manual');
  insert into dm_token_links (token_a, token_b, method) values ('dev1','t1','device');
  insert into dm_identities (user_id, token) values ('${USER}','dev1');
`);

// ------------------------------------------------------------------ helpers
const lastTable = res => res[res.length - 1].rows;
async function runChecks(file, label, transform = s => s) {
  const rows = lastTable(await db.exec(transform(sql(file))));
  const failed = rows.filter(r => r[" "] !== "✅");
  ok(rows.length > 0 && failed.length === 0,
    `${label}: ${rows.length - failed.length}/${rows.length} ✅`
    + (failed.length ? "  ✗ " + failed.map(r => `${r.check_name} (${r.detail})`).join("; ") : ""));
}
// run a statement as a role, the way PostgREST does (role + jwt claims, one transaction)
async function as(role, sub, q, params = []) {
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify(sub ? { role, sub } : { role })]);
    await tx.exec(`set local role ${role}`);
    return (await tx.query(q, params)).rows;
  });
}
const fails = async fn => { try { await fn(); return false; } catch { return true; } };
const count = async (role, sub, q) => Number((await as(role, sub, `select count(*)::int n from (${q}) x`))[0].n);

async function appWorks(S, label) {
  // what the live game, the passport and the admin page do (src/template.html, content/admin.html)
  ok(await count("anon", null, `select * from ${S}.dm_state where session = 's1'`) === 2, `${label}: anon reads ${S}.dm_state`);
  ok(await count("anon", null, `select * from ${S}.dm_roster('s1', 0)`) >= 2, `${label}: anon ${S}.dm_roster`);
  ok(await count("anon", null, `select * from ${S}.dm_round_answers('s1', 0)`) === 2, `${label}: anon ${S}.dm_round_answers`);
  ok(await count("anon", null, `select * from ${S}.dm_session_stars('s1')`) === 1, `${label}: anon ${S}.dm_session_stars`);
  ok(await count("anon", null, `select * from ${S}.dm_stars_for_tokens(array['t1','t3'])`) === 2, `${label}: anon ${S}.dm_stars_for_tokens`);
  ok(await count("anon", null, `select * from ${S}.dm_rescue_tokens('Anna', 'fpA')`) === 1, `${label}: anon ${S}.dm_rescue_tokens`);
  ok(await count("anon", null, `select * from ${S}.dm_players`) === 0, `${label}: anon cannot list ${S}.dm_players`);
  ok(await count("anon", null, `select * from ${S}.dm_stars`) === 0, `${label}: anon cannot list ${S}.dm_stars`);
  ok(await count("authenticated", USER, `select * from ${S}.dm_players`) === 0, `${label}: non-admin cannot list ${S}.dm_players`);
  ok(await count("authenticated", USER, `select * from ${S}.dm_admins`) === 0, `${label}: non-admin sees no admin row`);
  ok(await count("authenticated", ADMIN, `select * from ${S}.dm_admins`) === 1, `${label}: admin sees own admin row`);
  ok(await count("authenticated", ADMIN, `select * from ${S}.dm_players`) >= 3, `${label}: admin lists ${S}.dm_players`);
  const tag = label.replace(/\W+/g, "");
  ok(!(await fails(() => as("anon", null,
    `insert into ${S}.dm_players (session, token, name, round) values ('s1', 'n-${tag}', 'Neu', 0)`))), `${label}: anon joins (insert ${S}.dm_players)`);
  ok(!(await fails(() => as("anon", null,
    `insert into ${S}.dm_stars (token, name, pillar, session, source) values ('n-${tag}', 'Neu', 'action', 's-${tag}', 'claim')`))), `${label}: anon claims a star`);
  ok(await fails(() => as("anon", null,
    `insert into ${S}.dm_stars (token, name, pillar, session, source) values ('x', 'X', 'action', null, 'manual')`)), `${label}: anon cannot add a manual star`);
  ok(!(await fails(() => as("authenticated", ADMIN,
    `insert into ${S}.dm_stars (token, name, pillar, session, source) values ('m-${tag}', 'M', 'civics', null, 'manual')`))), `${label}: admin adds a manual star`);
  ok(!(await fails(() => as("authenticated", USER,
    `insert into ${S}.dm_identities (user_id, token) values ('${USER}', 'd-${tag}')`))), `${label}: logged-in user links a device`);
  ok(await fails(() => as("anon", null, `update ${S}.dm_state set phase = 'x'`))
     || await count("anon", null, `select * from ${S}.dm_state where phase = 'x'`) === 0, `${label}: anon cannot rewrite dm_state`);
  // service_role (delete-account edge function)
  ok(!(await fails(() => as("service_role", null, `delete from ${S}.dm_identities where token = 'd-${tag}'`))), `${label}: service_role deletes identity links`);
  const other = S === "dm" ? "public" : "dm";
  const left = (await db.query(`select count(*)::int n from pg_tables where schemaname = $1 and tablename like 'dm\\_%'`, [other])).rows[0].n;
  ok(left === 0, `${label}: no DM table in ${other}`);
  ok((await db.query(`select count(*)::int n from noeggi.scores`)).rows[0].n === 2, `${label}: noeggi.scores untouched`);
}

// ---------------------------------------------------------------- the runs
await appWorks("public", "before 006");
await runChecks("supabase-migration-006-dm-schema.sql", "006");
await appWorks("dm", "after 006");
await runChecks("supabase-migration-006-dm-schema.sql", "006 run again");
await appWorks("dm", "after 006 again");
ok(await fails(() => as("anon", null, `select * from public.dm_state`)), "after 006: public.dm_state is gone");
await runChecks("supabase-migration-006-rollback.sql", "rollback");
await appWorks("public", "after rollback");
await runChecks("supabase-migration-006-rollback.sql", "rollback run again");
await runChecks("supabase-migration-006-dm-schema.sql", "006 after rollback");
await appWorks("dm", "after 006 (third time)");

// guard: 005 missing → 006 refuses, moves nothing
const fresh = new PGlite();
await fresh.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth; create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;`);
await fresh.exec(sql("supabase.sql"));
let msg = "";
try { await fresh.exec(sql("supabase-migration-006-dm-schema.sql")); } catch (e) { msg = e.message; }
ok(/run docs\/supabase-migration-005\.sql first/.test(msg), "without 005: 006 stops with «run 005 first»");
ok((await fresh.query(`select count(*)::int n from pg_tables where schemaname='public' and tablename like 'dm\\_%'`)).rows[0].n === 4,
   "without 005: nothing moved");

console.log(bad ? `\n${bad} check(s) failed.` : "\nAll schema-migration checks pass.");
process.exit(bad ? 1 : 0);
