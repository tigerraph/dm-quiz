# Decision — dm-quiz scope (2026-08-25)

- dm-quiz builds on the wedding kahoot codebase; engine (timer, speed scoring,
  streaks, i18n, audio, Supabase fallback pattern) carries over unchanged.
- New repo `dm-quiz`; the `noeggi-kahoot` wedding repo stays frozen.
- Backend stays Supabase: fresh free-tier project (new `dm_scores` table),
  plus a GitHub Actions keep-alive ping against the 7-day inactivity pause.
- v1 scope: per-session QR + topic packs + host leaderboard view only.
  No star/stamp system yet (parked).
- Strip wedding-specific content: questions, media, bonus unlocks, retro theme,
  extra game modes. One mode: play the session's pack.
- Topic pack #1: Gewaltenteilung CH (3 A/B questions with explanations).
- i18n: ship EN + DE; FR later.
