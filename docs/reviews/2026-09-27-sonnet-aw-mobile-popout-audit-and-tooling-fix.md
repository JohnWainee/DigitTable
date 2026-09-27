# 2026-09-27: mobile pop-out re-audit (sonnet-aw) — tooling regression found and fixed

## Scope

Independent audit from `origin/main` at `b599abd` (the deployed sourcebook-roster candidate) of
every player, GM, and table flow for the previously-reported mobile pop-out defect (the GM
correction bottom sheet), across 320/375/812-landscape/768/1280/1920 px, using the real-Chrome
CDP-driven `scripts/playtest/ui-audit.mjs` against the live staging candidate
(`https://digitable.signal-bleed.com`, project `powerglove-1cd23`), per the pattern of the prior
nine-plus rounds of this same audit recorded across `CLAUDE_HANDOFF.md` and sibling review
documents.

## Finding: the audit script itself was silently broken, not the product

`openCorrection()` in `scripts/playtest/ui-audit.mjs` located the GM correction sheet's trigger
by matching a roster row whose text started with `"rook"` (the original placeholder character).
The sourcebook roster (`5e8907b`, 2026-09-19) replaced "Rook" with six real characters (Iryna,
Nicole, Cosgrave, Chuck, Astrid, Flint) and no character is named "Rook" any more. Since that
commit, every run of this script has silently timed out inside `openCorrection()` before ever
reaching the modal/pop-out checks (`auditModal`) that are the actual subject of this recurring
audit — the state/control/axe sweep of the other screens still ran and still reported clean, so
the failure was easy to miss.

First confirming run against staging at the current commit reproduced this exactly:
`FAIL flow: [gm] timed out waiting for: Rook's Correct button`, with only 108 states/1020 controls
audited (everything up to, but not including, the correction sheet).

## Fix

`scripts/playtest/ui-audit.mjs`'s `openCorrection()` now finds any `.roster-panel-list button`
whose trimmed text is exactly `"Correct"`, instead of matching one fixture character's name.
Confirmed against `apps/web/src/gm2/RosterPanel.tsx`: every roster row renders exactly one such
button, always enabled, so the first match is sufficient regardless of which characters ship.
Test-tooling only; no engine, contracts, template, Functions, or rules file changed.

## Verification after the fix

- Re-ran against staging: `UI AUDIT PASSED` — **150 states, 1,494 controls audited, 0 control
  issues, 0 overflow states, 0 hard axe violations.** The modal/correction-sheet audit now
  actually executes (visible via the `INFO modal-text-200-phone-small` lines), with no new
  failures. The only residuals are the two already-documented, non-gating limitations: the
  best-practice heading warning on the intentional nonexistent-room route, and the 320 px +
  200% text geometry limit on the correction sheet (both previously recorded in
  `CLAUDE_HANDOFF.md`).
- `npm run check` — format, lint, typecheck, **690/690 tests passed | 11 todo** (71 files passed,
  1 skipped).
- `npm run build` — Functions and web builds passed (existing non-blocking chunk-size warning
  only).
- Firebase emulator suite, run on an isolated alternate port set (a concurrent sibling session
  held the default emulator ports) with `PATH=/opt/homebrew/opt/openjdk/bin:$PATH`: **108/108**
  tests passed (18 `packages/testing`, 86 `apps/functions`, 4 `apps/web`).
- `git status`/`git diff --stat` after cleanup: only `scripts/playtest/ui-audit.mjs` changed.

## Independent review

A fresh reviewer agent (no shared context with the author) independently: read
`RosterPanel.tsx` and confirmed the new selector's correctness and robustness; read the full
`openCorrection`/`closeCorrection`/`auditModal` functions and grepped the repo for any other
"rook" reference needing the same fix (found none — remaining hits are unrelated
`ROOK_ID`-style fixture identifiers in engine/template test files); confirmed the diff is scoped
to test tooling only with no engineering-invariant or scope-discipline concern; and independently
re-ran the staging audit itself, confirming `UI AUDIT PASSED` with the modal audit executing and
no timeout failures. Verdict: **PASS, no concrete issues found.**

## Disposition

No new product UI/UX defect exists in the current candidate. This audit's only actionable
finding was in test tooling (now fixed and verified), not in the reskin itself. This is
consistent with the extensive audit history since the ink-black reskin landed — the standing gap
remains a physical-device rehearsal (`CLAUDE_HANDOFF.md`'s "Next action"), not a code fix.
