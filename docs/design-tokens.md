# Skin — DM / DAY8 tokens

Source of truth: the `DM_Format_Learning-Loop_Gewaltenteilung-CH` deck and
the Democracy Matters Journey slide. Both were sampled pixel-by-pixel while
building the skin; the hexes below are the spec's, and the deck's rendered
values matched them to within PDF colour-profile drift (e.g. blue sampled
`#485BBF` against the token `#435CC6`).

| token | hex | role |
|---|---|---|
| blue | `#435CC6` | primary, buttons, option badges |
| green | `#A8D272` | correct answer, top rank |
| teal | `#5EB9A9` | accent, kickers, labels, timer bar |
| cream | `#FDF2D0` | post-it surfaces — option tiles, the "Why" card |
| dark | `#1B2329` | background |
| ink | `#22313C` | text on cream |

Typography is **Poppins** — ExtraBold (800) for titles and anything that
carries hierarchy, Regular (400) for body. Subsetted to latin + latin-ext and
base64-inlined at build, so there is no runtime font request.

## What the deck does that the app copies

- Full-bleed dark ground, white ExtraBold headline, small teal kicker above it.
- **Cream post-its** are the signature surface. In the deck they hold the "?"
  marks and the material callouts; in the app they are the answer tiles and
  the "Why" explanation card, with the same slight rotation and drop shadow.
- Options are labelled **A / B / C / D**, matching the deck's `A the people ·
  B parliament`.
- The "Time / 3m" metric lockup — small bold label over a large light number —
  became the score, player count and top-score displays.

## Deliberate departures

- **No red.** The palette has none, so a wrong answer is shown by dimming the
  tile and marking it ✕ rather than by inventing a red token. If you want a
  stronger "wrong" signal, that needs a new colour decision.
- **No confetti, no polaroids.** Stripped with the rest of the wedding skin,
  per the spec.
- **No DM or DAY8 logo.** The mark on the deck slides was not part of the
  handover batch, so the app uses a "Democracy Matters" wordmark in type.
  Drop the real asset in `assets/` and wire it up when it is available.
