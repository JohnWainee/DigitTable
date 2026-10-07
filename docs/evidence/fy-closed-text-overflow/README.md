# fy: closed-sheet 320 px / 200% text overflow (2026-10-07)

Candidate `354e7c9` (reskin lineage `ccb9f2d`). Local Firebase emulators + local `vite preview` builds only; nothing deployed.

## Defect

The fu audit (`docs/reviews/2026-10-06-fu-fresh-popout-audit-review.md`) recorded, but never measured with the sheet **closed**, a ~5 px page overflow at 320 px with 200% root text. With the sheet closed that is real horizontal page scroll. New gating audit scenarios (`text-{150,200}-phone-small-closed`, `text-200-phone-closed`) measured it on the unmodified candidate:

- `ui-audit-baseline-failing.json`: `text-200-phone-small-closed` `pageOverflowPx: 5`. Offenders: `label.gear-option` laid out 65 px wide with 198 px of content, inside `fieldset` > `li.pending-action-card` > `ul` > `section.step`.
- Cause: rem-scaled padding/gap at every nesting level leaves the check box row ~65 px at 32 px root text, and the bare-text label (no `<span>`, so the existing `.gear-option > span` wrap rule did not apply) cannot break inside a long word.

## Fix (`apps/web/src/styles.css`)

`.gear-option, .form-field--checkbox`: `min-width: 0`, `overflow-wrap: anywhere`, padding-inline and gap `min(rem, vw)`. Every `fieldset` and the shared card rule (`.pending-action-card`, `.roster-panel-list li`, `.threat-list li`, `.roster-card`) get the same cap on padding. `min-height: var(--tap)` (44 px) is untouched. The cap only bites below about 544 px viewport width: at default text size card/fieldset padding drops from 13.6 px to 8 px at 320 px wide and 9.4 px at 375 px; 768 px and wider are unchanged. Long option names now break mid-word instead of widening the page.

## Results (`ui-audit-after.json`)

| Check | Result |
| --- | --- |
| State x viewport captures | 150 |
| Controls audited | 1,518; 0 control issues (target <44 px, off-viewport, text entry <16 px) |
| Horizontal-overflow states | 0 |
| axe hard violations (real colour contrast) | 0 (best-practice: `page-has-heading-one` on the intentional nonexistent-room route) |
| Closed-sheet 320/150%, 320/200%, 375/200% | pass (were: 320/200% fail) |
| Open-sheet 320/200% `dialogInsideViewport`, `noPageOverflow` | now pass; no longer exempted as informational |
| `npm run check` | 717 passed, 11 todo |
| `npm run test:emulator` | 18 + 86 + 4 passed |
| `two-device-smoke.mjs --reload` (local emulators) | 17/17, no overflow at 375/768/1024/1280/1920 |

Screenshots (phone 375, tablet 768, desktop 1280, table 1920 for the pending-action console; sheet at three widths; 320 px at 200% text with the sheet open).

The baseline run audited 1,422 controls, not 1,518: the player allocation states render a different number of dice controls between runs (fixture variance, not CSS). The closed-sheet scenario also asserts its preconditions (sheet closed; `.pending-action-card .gear-option` rows present). Independent review: `docs/reviews/2026-10-07-fy-closed-text-overflow-independent-review.md`.

## Limits

Headless Chrome only. The audit's root `font-size` override does not scale `em` media queries; no real iOS Safari/Android keyboard, screen reader, forced-colors or physical-device pass.
