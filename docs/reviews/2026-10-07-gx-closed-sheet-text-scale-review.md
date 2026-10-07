# gx closed-sheet text-scale fix: independent review

- **Date:** 2026-10-07
- **Branch:** `sonnet-gx/reskin-uiux-20261007`, on `354e7c9`.
- **Author:** Sonnet gx session. **Reviewer:** a separate fresh-context subagent, read-only, static inspection plus the style-contract suite (it did not run a browser).
- **Scope:** presentation only: `apps/web/src/styles.css`, `apps/web/test/styles/reskinContract.test.ts`, `scripts/playtest/ui-audit.mjs`, evidence and docs. No engine, contracts, template, Functions, rules, projection, authorization, asset or licensed-text file changed (confirmed by the reviewer from `git status`).

## What was chosen and why

The fu audit left one recorded, unfixed item: ~5 px overflow at 320 px with 200% text, measured only with the sheet open, "with the sheet closed ... not measured". Measuring it (new closed-sheet sweep) showed it was larger and broader than recorded: with no pop-out open, six states scrolled sideways at 320 px / 200% (player compose/paused 47 px, allocation 12 px, GM console 5 px) and option-row labels spilled out of their rows on 25 states at 320, 375 and 390 px. Evidence: [`docs/evidence/gx-reskin/`](../evidence/gx-reskin/README.md).

## Review findings and dispositions

| # | Reviewer finding | Disposition |
| --- | --- | --- |
| 1 | **should-fix:** the page-width gate cannot see label text spilling out of its row (it lands in the chrome to the right), and bare-text labels have no `overflow-wrap`; the reviewer estimated a ~13 px spill for the fixture word "wreckage" at 320 px / 200%. | **Measured, then hardened.** Added `SPILL_AUDIT` (scrollWidth > clientWidth on option rows, fieldsets, panels, party chips, status pill, list cards). It flags 25 states on the unfixed build (so it detects the problem, including 320/150% and 375/390/200% spills the old gate never saw) and **0** on the candidate across 100 text-scale checks, so the estimated spill did not occur with the shipped fixtures. Kept the hardening anyway: `.gear-option, .form-field--checkbox` now has `min-width: 0; overflow-wrap: anywhere`, and the spill check fails the run. Both pinned by tests. |
| 2 | **nit:** the check glyph (0.95 rem) and radio dot (0.75 rem) are larger than the shrunken 26.4 px box at 320 px / 200%. | **Fixed.** Both now scale from `--fit-check` (`* 0.575` / `* 0.4545`, equal to the old sizes at default). Pinned by a test. |
| 3 | **nit:** tap-target concern. | **No change needed.** The label row is the tap target (`min-height: var(--tap)`), and `CONTROL_AUDIT` measures it; the box stays >= 23 px at 280 px / 200%. |
| 4 | **nit:** test gaps: `.join()` over all `fieldset` rules would miss a later bare-rem override; nothing pins `.sheet-*` or later overrides of the shell padding. | **Accepted, not changed.** Only one rule matches each selector today; the browser audit is the backstop for an override. |
| 5 | **nit:** `OVERFLOW_OFFENDERS` returns nothing when two independent elements overflow; flag comment; `--tolerate-baseline` still exits 0. | **Offender fallback fixed** (right-edge scan). The `--tolerate-baseline` behaviour is existing and intentional (used to record "before" runs); the evidence "before" run used it, the candidate runs did not. |
| 6 | Candidate overflow outside the audited states: `.party-member`, `.party-member-name` and `.connection-status` have no `overflow-wrap`, so a long unbroken display name could widen them at 320 px / 200%. | **Recorded, not changed** (outside the measured defect; fixtures fit; no 280 px or landscape-200% sweep exists). Listed in the evidence README's known limits. |

The reviewer confirmed: default rendering is unchanged at 320 px and wider (each token's vw coefficient times 3.2 equals the rem size times 16); `max(var(--fit-gutter), env(safe-area-inset-*))` is valid and the test pins all four insets; making `text-200-phone-small` gating cannot hide a failure; none of the new test selectors is vacuous.

## Re-check of the remediation delta

The same reviewer re-read the post-review delta (option-row `overflow-wrap`, scaled glyph and dot, `SPILL_AUDIT`, the offender fallback, screenshots) and found **no bug**: the `calc()` sizes are valid and stay inside the 2 px border box down to about a 9 px box; `overflow-wrap: anywhere` has no harmful side effect on rows with an icon or a span; the regex escaping is correct. Two minor limits it noted, both accepted and recorded here: `SPILL_AUDIT` cannot see a spill that stays inside an element's own padding box (the enclosing `fieldset` and `.step` checks catch larger ones), and it skips boxes with `overflow-x` other than `visible`, so a future `overflow: hidden` on a row would silence it for that row. The style-contract test pins that the glyph and dot use `--fit-check` but not the 0.575 / 0.4545 coefficients; the browser audit would still catch an overflow. This was a re-check by the original reviewer, not a second fresh reviewer.

## Verification of the final tree

Run on the final candidate (after the hardening above):

- `npm run check`: format, lint, typecheck, **721 passed, 11 todo** (baseline 714; 7 new).
- `npm run build`: passed (existing chunk-size warning only).
- `ui-audit.mjs`: 175 states, 0 control issues, 0 overflow states, 0 axe hard violations, 17 modal scenarios all gating and passing, 100 text-scale checks with 0 overflow and 0 spill.
- `two-device-smoke.mjs --reload` against a local build and emulators: 17/17.
- `npm run test:emulator` (from a scratch clone with remapped ports; the lane's own emulator held the defaults): 18 rules/testing, 86 Functions, 4 web passed.
- The new style-contract tests fail on the pre-fix stylesheet (6 failures) and pass on the fix.

## Not verified

No physical iOS Safari or Android device, on-screen keyboard, screen reader, Windows High Contrast, or browser font-size-setting pass; no staging playthrough of this build; no 280 px or landscape-at-200% sweep; real-font metrics (the audit uses this machine's Chrome fonts, and Impact is not present on Android or Linux).
