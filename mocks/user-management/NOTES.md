# DM user management — hand-over (05.11.2026, 18:45)

Status: NOT STARTED beyond reading. This session ran on the Mac (Mac off at 19:00), so nothing was built,
committed or pushed. A cloud session should start from `origin/main` of `tigerraph/dm-quiz` (6db4c21 at 18:41).
Do NOT use the local checkouts: `~/Claude/Projects/dm-quiz` is on branch `keep-alive-daily-0924`,
`~/Claude/Projects/dm` is on `main` 14 behind.

## What exists (origin/main)

- Moderator today = a row in `dm.dm_admins` (schema `dm` since migration 006; table from 005:
  `user_id uuid pk -> auth.users, added_at`). RLS: a user reads only their own row. `dm.dm_is_admin()`
  is the security-definer check. There is NO separate moderator role: anyone in dm_admins is both
  «moderator» (sees the Moderator kit) and «admin».
  -> Open decision for Rafa (put it in the mock round, don't guess): should only some admins
  (e.g. Rafa) be allowed to make/remove moderators? If yes, add a column like `can_manage boolean`
  (or `role text check (role in ('owner','moderator'))`) to dm_admins in a new migration 007.
- Files: `docs/supabase-migration-005.sql`, `docs/supabase-migration-006-dm-schema.sql` (+ rollback),
  `content/admin.html` (admin page, checks dm_admins at ~line 300), `index.html` / `src/template.html`
  (My DM login, `asUser(...)`, admin check ~line 2141 in template), `supabase/functions/delete-account`
  (existing edge function: pattern for a service-key function).
- Design tokens: `docs/design-tokens.md` in the repo (same as ~/Claude/Projects/dm/docs/design-tokens.md).
  Moderator-kit CSS in index.html around line 464.
- Mock: `tools/mock-supabase.mjs` (in-memory PostgREST + auth stand-in; `/__admin?email=…` flags an admin,
  `/__mail` lists mails it "would send", `--self` serves index.html pointed at the mock). Extend it for
  the new rpc/edge routes; never touch the real project.
- Tests: `npm test`, `tools/test-dm-schema.mjs`, `tools/test-client-schema.mjs`, `tools/test-qr-join.mjs`,
  `bash tools/check-schema.sh` (CI in `.github/workflows/build.yml`).

## Pattern to reuse

boomerang-web PR #2138 (merged) «Door admin People: change access in place, tap a person, calm remove
(Rafa's pick A)»: files `netlify/functions/door.ts`, `netlify/lib/door.ts`, `scripts/test-door.mjs`.
Read with `gh pr diff 2138 --repo tigerraph/boomerang-web`.

## Suggested build shape (after Rafa's pick)

- List + switch: security-definer SQL functions in schema `dm` (`dm_list_accounts()`,
  `dm_set_moderator(uid, on)`), each starting with `if not dm.dm_is_admin() then raise exception`;
  never let an admin remove the last admin / themselves.
- Invite by email needs the service key -> new edge function `supabase/functions/invite-moderator`
  (verifies caller JWT is in dm_admins, then `auth.admin.inviteUserByEmail` + insert into dm_admins).
  Mock must fake it; never send a real invite.

## Rules from the brief

3 hi-fi clickable mocks in one comparison page first, Rafa picks; PR marked «do not merge before Rafa's OK»;
no real accounts, no invites, no production user data; screenshots from the mock only.
Rafa is away 06.–29.11.: the pick can only come from him (async) — DM Elections session is 6 Nov 15:00,
so this must not touch anything that session uses.
