# Reskin verification (2026-09-29) — independent review

- **Branch:** `sonnet-ca-reskin-orchestrated-20260929`, from deployed `main` at `b599abd`. Reviewed commit: `4e698ee`.
- **Reviewer:** one Claude general-purpose agent in a fresh context, read-only on the worktree, mutation experiments in a `/private/tmp` copy. It did not run a browser or the emulators.
- **Verdict:** approve with nits. No P0/P1 findings.

## Defects found by the author's fresh audit

1. **Audit harness (lineage gap).** `scripts/playtest/ui-audit.mjs` on `main` still looked for a roster item named "Rook". The shipped roster no longer has one, so the audit aborted after 108 of 150 states with `timed out waiting for: Rook's Correct button` and every mobile-sheet scenario was skipped. The fix `c77cd94` (recorded in `2026-09-25-sonnet-w-ui-audit-roster-selector-review.md`) existed on other branches but was never in `main`'s lineage; it is cherry-picked here.
2. **320 px + 200% text page overflow (4 px).** Stacked rem paddings (shell > step > card > fieldset > option) left about 67 px for a check-box row that needs about 98 px. Inline gutters and gaps are now capped with viewport-relative `min()` (`5vw`/`4vw`/`3vw`); identical to before at 375 px and wider, at most 0.8 px tighter at 320 px default text. The 320 px/200% audit scenario is now fully gating (it was recorded-only).

## Reviewer verification

- `npm run check`: exit 0, 693 passed, 11 todo.
- 8 single-line CSS reversions each fail the new "caps every stacked inline gutter" test; making the audit scenario non-gating fails the gating test.
- Default-font layout unchanged at 375/390/768+; `max(..., env(safe-area-inset-*))` still wins on shells; no later cascade or `@media` override defeats the caps.

## Nits and disposition

1. The gating and selector contract tests are source-string pins. Accepted; the real-browser audit is the proof. Its run on this exact CSS/harness (before commit, no later code change): 150 states, 1,470 controls, 0 control issues, 0 overflow states, 0 hard axe violations, 0 failures, no INFO (non-gating) lines — `docs/evidence/ca-reskin-20260929/after/report.json`. Old CSS with the fixed harness recorded the `phone-small` 200% `dialogInsideViewport`/`noPageOverflow` failures — `before/report.json`.
2. Gutters shrink only at 320 px with large text. Intentional.

## Verification of the author (this branch)

`npm run check` 693 passed | 11 todo; `npm run build` exit 0; `npm run test:emulator` 18 + 86 + 4 passed; `two-device-smoke.mjs --reload` against local emulators 17/17; `git diff --check` clean.

## Not verified

Physical devices, iOS Safari visual-viewport keyboard, Safari/Firefox/Android, screen readers, Windows High Contrast, and the deployed staging URL. Nothing was deployed. Remaining axe best-practice note: `page-has-heading-one` on the intentional nonexistent-room route.
