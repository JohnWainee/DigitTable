# Independent review — sonnet-fo option rows with an action (2026-10-06)

Reviewer: a fresh-context subagent (not the author), read-only, given the working-tree diff, the
new test, the evidence directory and `AGENTS.md`. It ran `npx vitest run apps/web` (283 passed),
`tsc -p apps/web --noEmit` (clean), `prettier --check` and eslint on the touched files (clean); it did
not run the browser audit or any Safari check.

**Verdict: APPROVE WITH FIXES. No P0/P1.** No behaviour, authorization, projection or engine change:
handlers, `disabled`, `checked` and payloads are byte-identical; the new `.gear-option > button` rules
reach only the GM Reveal row (every other `.gear-option` is a label with no direct-child button).

| # | Pri | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | P2 | Every item row became ~17px taller: label `min-height: var(--tap)` inside a row that already had the min-height, padding and border. | Fixed: the label carries the row's padding and `min-height: calc(var(--tap) - 4px)`; the row has `padding: 0`. Row is 48px again. |
| 2 | P2 | The row's own padding was outside the label, so tapping it no longer toggled the checkbox. | Fixed with #1 (padding moved into the label, whole row is the target). |
| 3 | P3 | `cursor: default` rules for the disabled row were dead (equal specificity, declared earlier than `.gear-option:has(:disabled)`), so the whole row showed `not-allowed`. | Fixed: `.gear-option.gear-option--row:has(:disabled)` selectors; stylesheet test pins both. |
| 4 | P3 | Action indent hand-summed and not aligned with the text at large text on a phone. | Indent now includes the label padding; the `9vw` cap is kept deliberately (room beats alignment on a ~130px column) and recorded with the 200% residual. |
| 5 | P3 | `gear-option-action` was added to the "tap-rule-named" allow-list. | Fixed: it is a layout hook accepted only on a button that also carries a covered class. |
| 6 | P3 | Test constant names stale; click test did not assert the item was disabled. | Fixed: renamed, and the click test asserts `poolEligible === false` and the checkbox disabled. |
| 7 | P3 | Audit skipped the accessible-name check if the checkbox was absent; width not checked against the tap size. | Fixed: item rows must have a checkbox; `min(width, height) >= 43.5`. |
| 8 | P3 | 200% crops at 320px are clipped (text column ~130px). | Accepted; recorded as a known limitation, not described as fixed. |

Not verified by the reviewer: the browser audit, the mutation check (reasoned only), and the
claim that the 47px overflow at 320px/200% pre-exists without these rows (the author's own
measurement, `overflowWithoutRows` in `probe-summary.json`).

Second pass: the author re-ran, after the fixes, the focused tests (52), the mutation check (4 fail
with the fix reverted), the real-Chrome audit on the fixed build (150 states, 0 failures) and on the
`6f5896e` build (41 failures, all `option-rows/*`), `npm run check` (710), `npm run build` and
`npm run test:emulator` (18 + 86 + 4). The fixes were CSS/test/audit refinements of the reviewed
design, so no further reviewer round was run; that is an author re-verification, not a third review.
