#!/usr/bin/env bash
# One Supabase project, two apps, never crossed (Rafa, 18.09.2026).
# DM lives in the schema «public» (tables dm_*); the wedding quiz (noeggi-kahoot) lives in the
# schema «noeggi» of the same project. This fails if DM's code reaches into the quiz's schema:
#   - noeggi.<anything> in code or SQL,
#   - a request profile header (DM only ever uses the default schema, public),
#   - the quiz's REST tables or functions (scores, players, feedback, bonus, player_*, feedback_list).
# Mentions of the noeggi-kahoot repo as the engine's origin are fine and not matched.
set -u
cd "$(dirname "$0")/.."
code=(src tools content docs/*.sql supabase)
bad=0
hit(){ echo "✗ $1"; echo "$2" | sed 's/^/    /'; bad=1; }

out=$(grep -rnE '\bnoeggi\.[a-z_]+' "${code[@]}" --exclude=check-schema.sh || true)
[ -n "$out" ] && hit "references the wedding quiz's schema" "$out"

out=$(grep -rniE '(accept|content)-profile' "${code[@]}" --exclude=check-schema.sh || true)
[ -n "$out" ] && hit "selects a schema other than public (profile header)" "$out"

out=$(grep -rnE "rest/v1/(scores|players|feedback|bonus)\b|[\"'\`](scores|players|feedback|bonus)\?|rpc/(player_get|player_upsert|player_by_fp|player_by_name|feedback_list)\b|[\"'\`](player_get|player_upsert|player_by_fp|player_by_name|feedback_list)[\"'\`]" "${code[@]}" --exclude=check-schema.sh || true)
[ -n "$out" ] && hit "calls the wedding quiz's tables or functions" "$out"

[ $bad = 0 ] && echo "✓ schema check: DM only uses its own schema (public, dm_*)"
exit $bad
