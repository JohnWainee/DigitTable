# Option rows at large text, lane `sonnet-em` (2026-10-04)

Base: `92c2b6e`. **Source change:** presentational only (markup wrappers and CSS) plus tests and one audit probe. Not merged, not
deployed. No Firebase project, cloud resource, authorization, privacy, projection, engine or template contract was touched, and staging
was not contacted. A preserved uncommitted attempt from another lane (`sonnet-ek`, `/private/tmp/digitable-sonnet-ek-reskin-option-rows-20261004`)
was read once for context only; the code here was written and measured independently (and the numbers below are this lane's own runs).

## The defect, reproduced on the unmodified base

`ui-audit.mjs` on the `92c2b6e` bundle (`ui-audit-before.log`, `ui-audit-before-report.json`) fails on exactly six word breaks in checkbox
and radio option rows at 150-200% root text on 320-375px phones: `Phantasmagoria` (320px/150%, 320px/200%, 375px/200%), `Panzerfaust`,
`submachine` and `Fragmentation` (320px/200%). Root cause: arithmetic. The option row's text column is ~209px at 375px/200% and ~196px
at 320px/200% while the longest word needs ~223px, and the row's `overflow-wrap: anywhere` then cuts the word wherever it runs out.

## The fix (smallest that is robust)

1. **Stack the label under its box when its longest word cannot sit beside it.** The text of every check/radio label (14 rows, 6 files)
   is wrapped in `<span className="option-text">`. `.gear-option` is `flex-wrap: wrap`; `.option-text` is
   `flex: 1 1 min-content; min-width: 0; max-width: 100%; overflow-wrap: break-word`. A flex line breaks on an item's hypothetical size,
   and the flex _basis_ here is the longest word, so the text stays beside the box while that word fits and otherwise takes its own line
   under the box. No breakpoint and no guessed text-size threshold: it follows the real content at the real text size, and a row that fits
   never changes. `break-word` (not the row's `anywhere`, which shrinks min-content to one letter) keeps the basis at the longest word.
   The zero minimum plus `max-width: 100%` is the last resort: a word wider than a whole stacked line (text far past 200%) breaks
   _inside_ the row, never past it, so stacking can never widen the page. (`min-width: min-content` would win over `max-width` and overflow.)
2. **Give the two side paddings back as text grows.** Stacking alone still left five failures at 320px/200% (stacked column 196px,
   `Phantasmagoria` 223px; run recorded while developing, probe output not kept). `fieldset` and option-row side padding became
   `--gutter-sm-fit` / `--gutter-xs-fit` = `clamp(4px, calc(27.2px - 0.85rem), min(0.85rem, 13.6px))` (and 20.8 / 0.65 / 10.4; the GM
   pending-action card's tighter px paddings 23.6 / 18.4): exactly the old value at the default 16px root (the clamp is a no-op), 6.8px
   at 150%, 4px from 200% up, and the old rem value below the default size. That puts the 320px/200% column at ~232px.

Unchanged: 48px row height (`min-height: var(--tap)`), the whole row is the label and tap target, `:has(:checked)` highlight, focus ring,
disabled style, box and mark sizes, accessible names (the span is inside the `<label>`), keyboard behaviour, the GM "Reveal" row.

## Evidence

| Check | Result |
| --- | --- |
| Baseline audit | 288 states, 3,336 controls, and exactly the six reported word-break failures; no control, viewport-overflow, hard-axe, or contrast failure. |
| Candidate audit | 288 states, 3,320 controls, **0 failures**, 0 control/viewport-overflow/hard-axe/contrast failures, 87 keyboard-focus checks, 363 dock-focus checks, 4 pinch scenarios, and 23 sheet cases. The intentional nonexistent-room route retains one non-blocking axe best-practice heading note. Five contrast pages use truncated samples, disclosed rather than counted as passes. |
| Three-role browser smoke | `two-device-smoke.mjs --reload`: all 17 GM/player/table steps passed, including create, isolated admission, opposed resolution, allocation, pause/resume, scene advance, reload, original assets, and 375/768/1024/1280/1920px overflow checks. |
| Current repository gate | `npm run check`: Prettier, typecheck, and **841** tests passed (11 todo; 1 skipped); ESLint has one existing warning at `auditHarnessContract.test.ts:395`, no errors. `npm run build` passed; Vite retains its pre-existing chunk-size warning. |
| Emulator suite | The lane's isolated remapped-stack run recorded 18 rules + 86 Functions + 4 web tests passing. A final default-port rerun correctly found another local lane already owns 9099/8080/9000/5001; it did not kill or alter that lane. The candidate changes only client markup, CSS, browser probes, and tests—no rules, Functions, repository, authority, or emulator configuration. |
| Focused regressions | 129 option-row, stylesheet, and playtest-contract tests passed after the final review correction. The preserved candidate stress report covers 30 width/text-scale frames (240–768px, 100–300%) with zero hard failures at the supported 320px+/200%-or-less range. A later browser rerun could not be retained as a clean, source-matched second report, so this record relies on the completed lane run. |

Before/after captures cover phone, tablet, desktop, and table-width states, plus 320px/150–200% text crops and Mobile Safari comparison captures under `shots/`. The layout-normalized report compares 288 default-text states; the expected changed text-bearing elements are disclosed in `layout-normalized-diff.txt`.

## Not covered (still open)

Physical iOS/Android hardware, real keyboards and browser-chrome collapse, a native `<select>` popup (OS-owned), screen readers, Windows
High Contrast, a real TV, Firefox. At 250-300% text on a 320-375px phone a 13-14 letter name is wider than the whole row and still breaks
inside it (reported by the probe, never overflow): the remaining physical limit of this layout. This branch is unmerged and was not deployed;
the prior staging result validates only the deployed baseline.
