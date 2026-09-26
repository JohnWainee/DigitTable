# Tenth independent review of the reskin mobile/a11y control matrix (branch `sonnet-aj/reskin-hourly-20260926`, 2026-09-26)

**Scope.** A second, separately-dispatched independent session (self-identified `digitable-reskin-20260926`,
sharing this exact worktree directory with the ninth review's session — see "A note on cross-session
sharing" below) auditing the same required matrix from `docs/reviews/2026-09-26-sonnet-aj-reskin-closure-review.md`
(the ninth review): every select, menu, disclosure, modal, drawer, option list, allocation/action
picker, and button at phone (320/375px, dynamic viewport/keyboard), tablet, desktop, and table
widths, plus WCAG contrast, keyboard/touch semantics, reduced motion, and projection-isolation
concerns. Read `AGENTS.md`, `CLAUDE_HANDOFF.md`, and the canonical docs it points to before touching
anything, per the task's instructions.

**Independent source re-read, broader surface than prior passes.** Rather than confine the read to
the pop-out-adjacent files prior reviews already covered in depth, this pass read every screen and
panel component under `apps/web/src` that renders an interactive control, end to end, from scratch:
`SheetDialog.tsx`, `AllocationStepper.tsx`, `useVisualViewportBox.ts`, `ChooseInjuryPanel2.tsx`,
`ComposeStep2.tsx`, `CorrectionDialog.tsx`, `GmToolsPanel.tsx`, `SceneDirector.tsx`,
`RosterPanel.tsx`, `AllocationPanel2.tsx`, `ConfirmSummary2.tsx`, `PendingActionsPanel.tsx`,
`InvitePanel.tsx`, `GmSeatRequired.tsx`, `GmDirectorScreen.tsx`, `PlayerDashboardScreen.tsx`,
`TableDashboardScreen.tsx`, `JoinScreen.tsx`, `JoinTableScreen.tsx`, `ClaimCharacterScreen.tsx`,
`CreateSessionScreen.tsx`, `LandingScreen.tsx`, `ConnectionStatusStrip.tsx`, and
`FixtureModeBanner.tsx`. Every one matches what prior reviews described, with no drift since `e62fb22`.

Independently re-derived the pop-out control inventory by grep (`<select`, `<details`, `<summary`,
`role="dialog"`/`"menu"`/`"listbox"`/`"alertdialog"`, `<dialog`, `SheetDialog`, `role="spinbutton"`,
`popover`) and found the same six native `<select>`s (`GmToolsPanel.tsx` x4, `SceneDirector.tsx`
x2), one `<details>`/`<summary>` disclosure (`ComposeStep2.tsx`), one `SheetDialog` consumer
(`CorrectionDialog.tsx`), and one `role="spinbutton"` (`AllocationStepper.tsx`) as every prior pass.

**A structural check beyond grep: an automated class-less-`<button>` scanner.** Wrote a small Node
script (not committed — a one-off verification aid, not project tooling) that parses every
`<button ...>` opening tag across every `.tsx` file under `apps/web/src` and flags any missing a
`className` attribute, independent of the existing `reskinContract.test.ts` regex (which already
covers this, but this pass wanted its own, differently-implemented check). It flagged six
class-less buttons: the two `.stepper-controls` +/- buttons in `AllocationStepper.tsx` and four more
in `CorrectionDialog.tsx` (the Blood-delta and per-item use-count steppers). Read the surrounding
markup for all six and confirmed every one sits inside a `.stepper-controls` container, which sizes
descendant `<button>`s via `apps/web/src/styles.css`'s `.stepper-controls button { min-height:
var(--tap); min-width: var(--tap); ...; touch-action: manipulation; }` (line 382) and its visual
variant at line 1247 — the same documented class-less exception every prior review has recorded, not
a new instance of the tap-target defect the fifth-review-chain's `5663d7f` fixed. No class-less
button exists anywhere outside `.stepper-controls`.

**Gates reproduced from scratch, independently** (fresh `npm install` in this worktree, which had no
`node_modules` at this session's start):

- `npm run check` — **693 tests passed | 11 todo** (71 files, 1 skipped). Format/lint (zero
  warnings)/typecheck clean.
- `npm run build` — clean (`apps/functions` esbuild 216.6 kb; `apps/web` vite build, 138 modules;
  the existing non-blocking >500 kB chunk warning, unchanged).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **108/108** (18
  `packages/testing`, 86 `apps/functions`, 4 `apps/web`) against a freshly started local
  `demo-digitable` Auth/Firestore/Database/Functions emulator stack.
- `git diff --check` — clean; the only working-tree change from the fresh `npm install` (the
  immaterial `package-lock.json` `"peer": true` metadata churn every prior review in this series has
  discarded) was reverted with `git checkout -- package-lock.json`, not committed.

**A note on cross-session sharing (operational, not a code defect).** This session and the ninth
review's session (`digitable-sonnet-aj-reskin-hourly-202609-56`) were both dispatched with the
identical working directory `/private/tmp/digitable-sonnet-aj-reskin-hourly-20260926` — not two
separate worktree copies of the same branch, but the literal same filesystem path, confirmed via
`git worktree list` (one entry) and `ListAgents` (two live peer sessions). Both sessions' first live
UI-audit attempts against this shared directory's fixed Firebase emulator ports (8080 Firestore, 9099
Auth, 9000 Database, 5001 Functions) failed: this session's own `scripts/playtest/ui-audit.mjs`
timed out twice in a row at the identical step ("timed out waiting for: player reveal", `states: 60`,
zero console errors, zero failed requests on the stuck device) after the ninth review's session,
observing this session's detached (`ppid 1`, from a backgrounded-and-disowned `firebase
emulators:start`) processes and judging them orphaned leftovers, killed them mid-run to unblock its
own port bind. The two sessions traced this collaboratively over direct cross-session messages and
coordinated the commit order below to avoid a git race. Given the ninth review's session had already
produced full, fresh, screenshot-backed live-audit evidence (`ok: true`, 150 states, 1,518 controls,
0 control issues, 0 overflow states, 0 hard axe violations, 14/14 modal scenarios) by the time this
was diagnosed, this session did not re-attempt a third live browser audit run in the same contended
environment — duplicating that evidence a second time would have added more concurrent load to the
same shared ports rather than new information. This is recorded as an operational hazard for whoever
schedules concurrent hourly sessions against this task, not as anything wrong with the shipped app;
separately flagged as product feedback (two hourly job dispatches landing on the identical worktree
path) outside this repository.

**Disposition: no functional or visual defect found**, corroborating the ninth review's verdict via
an independently and more broadly re-read source surface, an independently-implemented structural
check (the class-less-button scanner), and independently reproduced gates. No missed 44px tap
target, visual-viewport/safe-area regression, keyboard/focus defect, disclosure/sheet/menu
regression, or overflow regression. No source file changed; only this record and `CLAUDE_HANDOFF.md`
were updated. No merge, deploy, or resource creation occurred. Physical-device evidence (real
iOS/Android hardware, real Safari visual-viewport keyboard behavior) remains the one open item for
John, unchanged by this pass — see `docs/PLAYTEST_TWO_DEVICE.md`.
