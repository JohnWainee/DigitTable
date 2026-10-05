# Mobile pop-out audit: Back dismisses the open sheet, lane `sonnet-et` (2026-10-04)

Base `5ef9c2b` (the reviewed, unmerged `sonnet-eo` tip). Not merged, not deployed; no Firebase project, cloud resource, secret,
authorization, projection, engine, template or asset change. Staging was not contacted and is NOT validated with this code.

## Finding

Every earlier lane measured where a pop-out sits and how it scrolls; none pressed **Back**. The app is a hash router and the GM
correction sheet is not a route, so with the sheet open Android Back / a Safari Back gesture / the desktop Back button navigated
`#/room/<id>/gm` -> `#/create`: the director console, the sheet and the half-typed correction reason were lost in one gesture.

Reproduced on this base three ways: headless Chrome (`probes.log`, negative controls), the new viewport probe's scenario F, and **real
Mobile Safari in the iOS Simulator** (`ios/before-negative-control-summary.log`: "the director console is still mounted" fails).

## Change (source: `apps/web/src/shared`, test, probes)

The same fix as the parallel lane `sonnet-eq` (commit `218bfea`, independently reviewed there), carried here by path
(`git checkout origin/sonnet-eq/... -- <files>`, no merge) so both branches merge cleanly: `useBackDismiss.ts` (one same-URL history
entry while a sheet is open; Back pops it and closes the sheet; Cancel/Apply/Escape release it), the one-line `SheetDialog` hook-up,
`useBackDismiss.test.tsx` (8 tests), `sheet-history-probe.mjs`, and the iOS rig's `testBackClosesOnlyTheSheet` plus its
"0 tests ran counts as pass" guard in `run.sh`. This lane's own addition is `scripts/playtest/sheet-viewport-probe.mjs` (below).

## New probe: one live sheet across viewport changes

`sheet-viewport-probe.mjs` keeps ONE sheet open with a reason typed, a Blood delta stepped and focus in the field, then resizes
390x844 -> 844x390 -> 768x1024 -> 1280x800 -> 1920x1080 -> 320x568 -> 390x844 and asserts: same sheet (typed text and Blood preview
kept), sheet inside the viewport, backdrop covers the viewport (less the page's documented ~15px stable scrollbar gutter), no horizontal
overflow, Apply/Cancel fully visible after scrolling and >=44px tall, focus still inside; then Back (F) and Escape + next Back (E).
**Result: no defect in the resize behaviour** (all six sizes pass on the pre-fix and fixed bundles; assertions tightened after review: backdrop bounded above and below, root scroll lock checked, Blood preview asserted non-empty); only F fails before the fix.

## Verification (this lane's runs; isolated ports 56xxx so peers' emulators were not touched)

| Check | Result |
| --- | --- |
| `npm run check` (`check.log`) | prettier, eslint (0 errors, the 1 pre-existing warning), typecheck, **862 passed**, 11 todo, 1 file skipped (base 854 + 8) |
| `npm run build` (`build.log`) | passed (known chunk-size warning) |
| `ui-audit.mjs` baseline, pre-fix bundle (`ui-audit-before*`) | 288 states, 3,400 controls, 0 failures |
| `ui-audit.mjs`, fixed bundle (`ui-audit-after*`) | 288 states, 3,320 controls, 0 control/overflow/contrast/hard-axe failures; 87 keyboard-focus, 363 dock-focus, 4 pinch, 8 validation, 23 sheet cases; the one known non-blocking axe best-practice note (nonexistent-room route); 5 contrast pages truncated |
| `two-device-smoke.mjs --reload` (`smoke.log`) | ALL STEPS PASSED (17), incl. no horizontal overflow at 375/768/1024/1280/1920 |
| `sheet-history-probe.mjs` / `sheet-viewport-probe.mjs` (`probes.log`) | pass on the fixed bundle; negative controls fail as intended on the pre-fix bundle |
| Real Mobile Safari, iPhone 17 Pro, iOS 26.5 Simulator (`ios/`) | `testBackClosesOnlyTheSheet`: **passes** on the fixed bundle (1 test executed), **fails** on the pre-fix bundle |
| Firebase emulator suites | **Not run**: no Functions, rules, authority or projection change; the audit, smoke and probes above ran live against remapped-port Auth/Firestore/Functions emulators. |

The two `ui-audit` runs are NOT like-for-like: controls audited 3,400 -> 3,320 and dock-focus checks 473 -> 363 between the pre-fix and fixed bundle at the same 288 states (the fixed run also used `--no-shots`, the pre-fix run did not). The hook adds no controls, so the delta is unexplained and was not investigated; both runs report zero issues, and the earlier lanes' runs (3,336 controls, 385 dock-focus) vary the same way.

## Screenshots

`shots/before` and `shots/after` (390x844 emulated phone): `after-back.jpg` is the headline pair (before: the create form, console
lost; after: the director console in place at the same scroll). `sheet-*.jpg` are the same open sheet at phone-small (320),
phone (390), phone-landscape, tablet, desktop and table (1920x1080); the sheet UI is unchanged by this lane, so before equals after.
`ios/*.png` are the real-Safari captures (sheet open, after Back, toolbar expanded).

## Known limits of the evidence

- Both Chrome probes click with `el.click()` and call `history.back()` through `Runtime.evaluate`, so no user activation exists when the history entry is pushed (Chrome's history-manipulation intervention could skip such an entry for a real Back). The only caller today is a tap on "Correct", which carries activation; the real-Safari test covers a genuine tap.
- `useBackDismiss.test.tsx`'s "leaves history alone when something else replaced the entry" passes without the hook; it guards over-release, not the bug. The other tests fail without the hook.
- A deferred `history.back()` followed by a re-open within the same tick could pop the new sheet's entry; a person cannot act that fast. The Swift test falls back to a coordinate tap if the Back control is not in the accessibility tree.

## Not covered (unchanged residuals)

Physical iOS/Android hardware, VoiceOver/TalkBack, Windows High Contrast, Firefox, the OS-owned native `<select>` popup, a real TV,
real dynamic browser-chrome collapse beyond the Simulator's Safari bars. Chrome's "history manipulation intervention" is not
exercised by the headless probe (it uses `history.back()`); the Simulator test presses Safari's real Back control.
