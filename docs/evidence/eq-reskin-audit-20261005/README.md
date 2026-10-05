# Fresh reskin and pop-out audit, lane `sonnet-eq` (2026-10-04 HST / 2026-10-05)

Base: `5ef9c2b` (the reviewed, unmerged `sonnet-eo` tip, which contains the `sonnet-em` option-row fix). This worktree started at
`b599abd`, held no commits of its own, and was fast-forwarded to `5ef9c2b` before any work. **Not merged, not deployed.** No Firebase
project, cloud resource, secret, authorization, projection, engine, template, asset or dependency change. Staging was not contacted and
**this does not validate staging with the current code**.

## Result in one paragraph

The audit that every earlier lane ran (geometry, scrolling, focus, contrast, text size, viewport and keyboard emulation) is clean
again on this tip: 288 states, 3,256 controls, zero failures. This lane added one probe none of them had: **the browser Back action
with the correction sheet open.** That found a real defect. The sheet is not a route and owned no history entry, so on a phone the
Android Back button or an iOS Back tap navigated the hash router from the director console to the previous route, destroying the sheet,
the text being typed and the whole console in one gesture (real Chrome and real iOS Safari, before/after below). Fixed in
`apps/web/src/shared/useBackDismiss.ts` (used by `SheetDialog`); presentation only; 8 regression tests; real-Chrome and real-Safari
before/after evidence; independent review in `docs/reviews/2026-10-05-eq-sheet-back-dismiss-independent-review.md`.

## The defect, measured

| | Before (unfixed bundle) | After (fix) |
| --- | --- | --- |
| Real Chrome, 390x844 touch, sheet open with a reason typed, `history.back()` | route `#/room/<id>/gm` -> `#/create`, `dialog: false`, `console: false`, 1 `hashchange` (`sheet-history-probe-before.log`) | sheet closes, same route, console mounted, 0 `hashchange` (`sheet-history-probe-after.log`, scenarios A, B, C pass) |
| Real iOS 26.5 Safari (iPhone 17 Pro Simulator), tap Safari's Back with the sheet open | lands on an empty "Create a session" form (`ios/before-ios26-unfixed/`); `testBackClosesOnlyTheSheet` FAILS "the director console is still mounted" | sheet gone, Scene director / Pending actions / Roster with Iryna's Correct button still on screen (`ios/after-ios26/`); test passes |
| Real iOS 27.0 Safari (iPhone 18 Pro Simulator) | not run | `testBackClosesOnlyTheSheet` passes |

Why earlier lanes missed it: `ui-audit.mjs` drives the sheet by clicking and measuring; nothing pressed Back. Why it matters: Back is the
natural way to dismiss a bottom sheet on Android (and an easy accident on iOS edge swipes), and the GM's half-written reason, which the
correction form requires, was lost with it.

## What changed

- `apps/web/src/shared/useBackDismiss.ts` (new): while a sheet is open it holds ONE same-URL history entry (`pushState` without a URL
  fires no `hashchange`, so the router never sees it). Back pops it, `popstate` fires, and `onClose` runs; every other close (Cancel,
  Apply, Escape) drops the entry again with `history.back()` so a later Back is not swallowed. The release is deferred one tick and
  cancelled by a re-run so React `StrictMode` (used in `main.tsx`) cannot close the sheet as it opens; it only releases an entry that
  still carries this sheet's own marker; ids are `sheet-<uuid>` so a marker left by a reload is never mistaken for a live one.
- `apps/web/src/shared/SheetDialog.tsx`: calls the hook; doc bullet.
- `apps/web/test/shared/useBackDismiss.test.tsx` (new, 8 tests): one same-URL entry and no route change; Back closes the sheet and runs
  `onClose` once without navigating; Cancel drops its entry and does not re-fire `onClose`; Escape likewise; StrictMode keeps the sheet
  open with one push; a stale marker from a previous page life is not reused; a foreign `replaceState` leaves history alone; with two
  stacked sheets Back closes only the top one. Mutation-checked: 6 mutations by the author and 10 by the independent reviewer, each failed
  a named test (plus the fixed-id mutation for the stale-marker test).
- `scripts/playtest/sheet-history-probe.mjs` (new): the real-Chrome probe above, with an `--expect-failures` negative control that
  requires the intended failure signature.
- `scripts/playtest/ios-simulator/UITests/SafariFlowUITests.swift`: `testBackClosesOnlyTheSheet` presses Safari's real Back control (the
  toolbar minimizes to the address pill after scrolling and draws no Back button, so the test taps the pill to expand it first).
- `scripts/playtest/ios-simulator/run.sh`: **two rig fixes found on the way.** (1) A single `xcodebuild test -only-testing:...` run right after a
  Swift edit resolved the test names against the previous bundle, executed 0 tests and exited 0 (reported "passed": a vacuous pass hit
  twice here); it now builds with `build-for-testing`, then `test-without-building`. (2) It fails when no test executed.

## Verification (this lane's own runs; isolated ports 61xxx, project id `demo-digitable-eq`; peers' stacks untouched)

