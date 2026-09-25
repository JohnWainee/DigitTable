# Reskin integration candidate (`c220dd2`) — fourth independent pass

- **Date:** 2026-09-25
- **Branch:** `sonnet-ab/reskin-followup-20260925` (fresh, isolated worktree; no access to prior
  sessions' reasoning beyond what is committed)
- **Candidate reviewed:** the same tap-target/audit-selector candidate as the three prior passes
  (`5663d7f` tap-target fix, `5cdee1a`/`edbb634`/`c220dd2` review records, `c77cd94` roster-agnostic
  audit selector), on top of `b599abd`
- **Comparison baseline:** `factory/today-integration` (`841099a`), unchanged since the third pass —
  confirmed by `git fetch` and `git log -1` against both the local worktree and `origin`
- **Verdict:** **approve, no blocker, no source change.** Fourth independent pass agrees with the
  prior three. All quality gates and the real-browser UI audit were re-run fresh this session (not
  merely cited) and reproduce the recorded results.

## Scope

Act as a fresh, independent follow-up owner: re-audit every player/GM/table select, menu,
disclosure, modal, drawer, option list, and allocation/action picker at phone, tablet, desktop, and
table widths (viewport, keyboard, safe area, zoom, touch target, reduced motion, accessibility), on
top of the diff already carried by this branch against `factory/today-integration`, and decide
whether a real, non-duplicative defect remains before doing anything else.

## Step 1: is the diff against `factory/today-integration` unchanged?

`git fetch origin` and `git log -1 --oneline` against both `origin/factory/today-integration` and
the local `today-integration` worktree both show `841099a` — unmoved since the third pass's review.
`git diff --stat 841099a..HEAD` shows exactly the same eight files the third pass already reviewed
(`CLAUDE_HANDOFF.md`, `ChooseInjuryPanel2.tsx`, `ComposeStep2.tsx`, `reskinContract.test.ts`, three
review docs, `ui-audit.mjs`). No new commits landed on this candidate since `c220dd2`.

## Step 2: independent control audit — did I find anything the first three passes missed?

Rather than re-read the prior reviews' prose as ground truth, I re-derived the control inventory
directly:

- `grep -rn "<select\|<details\|role=\"dialog\"\|role=\"menu\"\|role=\"listbox\"\|role=\"spinbutton\"\|<dialog" apps/web/src` —
  every pop-out-shaped control in the app: six native `<select>`s (`SceneDirector.tsx` x2,
  `GmToolsPanel.tsx` x4), the one `<details>` disclosure (`ComposeStep2.tsx`, the "Why?" pool
  explanation), `SheetDialog.tsx`'s `role="dialog"` correction sheet, and `AllocationStepper.tsx`'s
  `role="spinbutton"`. This matches the inventory the third pass's `git diff 930e3f1..HEAD -- ...`
  check already established as unchanged since the last fully-reviewed reskin evidence.
- `grep -rn "<button" apps/web/src --include="*.tsx" | grep -v className` as a first-pass sweep,
  then read `apps/web/test/styles/reskinContract.test.ts`'s `stepperControlsRanges()` and the
  "never adds a `<button>` with no className at all outside `.stepper-controls`" test in full: its
  regex (`/<button\b[^>]*?>/gs` with a separate `className=` test) correctly spans multi-line JSX
  attribute lists, not just same-line matches — so the naive single-line grep undercounts, but the
  actual static test does not. Re-confirmed `stepperControlsRanges()`'s depth-counting logic against
  both real `.stepper-controls` consumers (`AllocationStepper.tsx`, `CorrectionDialog.tsx`).
- Read `ChooseInjuryPanel2.tsx` and `ComposeStep2.tsx` directly: both previously-classless buttons
  now carry `className="link-button"`, both remain native `<button>` elements (keyboard-operable by
  default, no custom role needed), and no other control in either file lost coverage.

No new defect found. The fix, its regression test, and the pop-out/select/disclosure inventory are
exactly as the third pass described.

## Step 3: fresh quality gates (run this session, not cited)

From a clean `npm install` in this worktree:

- `npm run check` — format (Prettier) clean, lint (ESLint 9, zero warnings) clean, typecheck (5
  workspaces) clean, **692 tests passed | 11 todo** (71 files passed, 1 skipped) — matches the
  recorded baseline exactly.
- `npm run build` — clean: `apps/functions` esbuild bundle 216.6kb; `apps/web` Vite build, only the
  pre-existing non-blocking >500kB chunk-size warning.
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **108/108** tests passed against
  the local `demo-digitable` Auth/Firestore/Functions emulators (18 `packages/testing`, 86
  `apps/functions`, 4 `apps/web`), matching the recorded baseline exactly.
- `git diff --check` — clean.

## Step 4: fresh real-browser UI audit (run this session, not cited)

Built a live-mode `apps/web` production bundle (`VITE_FIREBASE_USE_EMULATOR=true` against a fake
`demo-digitable` config), started the Auth/Firestore/Functions emulators and `vite preview` bound to
`127.0.0.1` only (no LAN exposure), then ran:

```
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4174 --label sonnet-ab-independent \
  --out <job-tmp>/ui-audit-out --port 9762 --no-shots
```

Result: `ok: true`, **150 states**, **1,578 controls audited**, **0 control issues**, **0 overflow
states**, **0 hard axe violations**, **0 failures**. The only entries recorded are the same two
pre-existing, already-documented, non-gating items every prior pass has recorded: the `320px + 200%
text` `dialogInsideViewport`/`noPageOverflow` geometry note on `modal-text-200-phone-small`, and the
`page-has-heading-one` best-practice note on the intentional nonexistent-room route. The control
count (1,578) differs slightly from the prior passes' 1,530/1,470 — consistent with the audit
script's documented non-deterministic scenario branching, not a regression (no `controlIssues`,
`overflowStates`, or `failures` changed). This covers the full required matrix (phone-small 320,
phone 375, phone-landscape, tablet 768, desktop 1280, table 1920) plus dynamic-viewport-keyboard
emulation, pinch-zoom, safe-area insets, 200% text, and reduced-motion on/off, across all four roles
(gm/player/table/anon), with zero console errors and zero failed requests. Background emulator/
preview processes were bound to `127.0.0.1` and stopped after the run; nothing was deployed or
committed from the emulator-mode build.

