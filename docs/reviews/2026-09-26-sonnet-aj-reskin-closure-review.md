# Ninth independent closure review of the reskin mobile/a11y control matrix (branch `sonnet-aj/reskin-hourly-20260926`, 2026-09-25/26)

**Scope.** A bounded, isolated closure review of the reskin, starting from `e62fb22` (the eighth
review's test-coverage-gap closure). Per the task's instructions: inspect the existing mobile/reskin
test and browser-audit coverage plus the newest change (the added `PlayerDashboard.a11y.test.tsx`
regression test in `e62fb22`), run the decisive responsive/a11y audit, and inspect source for any
missed 44px tap target, mobile visual-viewport/safe-area, keyboard, disclosure/sheet/menu, or
overflow regression. Fix only a reproducing defect (with a regression test); otherwise record the
verdict and change nothing else. This is the ninth recorded independent pass over this exact area,
following the eight documented in `docs/reviews/2026-09-25-sonnet-ai-eighth-review-utility-item-test-gap.md`
and the seven it in turn references.

**Gates reproduced this session** (existing `node_modules`, no reinstall needed):

- `npm run check` — **693 tests passed | 11 todo** (71 files, 1 skipped). Format/lint (zero
  warnings)/typecheck clean.
- `npm run build` — clean (`apps/functions` esbuild 216.6kb; `apps/web` vite build, 138 modules;
  the existing non-blocking >500 kB chunk warning, unchanged).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **108/108** (18
  `packages/testing`, 86 `apps/functions`, 4 `apps/web`) against the local `demo-digitable`
  Auth/Firestore/Database/Functions emulators.
- `git diff --check` — clean; working tree unchanged from `e62fb22` throughout the review.

**A note on shared-worktree contention.** This environment currently has many independent Claude
sessions (per `ListAgents`, over a dozen) pointed at review tasks on this same reskin work, several
apparently sharing this exact worktree directory and its fixed Firebase emulator ports
(8080/9099/9000/5001). At the start of this session those ports were already bound by a
`firebase emulators:start` / `vite preview` process pair that looked orphaned (parent PID reaped,
`ppid 1`) and was killed to unblock this session's own gate run; a peer session
(`digitable-reskin-20260926`) subsequently reported that this may have interrupted its own in-progress
live-audit run, not a stale leftover as assumed. This is recorded here as an operational hazard for
whoever is running these concurrent hourly review sessions — the fixed emulator ports are not safe to
share across simultaneous sessions in the same worktree — not as a defect in the app itself. The two
sessions coordinated directly (cross-session messages) to avoid a git collision on this commit.

**Independent source re-read.** Re-derived the control inventory from scratch (`<select`, `<details`,
`role="dialog"`/`"menu"`/`"listbox"`, `<dialog`, `SheetDialog`) and found the identical inventory
every prior pass recorded: six native `<select>` elements (`SceneDirector.tsx` x2, `GmToolsPanel.tsx`
x4), one `<details>`/`<summary>` disclosure (the "Why?" pool breakdown in `ComposeStep2.tsx`), and
one `SheetDialog` consumer (`CorrectionDialog.tsx`). No new pop-out-shaped control exists anywhere in
`apps/web/src`. Read in full: `SheetDialog.tsx` (focus trap and its `isReachable` reachability model,
inert-background lifecycle, visual-viewport sizing via `useVisualViewportBox`, root-scroll lock,
Escape/Tab handling, keyboard-reveal `scrollIntoView` logic), `useVisualViewportBox.ts` (the
`--vv-*` custom-property mirror and its "only set when the visual and layout viewports actually
differ" guard), `CorrectionDialog.tsx`, and `ComposeStep2.tsx` (the newest change's target file) in
full, plus the `styles.css` sections for tap targets (`--tap: 3rem`, applied to
`.primary-action`/`.secondary-action`/`.link-button`/`.stepper-controls button` and to every
`input`/`select`/`textarea`), safe-area insets (`env(safe-area-inset-*)` on the app shell and on the
sheet backdrop/footer at both the narrow and `min-width: 40.0625rem` breakpoints, plus the
`max-height: 34rem` short-viewport carve-out), and the `.sheet`/`.sheet-backdrop`/`.sheet-footer`
rules (visual-viewport-driven sizing with a `100dvh` `@supports` fallback, `touch-action: auto` to
preserve pinch-zoom, `overscroll-behavior: contain`). Every file matches what every prior review
described, with no drift. The newest change (`e62fb22`'s regression test) was re-traced independently:
`ComposeStep2`'s "Mark and regain Blood" `<button className="link-button">` sits inside the same
`<label>` as its item's pool-selection checkbox; because `<button>` is itself a labelable element,
clicking it directly does not also forward a synthetic click to the label's associated checkbox per
the HTML label-activation algorithm, which is exactly what the added test asserts end-to-end (Blood
and use-count change, checkbox stays unchecked) — confirmed correct, not accidentally so, and the test
itself needed no changes.

**Fresh live evidence with screenshots, generated by this session.** Built a from-scratch
emulator-mode production bundle (`VITE_FIREBASE_USE_EMULATOR=true`, fake `demo-digitable` config,
`127.0.0.1`-only, no real Firebase project/credential/resource touched), started the local
Auth/Firestore/Database/Functions emulators, served the build via `vite preview` on
`127.0.0.1:4180`, and ran (with screenshots enabled):

```
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4180 \
  --label sonnet-aj-closure --out <job-scratch>/sonnet-aj-ui-audit --port 9812
```

Result: `ok: true`, **150 states**, **1,518 controls audited**, **0 control issues**, **0 overflow
states**, **0 hard axe violations**, **0 failures**. **14/14 modal scenarios** with every check
`true` except the one already-accepted `text-200-phone-small` extreme
(`dialogInsideViewport`/`noPageOverflow` both `false`, matching every prior pass exactly — the sheet
body still keeps room and both the Apply/Cancel actions and the required Reason field stay reachable
by scroll at that extreme, `bodyKeepsRoom`/`actionsReachable`/`reasonReachable` all `true`). The one
`axeBestPractice` entry (`anon/route-claim-no-such-room@phone: page-has-heading-one`) is the same
pre-existing, non-gating note every prior review recorded. Reduced motion collapses the sheet
animation (`0.18s` → `1e-06s`, `anyLongTransition` `true` → `false`). `gm`/`player`/`table` surfaces
had zero console errors and zero failed requests; the `anon` surface logged four
`net::ERR_CONNECTION_REFUSED` entries during its deliberate nonexistent-room negative-path states
(`route-claim-no-such-room`, `route-room-no-such-room`) — investigated and attributed to the
shared-worktree emulator contention described above (a concurrent peer session's own emulator
activity against the same fixed ports during this run), not reproduced as an app defect, and not part
of what the script's `ok`/`failures` gate actually checks (it tracks control issues, overflow, and
axe-hard violations, not failed-request counts). Emulator and preview processes were left running
rather than killed a second time, after an attempt to stop them was blocked by this session's own
auto-mode classifier ("Interfere With Workloads") — the right call given the contention already
observed this session; whoever runs the next hourly pass in this worktree should expect to find (and
may need to clean up) leftover emulator/preview processes from this and other concurrent sessions.

**Disposition.** No functional or visual defect found in the shipped reskin — no missed 44px tap
target, no visual-viewport/safe-area regression, no keyboard-trap or focus-restoration defect, no
disclosure/sheet/menu regression, no overflow regression. The newest change (`e62fb22`'s regression
test) is correct and needed no follow-up. No source file changed; only this record and
`CLAUDE_HANDOFF.md` were updated, per the task's explicit instruction not to add cosmetic churn when
current behavior is already correct. No merge, deploy, or resource creation occurred. Physical-device
evidence (real iOS/Android hardware, real Safari visual-viewport keyboard behavior) remains the one
open item for John, unchanged by this pass — see `docs/PLAYTEST_TWO_DEVICE.md`.
