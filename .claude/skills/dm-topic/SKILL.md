---
name: dm-topic
description: >
  Generate the complete material set for a new Democracy Matters Special Topic
  from a one-paragraph brief: quiz pack, slide deck (PDF), presenter runbook,
  participant content page, and filled Topic Card. Use when Rafa says "next
  topic", "neues Thema", "generate the session for <topic>", or names a civic
  topic to turn into a DM session. The Gewaltenteilung set is the golden
  example — copy its structure, never its content.
---

# dm-topic — generate a Special Topic session

Produce five artifacts for topic id `<id>` (kebab-case, e.g. `gewaltenteilung-ch`):

| Artifact | Path | Golden example |
|---|---|---|
| Quiz pack | `packs/<id>.json` + registry line in `packs/sessions.json` | `packs/gewaltenteilung-ch.json` |
| Slide deck | `slides/<id>.html` → render `slides/<id>.pdf` | `slides/gewaltenteilung-ch.html` |
| Runbook | `docs/runbook-<id>.md` | `docs/runbook-gewaltenteilung-ch.md` |
| Content page | `content/<id>.html` (DE/EN toggle) | `content/gewaltenteilung-ch.html` |
| Topic Card | `slides/topic-card-<id>.html` → `.pdf` | `slides/topic-card-gewaltenteilung-ch.html` |

Read the golden example files before writing anything — structure, CSS and page
skeletons carry over; only the topic content changes.

## Process

1. **Clarify the brief** if it lacks: the governing question (the "warum"),
   the Swiss angle, and the pillar (Civics & Basic Concepts / Communication &
   Social Media / Action & Mobilisation).
2. **Find the video**: German explainer ≤ 5 min, prefer official/neutral
   sources (easyvote, SRF school, Der Bund kurz erklärt / gov-ch). Verify
   title and duration via `https://www.youtube.com/oembed?url=...` and
   `lengthSeconds` in the watch page. Always pick a backup. If no short EN
   video exists, link an official EN text explainer (ch.ch) instead and say so.
3. **Write 3 A/B quiz questions** with one-line explanations (DE/EN/FR in the
   pack schema — see `docs/dm-quiz-spec.md`). Questions must have surprising
   answers; the deck and content page must state the same facts.
4. **Build the deck** in the fixed dramaturgy (9 pages):
   DM main slide (pillar highlighted, HEUTE +★ chip, two slots: Sprint 30′ /
   Die Runde) · topic intro (5/10/5/5 agenda) · QR slide (QR via
   `vendor/qrcode.js` to `?session=<id>`, clickable player + host links) ·
   video slide (thumbnail = link, small backup/EN footnote, 3-item mission) ·
   check slide (who-checks-whom style diagram + post-it facts) · Übung slide
   (provocation + hard-timeboxed task: 2′ small groups, 3′ round, one argument
   per group) · take-away Skeptiker-Kit (skeptic quote as headline, 4 icon
   cards, Bottom Line ★ → Master Checklist) · «Die Runde» (bare centered title,
   nothing else) · Regie (minute table, clickable links).
5. **Design rules**: tokens and Poppins per `docs/design-tokens.md`; fonts via
   relative `../assets/fonts/*.woff2`; logo assets `assets/img/dm-logo-white.png`
   (dark bg) / `dm-logo-dark.png` (light bg); no red, no ß, Swiss «guillemets».
   In print CSS, flatten box-shadows (they rasterize as dark blocks).
6. **Render PDFs** with headless Chrome:
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless
   --disable-gpu --force-color-profile=srgb --no-pdf-header-footer
   --print-to-pdf=<out.pdf> <file-url>`
   Then verify: view every PDF page (Read the PDF), check no overlaps/clipping,
   and confirm link annotations exist (`grep /URI` in the PDF bytes).
7. **Facts**: verify every civic/legal claim against official sources (ch.ch,
   admin.ch, BV articles). No invented numbers. Mark anything unverified as
   `[Platzhalter]` for Fritz.
8. **Coordinate**: work in this session's worktree; the dm-quiz session owns
   `main`, deploys and migration numbering. Fritz reviews all output before it
   is considered final.
