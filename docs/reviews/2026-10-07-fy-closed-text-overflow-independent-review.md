# fy closed-sheet large-text overflow: independent review

- **Date:** 2026-10-07
- **Base:** `354e7c9` (reskin candidate lineage `ccb9f2d`). Presentation-only change: `apps/web/src/styles.css`, `apps/web/test/styles/reskinContract.test.ts`, `scripts/playtest/ui-audit.mjs`, evidence and docs. No engine, contracts, template, authorization, projection or Firebase file is touched (confirmed by the reviewer from `git diff --stat`).
- **Author:** Sonnet fy session. **Reviewer:** a separate fresh subagent, read-only (git diff, file reads, JSON inspection); it did not run the suite or audit or view the screenshots.
- **Verdict:** approve with changes. All actionable findings are resolved below.

## Finding dispositions

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Defect real and evidenced (baseline JSON: `pageOverflowPx: 5`, `label.gear-option` 65 px wide, 198 px content; the labels in `PendingActionsPanel.tsx` have no `<span>` so the existing wrap rule never applied) | Confirmed, no action. |
| 2 | CSS regression risk low; behaviour change: long names now break mid-word instead of widening the page | Accepted, documented. |
| 3 | Shared-selector scope undisclosed: the padding edit also reaches `.roster-panel-list li`, `.threat-list li`, `.roster-card`, and every `fieldset` | Accepted (consistent nested-chrome behaviour is intended); README now lists them. |
| 4 | README understated the default-size effect (padding 13.6 to 8 px at 320 px wide, to 9.4 px at 375 px; nothing changes from about 544 px up) | README corrected. A text-size-scoped rule was considered and rejected: `em` media queries do not track the audit's root override, and `min()` is simpler and monotonic. |
| 5 | Test 3 (44 px target) passes on old CSS (guard, not regression); tests are source-text checks | Accepted; the live gate is the audit scenario. Test 3 is kept as a guard against a future edit that trades the target for padding. |
| 6 | Closed-sheet scenario could pass vacuously; no precondition | Fixed: `sheetClosed` and `optionRowsPresent` checks added to the scenario. Unused `informationalChecks` plumbing left (harmless). |
| 8 | Baseline had 1,422 controls vs 1,470 after (player allocation fixture variance, not CSS) | Noted in README. |
| 9 | Handoff/review record missing | This file and the `CLAUDE_HANDOFF.md` entry. |
| 10 | Evidence size (~2.9 MB) | Kept to eight screenshots plus two reports; the fq lane committed a larger set. |

## Not verified

Real iOS Safari/Android, screen readers, forced-colors, RTL; checked-row look at 320 px/200% was not inspected in a screenshot by the reviewer.
