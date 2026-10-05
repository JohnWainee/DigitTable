# Pop-out Back-dismiss and fresh reskin audit: independent review

- **Date:** 2026-10-05 (session clock 2026-10-04 HST)
- **Branch:** `worktree-digitable-sonnet-eq-reskin-20261005` (lane `sonnet-eq`), fast-forwarded from `b599abd` to the reviewed `sonnet-eo` tip `5ef9c2b`, plus this change. Unmerged, undeployed.
- **Reviewer:** one independent Claude review agent in a fresh context, read-only on the worktree, mutation-testing copies under `/private/tmp`, no access to the author's reasoning. It reviewed the source, tests, probe and rig changes; it did not review these documents.
- **Verdict:** **approve with nits.** No blocker or high finding. One verification gap (the full `npm run build` hangs in the reviewer's sandbox) was closed by the author, see R1.

## What was reviewed

A presentation-only fix to a real mobile pop-out defect found by this lane's audit:

- With the GM correction sheet open, the browser **Back** action (Android system Back or gesture, iOS Safari back, desktop Back) navigated the hash router to the previous route. Measured in real Chrome, 390x844 touch emulation: with a reason typed, Back went from `#/room/<id>/gm` to `#/create`, destroying the sheet, the typed reason and the whole director console in one gesture. The sheet is not a route and owned no history entry. No earlier lane pressed Back (`ui-audit.mjs` proves geometry, scrolling, focus and viewport behaviour only).
- Fix: `apps/web/src/shared/useBackDismiss.ts`, used by `SheetDialog`. While a sheet is open it holds one same-URL history entry; Back pops it and closes the sheet; every other close drops the entry again.

Files: `apps/web/src/shared/useBackDismiss.ts` (new), `apps/web/src/shared/SheetDialog.tsx` (two lines and a doc bullet), `apps/web/test/shared/useBackDismiss.test.tsx` (new), `scripts/playtest/sheet-history-probe.mjs` (new real-Chrome probe with a negative control), `scripts/playtest/ios-simulator/UITests/SafariFlowUITests.swift` (new real-Safari test), `scripts/playtest/ios-simulator/run.sh` (rig hardening). Nothing under `packages/*`, `templates/*`, `apps/functions`, rules, routing, projections, authorization, assets or dependencies changed; no secrets.

## Findings and dispositions

| ID | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| R1 | Medium (verification gap) | The reviewer's full `npm run build` hung at 0% CPU in `@digitable/functions` (`esbuild`), three times; `vite build` for the web app passed. | Not a code defect, reproduced and explained: this worktree lives under `~/Documents`, and a freshly installed `esbuild` binary reading files there blocks in `open()` waiting on a macOS privacy (TCC) consent a headless session cannot answer (`sample` showed the main thread parked in `open`; no FIFO and no dataless file exists in the tree; the same step passed in an APFS clone under `/private/tmp`). The author ran the **full `npm run build` on an APFS clone of this exact tree: exit 0**, web bundle 906.86 kB. Recorded in the handoff so the next lane does not rediscover it. |
| R2 | Low | A sheet closing while its entry is not on top (stacked sheets closing out of order, or a hash navigation while a sheet is open) leaves a dead same-URL entry; the doc comment listed only the reload leftover. | Accepted as designed (the app has one modal sheet, so neither path is reachable by a person); doc comment now lists all three leftovers and says why they are harmless. |
| R3 | Low | `sheetCounter` restarts at 1 on reload, so an id could collide with a stale marker in `history.state` and skip the push; it behaved correctly "by accident". | **Fixed:** ids are `sheet-<uuid>` (`newUuid`, which works on plain-http LAN pages). New test seeds a stale `sheet-1` marker and requires a fresh push; mutation (fixed id) fails it. |
| R4 | Low | Probe `--expect-failures` exited 0 if scenario A failed for any reason (selector, timing). | **Fixed:** requires the intended signature (route changed AND console gone). |
| R5 | Low | The probe issues `history.back()`/`el.click()` through `Runtime.evaluate`, so Chrome's history-manipulation intervention (real Back UI skips entries made without user activation) is not exercised. | Documented in the probe header; the real-Safari test presses the real Back control and covers it. |
| R6 | Nit | Swift test name said "swipe" but taps Back first; could false-fail on other static text containing "Correct ", and a `buttons` 'Back' query might match web content. | **Fixed:** renamed `testBackClosesOnlyTheSheet`; synthesized edge swipe removed (it did not start Safari's gesture on the unfixed build, so it proved nothing); query widened to every descendant and the fallback is a logged coordinate tap. The reviewer found no other "Correct " static text or 'Back' web button in `apps/web/src`. |
| R7 | Nit | `run.sh` regex is right for XCTest. | No change. The author separately found and fixed a worse hole the guard exposed: a single `xcodebuild test -only-testing` right after a Swift edit enumerated the PREVIOUS bundle and ran 0 tests with exit 0 (a vacuous pass, hit twice). `run.sh` now does `build-for-testing` then `test-without-building`, and fails when no test executed. |
| R8 | Process | No handoff, evidence or review record in the diff yet. | This file, `docs/evidence/eq-reskin-audit-20261005/`, and the `CLAUDE_HANDOFF.md` update. |
| R9 | Gap | No test for Escape, reload/stale marker, Back after a hash navigation, Forward, or the `onClose` ref. | Escape and stale-marker tests added (8 tests now). Back-after-hash-navigation and Forward are not modelled (the hook closes on any `popstate` whose marker is gone, which covers both); the `onClose` ref is not distinguishable by any test because equivalent closures are passed. |

## Reviewer-verified (positive)

- StrictMode: cleanup schedules a deferred release that the effect re-run cancels; `markedBy(id)` stops a second push; one entry results. Cancel, Escape and Apply: the listener is removed first, so the release's own pop never re-fires `onClose`. Back-dismiss runs `onClose`, identical to Cancel and Escape (`setCorrectingCharacterId(null)`), so semantics match. `pushState` without a URL fires no `hashchange`; nothing else in `apps/web/src` reads `history.state`.
- Mutation testing in a copy: ten mutants (no `clearTimeout`, unconditional `back()`, unconditional popstate close, listener not removed, no `pushState`, immediate release, always push, release never backs, `pushState` with a URL, shared marker) each failed a named test. The author separately ran six more; all killed.
- Real Chrome, local in-memory mode: probe A/B/C pass with the fix; against a bundle without the call, A fails with exactly `{"hash":"#/create","dialog":false,"console":false,"hashChanges":1}` and `--expect-failures` exits 0.
- Reviewer-run gates: `npm run check` exit 0 (860 passed, 11 todo; 1 pre-existing lint warning); `npm run build -w @digitable/web` exit 0.

## Not verified by the reviewer

The iOS Simulator test and `run.sh` end to end; the probe against the Firebase emulators; real iOS Safari and Android Chrome hardware; the full repo build (closed by the author, R1).
