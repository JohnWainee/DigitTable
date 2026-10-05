# Reskin / pop-out re-audit of `8839c75`, lane `sonnet-ew` (2026-10-04)

Evidence-only. **No `apps/`, `packages/`, `templates/`, rules, Functions, asset or secret change**; nothing merged or deployed; staging is still `5e8907b`
and is NOT validated by this run. Isolated ports 63xxx (peers hold the defaults); temporary port patches and the throwaway `firebase.ew.json` were reverted/removed.

| Check | Result |
| --- | --- |
| `npm run check` | passed: 862 tests, 11 todo (83 files passed, 1 skipped) |
| `npm run build` | passed (known chunk-size warning) |
| Emulator suites (`emulator.log`) | 18 + 86 + 4 passed |
| `two-device-smoke.mjs --reload` (local candidate build) | ALL 17 STEPS PASSED incl. no overflow 375/768/1024/1280/1920 |
| `ui-audit.mjs` default | 288 states, 3,320 controls, 0 control/overflow/contrast/hard-axe failures, 23 sheet cases; only the known `page-has-heading-one` note on the nonexistent-room route |
| `ui-audit.mjs --font-fallback sans` | 288 states, 3,400 controls, 473 dock-focus checks, 0 failures |
| `ui-audit.mjs --font-fallback wide` (Verdana-class) | 39 findings, all word-break at phone-small + 150/200% text; identical count to the documented known limit; 0 control, overflow, contrast or axe failures |
| Real Mobile Safari, iPhone 17 Pro, iOS 26.5 | 4 tests, 0 failures (incl. Back closes only the sheet) |
| Real Mobile Safari, iPhone 17e, iOS 27.0 | passed (new runtime and device vs. earlier lanes) |
| Real Mobile Safari, iPad mini (A17 Pro), iOS 27.0 | 3 of 4 passed; `testBackClosesOnlyTheSheet` failed (see below) |

## Resolved note from `eu`
The lower control count (3,320 vs 3,400) and dock-focus count (363 vs 473) are explained: they are the count with no font fallback; the `sans` run gives
3,400 / 473 exactly as earlier lanes. `fontFallback` now ran, closing that gap.

## iPad `testBackClosesOnlyTheSheet` failure: rig limitation, not an app defect
The test taps Safari's Back by iPhone bottom-toolbar coordinates when the control is not in the accessibility tree. iPad Safari has no bottom toolbar, so no Back was
pressed: `ios/ipad-mini-a17-pro-back-sheet-open.png` and the after-state are identical (sheet still open), and the "console mounted" assertion fails only because the
console is inert behind the open sheet. This is NOT evidence the sheet fails to dismiss on Back on iPad; it is untested there. Open item: teach the rig iPad Safari's
top-toolbar Back (or `XCUIDevice` navigation), then rerun on iPad.

## Not covered
Physical iPhone/Android, VoiceOver/TalkBack, Windows High Contrast, Firefox, OS-owned native `<select>` popup, a real TV, the keyboard-up footer safe-area padding on
real hardware (`env(safe-area-inset-bottom)` likely still reserves ~34px with the keyboard up: cosmetic, unconfirmed). Full 650-image run not committed; `shots/` has GM-console captures at phone, landscape, tablet, desktop and table; `ios/` has Safari captures.