| Check | Result |
| --- | --- |
| Baseline `npm run check` on `5ef9c2b` (`check-base.log`) | exit 0, 854 passed, 11 todo |
| `npm run check` with the change (`check-after.log`) | exit 0, 862 passed, 11 todo; 1 pre-existing lint warning |
| Full `npm run build` (Functions + web) | exit 0 on an APFS clone of the exact tree under `/private/tmp` (see "Environment note") |
| Real-browser `ui-audit.mjs`, BEFORE bundle (`ui-audit-before-report.json`) | 288 states, 3,256 controls, 0 control/overflow/hard-axe/contrast failures, 87 keyboard-focus, 275 dock-focus, 4 pinch, 8 validation, 23 sheet cases, 0 console or request errors; one best-practice note (`page-has-heading-one` on the intentional no-such-room route) |
| Real-browser `ui-audit.mjs`, AFTER bundle (`ui-audit-after-report.json`) | 288 states, 3,384 controls, same zero failures, 451 dock-focus, 23 sheet cases; same single best-practice note |
| Final bundle (after the last source edit, the `sheet-<uuid>` id): `sheet-history-probe.mjs` (`sheet-history-probe-after.log`), its negative control against the unfixed bundle (`sheet-history-probe-before-negative-control.log`: A fails with route `#/create`, console gone, 1 `hashchange`, "failed as intended"), and `ui-audit.mjs --modal-only` (`ui-audit-final-bundle-sheet-cases.log`) | probe A, B, C pass; control fails as intended; 23 sheet cases, 0 failures |
| `two-device-smoke.mjs --reload` (GM/player/table playthrough) | before bundle (`smoke/report.json`): ALL 17 STEPS PASSED incl. no horizontal overflow at 375/768/1024/1280/1920; final bundle (`smoke/final-bundle-smoke.log`): ALL 17 STEPS PASSED |
| Real Mobile Safari, iPhone 17 Pro iOS 26.5 | join-form validation, correction sheet with keyboard and native `<select>` picker, signed-in dock: all pass (the correction-sheet test failed once on the fresh device in the known rig-typing flake, "Neither element nor any descendant has keyboard focus", and passed on rerun) |
| Real Mobile Safari, FIXED bundle, iPhone 17 Pro iOS 26.5, whole class (correction sheet with keyboard, picker, Cancel; join validation; signed-in dock) | all three pass on the fixed build, i.e. the sheet's keyboard/Cancel paths and the history release behave in real Safari. The new Back test, first in that run, failed once in the shared setup (`scene loaded`, 30 s wait right after the emulator stack was restarted: a Functions cold start; its own Back assertions in that same run were true: Back tapped, sheet closed, console mounted) and passed on a warm rerun |
| Real Mobile Safari, iPhone 18 Pro iOS 27.0 | the same three tests pass (3 executed, 0 failures), plus the new Back test |
| Real Mobile Safari, iPhone 17e iOS 26.5 | join-form validation and dock pass; correction sheet passed on rerun after the same first-run flake |
| Emulator suites (`emulator-suite.log`; APFS clone under `/private/tmp`, every port remapped to 61xxx, project id `demo-digitable-eq`) | 18 rules + 86 Functions + 4 web passed, exit 0. A first attempt failed the 4 web tests only because that test hard-codes project `demo-digitable` while my isolated stack used a different id (the emulator logged "Requested project ID demo-digitable, but the emulator is configured for demo-digitable-eq"); the id was aligned in the clone and the whole suite rerun |

The audit matrix covers native selects, details, SheetDialog, the action dock, allocation/action pickers, keyboard-short and
safe-area cases, pinch and 150/200% text at 320, 375, 390, 412 phone, landscape (812x375), 768 tablet, 1280 desktop and 1920 table.

## Screenshots

`shots/before/` and `shots/after/`: landing, player compose, GM pending actions, correction sheet and table-after-roll at phone-small
(320), phone (375), landscape, tablet, desktop and 1920 table where the state exists. The Back fix changes no pixels at rest, so the two
sets are the same designs; the behavioural before/after is in `ios/`. Full-page captures show the sticky dock at the viewport position
it had when captured (a capture artifact; the pinned behaviour is asserted by the dock cases and shown correct in the real Safari
captures `ios/after-ios26/` and the dock captures of the iOS runs).

## Independent visual read (author)

Ink-black surfaces, acid-yellow/riot-red/cyan/hot-pink accents, torn-paper art, grain and hard shadows read coherently at every width;
hierarchy is clear (page title, taped panel labels, one yellow primary action per panel). No visual defect found; no cosmetic churn made.

## Environment note (for the next lane)

This worktree lives under `~/Documents`. A freshly installed `esbuild` binary run from there blocks forever in `open()` (macOS privacy
consent for the process, which a headless session cannot answer), so `npm run build`, `npm run build --workspace @digitable/functions`
and `npm run test:emulator` (which builds Functions) hang at 0% CPU in this worktree; the independent reviewer hit the same. They run
fine on an APFS clone under `/private/tmp` (`cp -cR <worktree> /private/tmp/<name>`, then remove the `.git` file): that is how the build
and emulator results here were produced. `vite build` and `vitest` are unaffected.

## Not covered (residual, needs physical devices or other tools)

Physical iPhone and Android hardware (real Back gesture and system Back button, notched landscape, Safari's tab-bar/address-bar
collapse), VoiceOver/TalkBack/NVDA, Windows High Contrast, a real TV, Firefox, an OS-drawn native `<select>` popup (captured but not
measured), a word wider than a whole row at 250-300% text on 320-375px (contained, non-overflowing). The Back probe issues
`history.back()` from script, so Chrome's history-manipulation intervention is not exercised there; the Safari test presses the real
control. Forward after a Back-dismiss lights up for one dead same-URL entry and does nothing visible; this is documented in the hook.
