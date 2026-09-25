# Reskin integration candidate (`c77cd94`) — third independent review

- **Date:** 2026-09-25
- **Branch:** `sonnet-y/reskin-integration-20260925` (fresh, isolated worktree; no access to the
  author's or prior reviewers' reasoning beyond what is committed)
- **Commits reviewed:** `5663d7f` (tap-target fix), `5cdee1a` (docs: second-pass review record),
  `c77cd94` (roster-agnostic audit selector), all on top of `b599abd`
- **Comparison baseline:** `factory/today-integration` (`841099a`), the deployed/staging
  consolidated branch
- **Verdict:** **approve, no blocker.** Real, non-duplicative delta over `factory/today-integration`. No
  further source change made.

## Question 1: is this candidate a real, non-duplicative improvement over `factory/today-integration`?

Yes, confirmed by direct inspection, not by trusting the commit messages:

- `git log factory/today-integration..HEAD` shows exactly these three commits are absent from
  `factory/today-integration`; `git log HEAD..factory/today-integration` shows only two unrelated
  docs-only staging-smoke commits (`841099a`, `a350b2d`) absent from this branch.
- `git show factory/today-integration:apps/web/src/player2/ChooseInjuryPanel2.tsx` and
  `...ComposeStep2.tsx` still contain the two class-less `<button type="button" onClick=...>`
  elements this candidate fixes — the defect is live and unpatched on the comparison branch today.
- `git diff factory/today-integration..HEAD -- apps/web/test/styles/reskinContract.test.ts
  scripts/playtest/ui-audit.mjs` confirms neither the new class-less-button contract test nor the
  roster-agnostic audit selector exist on `factory/today-integration`.

This is a genuine gap in the deployed/staging candidate, not a re-landing of something already
present there.

## Question 2: is the fix itself correct?

Independently re-verified, not just re-read:

- `apps/web/src/styles.css` line 381-386: `.primary-action, .secondary-action, .link-button,
  .stepper-controls button { min-height: var(--tap); min-width: var(--tap); ...; touch-action:
  manipulation; }`, and `--tap: 3rem` (48px, scales with root font size) is defined in `:root`.
  `className="link-button"` on both buttons genuinely lands them in this rule — not a dead class
  reused only in prose.
- The new `reskinContract.test.ts` test ("never adds a `<button>` with no className at all outside
  `.stepper-controls`") was read in full: `stepperControlsRanges()` correctly depth-counts nested
  `<div>`s so it doesn't truncate at the first nested child (verified against the only other
  `.stepper-controls` consumers, `AllocationStepper.tsx` and `CorrectionDialog.tsx`, both of which
  nest a `role="spinbutton"` div inside). The exclusion logic is sound.
- The two prior independent reviews recorded in `docs/reviews/2026-09-24-sonnet-w-utility-item-tap-target-review.md`
  and `docs/reviews/2026-09-25-sonnet-w-ui-audit-roster-selector-review.md` were read in full and
  their claims spot-checked against the actual diffs; both are accurate.

## Question 3: broader control audit (menus/disclosures/modals/drawers/pop-outs/allocation pickers) at phone/tablet/desktop/table widths

`scripts/playtest/ui-audit.mjs`'s `VIEWPORTS` constant was read directly and covers exactly the
required matrix: `phone-small` (320x568), `phone` (375x812), `phone-landscape` (812x375), `tablet`
(768x1024), `desktop` (1280x800), `table` (1920x1080), plus dedicated dynamic-viewport-keyboard
emulation, safe-area, and 150%/200% text-scaling scenarios (all present in the script body, not
just its header comment).

Real-browser evidence exists and was independently inspected (not just cited):
`/private/tmp/digitable-sonnet-w-post-utility-ui-audit-complete/report.json`, `label:
"post-utility-item-fix-complete"`, `ok: true`, `summary: { states: 150, controlsAudited: 1530,
controlIssues: 0, overflowStates: 0, axeHardViolations: 0, failures: 0 }`, one pre-existing
non-blocking best-practice note (`page-has-heading-one` on the intentional nonexistent-room route,
already documented and non-gating). This run post-dates and exercises both fixed buttons, the
roster-agnostic correction-sheet selector, and the "Recover your seat" form. No source change was
needed as a result of this inspection — the evidence already demonstrates the fix holds at every
required width, including 320/375px dynamic-viewport/keyboard cases.

The pop-out system itself (`SheetDialog`, native `<select>`s, the one `<details>` disclosure) has no
source change in this candidate or since the last fully-reviewed reskin evidence
(`docs/reviews/2026-09-18-sonnet-d-reskin-independent-review.md`, commit `930e3f1`) — reconfirmed by
`git diff 930e3f1..HEAD -- apps/web/src/styles.css apps/web/src/shared apps/web/index.html`
returning empty from this branch's tip.

## Question 4: privacy/authorization/projection isolation, licensing

Out of scope for this candidate's actual diff: no file under `packages/*`, `templates/*`,
`apps/functions`, `firestore.rules`, `database.rules.json` changed. The two touched buttons'
`onClick` handlers (`onUseHat`, `onUseUtilityItem`) are unchanged — only a `className` attribute was
added to each. No licensed text, art, or terminology was introduced or touched.

## Gates reproduced independently this session

- `npm run check` — format, lint (zero warnings), typecheck, **692 tests passed | 11 todo** (71
  files passed, 1 skipped) — matches the branch's recorded result.
- `npm run build` — clean (`apps/functions` esbuild 216.6kb; `apps/web` vite build; pre-existing
  non-blocking >500kB chunk warning only).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **blocked this session**: ports
  9099/8080/4400 were already bound by a concurrent process in this shared sandbox (a different
  worktree session), not by this branch's own work. Not force-killed, consistent with the shared
  git-stash/worktree coexistence expectations for this environment. No Functions, rules, contracts,
  or engine file is touched by this candidate (confirmed by `git diff factory/today-integration..HEAD
  --stat`), so the branch's last recorded complete emulator evidence (18 `packages/testing` + 86
  `apps/functions` + 4 `apps/web` = 108/108, `docs/reviews` / `CLAUDE_HANDOFF.md` "Independent audit:
  reskin mobile pop-out defect" section) remains the applicable evidence, not superseded or
  contradicted by anything found here.
- Real-browser `ui-audit.mjs`: not rerun this session (evidence already exists post-dating this
  exact candidate, independently inspected above); rerunning would only reproduce the same result
  since no source file it audits changed since that run.

## Disposition

No new defect found. No source change made — the existing fix, test, and evidence are correct,
narrow, and sufficient. This is the third independent pass over this candidate (after
`docs/reviews/2026-09-24-sonnet-w-utility-item-tap-target-review.md` and
`docs/reviews/2026-09-25-sonnet-w-ui-audit-roster-selector-review.md`); all three agree. Recommend
this candidate be considered ready to fold into `factory/today-integration` at John's discretion.
This review does not merge, deploy, or promote anything.
