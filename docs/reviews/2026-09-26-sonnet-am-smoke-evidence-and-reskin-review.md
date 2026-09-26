# Sixth independent review of the mobile pop-out defect, plus a smoke-evidence-handling fix (2026-09-26)

**Scope.** Starting from `factory/today-integration` at the now-integrated `13b380b` (folds in the
eighth independent review's promoted utility-item regression test), this session was asked to (a)
independently re-audit every select/menu/disclosure/modal/drawer/option-list/action/allocation
picker across phone/tablet/desktop/table dimensions — the same defect area five prior independent
passes have already covered
([`2026-09-24-sonnet-w-utility-item-tap-target-review.md`](2026-09-24-sonnet-w-utility-item-tap-target-review.md),
[`2026-09-25-sonnet-w-ui-audit-roster-selector-review.md`](2026-09-25-sonnet-w-ui-audit-roster-selector-review.md),
[`2026-09-25-sonnet-y-reskin-integration-independent-review.md`](2026-09-25-sonnet-y-reskin-integration-independent-review.md),
[`2026-09-25-sonnet-ad-mobile-popout-independent-review.md`](2026-09-25-sonnet-ad-mobile-popout-independent-review.md),
[`2026-09-25-sonnet-af-mobile-popout-independent-review.md`](2026-09-25-sonnet-af-mobile-popout-independent-review.md))
— and (b) inspect a fresh staging smoke report's `net::ERR_NETWORK_CHANGED` entries and determine
whether the playtest harness improperly reports success despite failed network events.

## Part A: mobile pop-out re-audit — no new defect

`git diff 930e3f1..13b380b -- apps/web/src/styles.css apps/web/src/shared apps/web/index.html`
is empty: the pop-out system (`SheetDialog`, the six native `<select>`s, the one `<details>`
disclosure, the `AllocationStepper` spinbutton) has had no source change since the last fully
independently reviewed reskin evidence. `git diff 2452f66..13b380b` (since the fifth independent
pass) touches only `CLAUDE_HANDOFF.md`, two review docs, and one new test
(`apps/web/test/player2/PlayerDashboard.a11y.test.tsx`, confirmed by reading `a219acc`'s diff to be
a regression test for an existing utility-item button's click behavior — no production source
changed).

**Live evidence generated this session:** a from-scratch emulator-mode production build
(`VITE_FIREBASE_USE_EMULATOR=true`, fake `demo-digitable` config, no real Firebase project/
credential/resource touched) served via `vite preview` on `127.0.0.1`, run against the local
Auth/Firestore/Functions emulators (shared with a concurrent, unrelated long-running local session
— `firebase emulators:start`, confirmed alive for 5+ hours via `ps`, on the fixed default ports;
this only added throwaway rooms, the same non-destructive sharing pattern recorded in the A08
integration write-up). `node scripts/playtest/ui-audit.mjs --no-shots`: **150 states**, **1,434
controls audited**, **0 control issues**, **0 overflow states**, **0 hard axe violations**, **0
failures**, with only the same two already-documented, non-gating items every prior pass recorded
(the 320px+200%-text geometry extreme, logged by the script itself as `INFO ... recorded, not
gating`; the intentional nonexistent-room route's best-practice heading note). `node
scripts/playtest/two-device-smoke.mjs --no-images --reload`: **17/17 steps passed**, zero device
console/network failures. One transient, unrelated flake (a single timeout waiting for
`#scene-reason` on one run) occurred amid several runs against the shared local emulator and
cleared on an immediate identical retry — the same class of shared-emulator contention flakiness
`docs/reviews/2026-09-25-sonnet-y-reskin-integration-independent-review.md` and
`2026-09-25-sonnet-af-mobile-popout-independent-review.md` already recorded, not an application
defect.

**Disposition: no new defect found, no code change made for this part.** This is the sixth
independent pass over this exact defect area and agrees with all five prior passes.
Physical-device evidence (real iOS/Android hardware, real Safari visual-viewport keyboard
behavior) remains the one open item for John, unchanged by this pass.

## Part B: smoke-evidence-handling defect — found, fixed, and regression-tested

**Finding.** Inspecting the freshest staging smoke report
(`/private/tmp/digitable-staging-playthrough-20260926-hourly-0800/report.json`, and two other
unreviewed automation reports from the same family) showed `"net::ERR_NETWORK_CHANGED"` recorded in
every device's `failedRequests`, yet the run printed `"ALL STEPS PASSED"` and exited 0. Reading
`scripts/playtest/two-device-smoke.mjs` confirmed the root cause: `report.ok` was computed as
`!failed && report.steps.every((s) => s.ok)` — it never inspected `consoleErrors` or
`failedRequests` at all, despite the script capturing both into `report.json` for every device.
`scripts/playtest/ui-audit.mjs` was only partially better: it already failed on `consoleErrors`,
but never checked `failedRequests` either. This matters because multiple independent reviews and
`CLAUDE_HANDOFF.md` itself have repeatedly cited "no console errors or failed requests" from these
scripts' exit status/summary as release evidence (e.g.
`docs/reviews/2026-09-18-staging-independent-playtest-review.md`); the harness's own pass/fail
signal did not actually back that claim for `two-device-smoke.mjs`, and only half-backed it for
`ui-audit.mjs`.

**Fix.** Added `scripts/playtest/deviceHealth.mjs`, a small pure module shared by both scripts:

- `isGenuineNetworkFailure(params)` — true only when a `Network.loadingFailed` event was neither
  canceled by the browser nor deliberately caused by this harness's own `Network.setBlockedURLs`
  (`--no-images`/`--block`). This second condition was *not* anticipated going in — it surfaced
  during live verification: running `two-device-smoke.mjs --no-images` against a real Chrome
  instance produced `Network.loadingFailed` events for every blocked image with
  `blockedReason: "inspector"`, `canceled: false`, and an empty `errorText`, which the new
  `failedRequests` check would otherwise have flagged as false positives on every `--no-images`
  run. Confirmed live via a debug capture of the raw CDP params before writing the fix. Only the
  literal `"inspector"` reason is excluded (not any truthy `blockedReason`) — a genuine CSP or
  mixed-content block is a real app failure this harness should still surface, per this session's
  independent reviewer's nit.
- `deviceFailureReasons(device)` / `collectDeviceFailures(devices)` — turn a device's captured
  `consoleErrors`/`failedRequests` into human-readable failure reasons.

`two-device-smoke.mjs`'s `Network.loadingFailed` listener now gates on `isGenuineNetworkFailure`,
and `report.ok` now also requires `collectDeviceFailures(allDevices).length === 0` (logged before
the final PASS/FAIL line). `ui-audit.mjs`'s listener gets the same gate, and its per-device check
now calls `fail(\`device/${device.name}\`, reason)` for every reason from `deviceFailureReasons`
(previously only console errors). A new Vitest project (`scripts/playtest/vitest.config.ts`,
registered in the root `vitest.config.ts`) and `scripts/playtest/test/deviceHealth.test.mjs` (10
tests) cover the pure functions, including the exact `net::ERR_NETWORK_CHANGED` regression and the
exact `blockedReason: "inspector"` false-positive regression this session found live.

**Verification.**

- `npm run check` — format/lint (zero warnings)/typecheck clean; **703 tests passed | 11 todo**
  (73 files, 1 skipped; baseline 693 + 10 new).
- `npm run build` — clean (existing non-blocking >500 kB chunk warning only).
- `git diff --check` — clean; `package-lock.json` churn from this session's fresh `npm install`
  (the same immaterial `"peer": true` metadata diff every prior review in this series discarded)
  was reverted, not committed.
- `npm run test:emulator` — not rerun standalone: the default emulator ports were held the entire
  session by a separate, long-running local `firebase emulators:start` process (confirmed via
  `ps`, alive 5+ hours, an unrelated concurrent session's own long-running suite, not a transient
  `emulators:exec`). This change touches only `scripts/playtest/**` and the root
  `vitest.config.ts` project list — no file in `packages/testing`, `apps/functions`, `apps/web`, or
  the Firestore/RTDB rules changed, so this suite's last recorded 108/108 result is unaffected and
  stands.
- **Live evidence (this session, against the shared local `demo-digitable` emulator described in
  Part A):** before the fix, `two-device-smoke.mjs --no-images` correctly failed
  (`FAIL device: gm: 5 failed request(s)`, etc.) — proving the new check actually fires. After
  adding the `blockedReason` exclusion, the identical command passed cleanly (`ok: true,
  deviceFailures: []`), repeated twice more after later edits. `ui-audit.mjs` (which never sets
  blocked URLs) stayed clean throughout every rerun in Part A.

**Independent review.** A fresh, isolated Sonnet reviewer with no access to this session's
reasoning verified the diff directly (not the prompt's summary), confirmed `report.ok`'s new
computation is a pure conjunction with the prior expression and so can only turn a previous PASS
into a FAIL, never the reverse; searched the repository for any consumer of `report.json`'s `ok`/
`deviceFailures` fields or the renamed `console/${device.name}` → `device/${device.name}` fail-scope
strings (none found); confirmed each new test is a genuine regression test (mentally reverting any
one of the three exported functions breaks a specific test); and confirmed the change touches
nothing outside `scripts/playtest/**` and the root Vitest project list. Verdict: **approve, one
non-blocking nit** — `isGenuineNetworkFailure` should exclude only `blockedReason === "inspector"`,
not any truthy `blockedReason`, so a genuine CSP/mixed-content block stays a reported failure. That
nit is applied above, with its own regression test.

**Disposition: real, narrowly-scoped, independently reviewed and regression-tested fix.** No
production application code, Firestore/RTDB rules, engine, or contracts file changed; no merge,
deploy, resource creation, or promotion occurred. Committed and pushed alongside this record and
the `CLAUDE_HANDOFF.md` update per the handoff protocol.