## Step 5: staging playthrough evidence

The most recent live staging playthrough
(`/private/tmp/digitable-staging-playthrough-20260925-factory-follow-up/report.json`, run against
`https://digitable.signal-bleed.com`, started `2026-09-25T03:17:17Z`) was inspected directly: all 17
named GM/player/table steps `ok: true`, zero console errors, zero failed requests on any of the
three device roles, and no horizontal overflow at 375/768/1024/1280/1920px (the one `-15` entry for
`table@1920` is negative, i.e. content narrower than viewport, not an overflow). This evidence is
current (same day) and this candidate makes no change to any code path that playthrough exercises
beyond what the fresh local `ui-audit.mjs` run above already covers directly (the two fixed buttons
and the roster-agnostic audit selector are `apps/web`-only, not part of the deployed staging build,
which per `CLAUDE_HANDOFF.md` still serves commit `5e8907b`). Per the task's instruction to rerun
staging only if its evidence is insufficient or this session's changes require it: neither applies,
so it was not rerun.

## Disposition

No new defect found; no source change made. This is the fourth independent pass over this exact
candidate (after `docs/reviews/2026-09-24-sonnet-w-utility-item-tap-target-review.md`,
`docs/reviews/2026-09-25-sonnet-w-ui-audit-roster-selector-review.md`, and
`docs/reviews/2026-09-25-sonnet-y-reskin-integration-independent-review.md`); all four agree, and
this pass independently reproduced every required gate (format/lint/typecheck/unit tests, build,
full emulator suite, real-browser accessibility/geometry audit) from a clean install rather than
trusting prior evidence. The candidate remains ready to fold into `factory/today-integration` at
John's discretion. This review does not merge, deploy, or promote anything; only this review file and
the corresponding `CLAUDE_HANDOFF.md` entry were added.
