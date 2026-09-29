#!/usr/bin/env bash
# One Supabase project, two apps, never crossed (Rafa, 18.09.2026).
# DM lives in the schema «dm» (docs/supabase-migration-006-dm-schema.sql); the wedding quiz
# (noeggi-kahoot) lives in the schema «noeggi» of the same project. This fails if:
#   - DM's code reaches into the quiz's schema: noeggi.<anything>, a noeggi profile header,
#     or the quiz's REST tables or functions (scores, players, feedback, bonus, player_*, feedback_list),
#   - a profile header names any schema other than dm (public included: DM left it with 006),
#   - a REST call bypasses the one place that sets the dm profile (rest() in src/template.html,
#     get() in content/admin.html, post() in tools/seed-demo.mjs),
#   - src/config.json does not select the dm schema,
#   - a migration after 006 creates or names DM objects in public again.
# Mentions of the noeggi-kahoot repo as the engine's origin are fine and not matched.
# The schema-move test builds a stand-in noeggi schema on purpose and is excluded from rule 1.
set -u
cd "$(dirname "$0")/.."
code=(src tools content docs/*.sql supabase)
bad=0
hit(){ echo "✗ $1"; echo "$2" | sed 's/^/    /'; bad=1; }

out=$(grep -rnE '\bnoeggi\.[a-z_]+' "${code[@]}" --exclude=check-schema.sh --exclude=test-dm-schema.mjs || true)
[ -n "$out" ] && hit "references the wedding quiz's schema" "$out"

# profile headers: a literal schema name next to one must be dm (variables are checked through
# src/config.json below); noeggi or public anywhere next to a profile header is always wrong
out=$(grep -rnoiE "(accept|content)-profile[\"'\`]?\]?[:=] *[\"'\`][a-z_]+" "${code[@]}" --exclude=check-schema.sh \
      | grep -viE "[\"'\`]dm$" || true)
[ -n "$out" ] && hit "a profile header names a schema other than dm" "$out"
out=$(grep -rniE "(accept|content)-profile[\"'\`]?:? *[\"'\`]?(noeggi|public)\b" "${code[@]}" --exclude=check-schema.sh \
      --exclude=mock-supabase.mjs || true)
[ -n "$out" ] && hit "a profile header selects noeggi or public" "$out"

out=$(grep -rnE "rest/v1/(scores|players|feedback|bonus)\b|[\"'\`](scores|players|feedback|bonus)\?|rpc/(player_get|player_upsert|player_by_fp|player_by_name|feedback_list)\b|[\"'\`](player_get|player_upsert|player_by_fp|player_by_name|feedback_list)[\"'\`]" "${code[@]}" --exclude=check-schema.sh || true)
[ -n "$out" ] && hit "calls the wedding quiz's tables or functions" "$out"

# every REST call goes through the one wrapper per file that sets the profile
for f in src/template.html content/admin.html tools/seed-demo.mjs; do
  n=$(grep -cE "/rest/v1/" "$f")
  [ "$n" -gt 1 ] && hit "$f calls /rest/v1/ outside its schema wrapper ($n places, expected 1)" "$(grep -nE '/rest/v1/' "$f")"
done

python3 -c 'import json,sys; sys.exit(0 if json.load(open("src/config.json")).get("supabaseSchema")=="dm" else 1)' \
  || hit "src/config.json does not select the dm schema" "supabaseSchema must be \"dm\""

# migrations from 006 on: DM objects live in dm (the rollback is the one file allowed to name public.dm_*)
later=$(ls docs/supabase-migration-0*.sql 2>/dev/null | grep -vE 'migration-00[1-5]\.sql$|rollback' || true)
if [ -n "$later" ]; then
  out=$(grep -HnE '\bpublic\.dm_' $later | grep -vE "^[^:]+:[0-9]+: *--|to_reg(class|procedure)\('public\.dm_" || true)
  [ -n "$out" ] && hit "a migration after 005 puts DM objects in public" "$out"
fi

[ $bad = 0 ] && echo "✓ schema check: DM only uses its own schema (dm), never noeggi or public"
exit $bad
