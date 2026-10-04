# Real Mobile Safari audit: dock released on a landscape iPhone, lane `sonnet-ed` (2026-10-04)

Base `125cbaf`. Presentation only (`apps/web/src/styles.css`, `apps/web/src/shared/ActionDock.tsx`, tests, playtest
harness, docs). No authority, authorization, projection, engine, Firebase-config, asset, secret, deploy, merge or
staging write.

## Why this lane looked somewhere new

Every earlier lane audited with headless Chrome, whose visible height in landscape is the device height (375px) and
whose browser bars never change it. `docs/evidence/ec-reskin-audit-20261004/` and the lanes before it list "iOS Safari"
as still open. This lane extended the existing real-Mobile-Safari harness (`scripts/playtest/ios-simulator/`, XCUITest
against the iOS 26.5 Simulator, iPhone 17 Pro; iOS 27.0, iPad mini) to the **signed-in** flows: it creates a room as
GM on the `127.0.0.1` origin, joins and claims a character as a player on the `localhost` origin (a separate anonymous
identity in the same Safari), then walks the Compose page, the sticky dock, a rotation, and the GM's pending card.
It is a Simulator, not a physical device.

## Defect reproduced

In landscape Safari with the tab bar and address bar showing, the visible height is **292 CSS px**. Scrolling down
collapses the bars (`innerHeight` 402) and scrolling up brings them back (292). The `@media (max-height: ...)` rule reads
the small viewport (`documentElement.clientHeight` stays 292 in both states). The dock was released into the page
flow below 320px (both the `max-height: 20rem` media query and `UNPIN_BELOW_PX = 320` in the hook), so on this device:

- with the Compose rows on screen, **"Declare action" was not on screen or tappable** (it sat at the end of a ~2,400px
  form), in both the bars-showing and bars-collapsed states;

(`innerHeight` and the visual viewport read 402 once the bars collapse, so the hook alone would have pinned it; the
media query is what released it, and it never saw the 402.)

Headless Chrome could not show this: its 812x375 landscape viewport is above the line. Measured with the throwaway
overlay described below, after the fix the same device reports `iH=292 ... dock.top=205.6 bot=292 unp=false pos=sticky`
(bars showing) and `iH=402 ... dock.top=315.6 bot=402 unp=false pos=sticky` (bars collapsed).

## Change

`UNPIN_BELOW_PX` 320 -> 240 and `@media (max-height: 20rem)` -> `15rem`: the dock now releases at or under 15rem
(240px, inclusive in both the media query and the hook, which previously disagreed by one px) of visible height. That
is the line `useVisualViewportBox` uses for the correction sheet's compact mode at the default 16px root (the sheet's scales
with text size; this one does not). A compact dock is about 66-87px, within the existing 45% cap (131px at 292px).
Landscape with an on-screen keyboard (`scripts/playtest/ios-simulator/README.md` measured roughly 70-140px visible) and
pinch-zoom (> 1.05x) still release it. Phone portrait, tablet, desktop and table CSS is unchanged.

**Known limit (independent review finding 1):** at 200% text in these short landscape viewports the capped dock
(131px at 292, 113px at 250) scrolls inside itself and the primary button is only partly inside it (about 67px and 48px
visible, still tappable and pinned). Before this change the dock was static there. It is covered by a loosened
`ui-audit-selftest.mjs` case (>= 44px of the button visible), not claimed as fully fitting.

## Before / after (same probe, `testSignedInDockInRealSafari`, iPhone 17 Pro, iOS 26.5)

| State | before (`125cbaf`) | after |
| --- | --- | --- |
| landscape, bars collapsed, Compose rows on screen: `Declare action` hittable | **false** (XCTAssert failed) | true |
| landscape, bars showing (292px), Compose rows on screen: `Declare action` hittable | **false** (XCTAssert failed) | true |
| portrait: dock pinned above the bottom toolbar after scroll 1-3, at page bottom, after rotating back | true | true |
| iPad mini (iOS 27.0) portrait/landscape dock | true (earlier run on the base build) | true |

Logs: `ios-before/iphone-17-pro-signed-in.log`, `ios-after/iphone-17-pro-signed-in.log`. The "after" log carries the
overlay line (`iH`, `cH`, `vv.h`, `sY`, `dock.top/bot`, `unp`, `pos`); the "before" run used a bundle without it. Screenshots
(`ios-before/`, `ios-after/`, device-native frames, landscape): `landscape-scrolled` (bars collapsed) and
`landscape-bars-back` (bars showing). Before: no dock, only stat rows. After: dock pinned with pool total and
Declare action. The overlay is a throwaway `<script>` appended to the built `dist-ed/index.html` only (never in source).

One probe correction is recorded honestly: the first probe asserted the dock at the top of the page, where the panel is
still below the fold and the dock correctly is not on screen; that assertion was wrong, not the app, and was replaced.

## Regression coverage added

- `apps/web/test/shared/ActionDock.test.tsx`: the 240px line, and 292/250px stay pinned (iOS landscape).
- `apps/web/test/styles/reskinContract.test.ts`: the `15rem` fallback exists and no `20rem` one does.
- `scripts/playtest/ui-audit-selftest.mjs`: real-stylesheet dock at 874x292 and 667x250 (plain and GM card), asserting
  `position: sticky`. **Verified to fail on the old CSS** (4 FAIL with `position: static`), pass on the new.
- `scripts/playtest/ui-audit.mjs`: dock audit viewports `phone-landscape-bars` (874x292) and `phone-se-landscape-bars`
  (667x250): 8 dock results, all sticky, 0 problems, with focus-not-obscured checks (dock focus checks 405 -> 451).
- `scripts/playtest/ios-simulator/UITests/SafariFlowUITests.swift`: `testSignedInDockInRealSafari` (new), run.sh `--only`.

## Gates (this commit's source)

| Gate | Result |
| --- | --- |
| `npm run check` | exit 0 on the final source: 806 passed, 11 todo (805 baseline + 1) |
| `npm run build` | passed on the final source (existing chunk-size warning) |
| `ui-audit.mjs` before (base code) | 288 states, 3,416 controls, 0 failures (`ui-audit-before.log`) |
| `ui-audit.mjs` after (final source, rebuilt bundle) | 288 states, 3,320 controls, 0 control issues, 0 overflow, 0 hard axe violations, 87 keyboard-focus + 363 dock-focus checks, 4 pinch, 8 validation, 23 sheet cases, 0 failures; one best-practice note (`page-has-heading-one`, intentional no-such-room route). The 8 dock results at 874x292 / 667x250 are all sticky with 0 problems. Control and dock-focus counts vary with the random roll and which states are reached (base 3,416 / 405; an earlier pre-review run of this change 3,384 / 451) |
| `ui-audit-selftest.mjs` | passed (`selftest-after.log`) |
| `two-device-smoke.mjs --reload` | ALL STEPS PASSED (17/17), no overflow at 375/768/1024/1280/1920 (`smoke.log`) |
| `npm run test:emulator` (APFS clone, every port remapped to 47xxx) | 18 rules + 86 Functions + 4 web passed (`emulator-suite.log`, repeated callable-verification debug lines removed). Run on the source as of the first implementation, before the review-driven edits (inclusive threshold, comments, tests, audit scripts); those touch no Functions, rules or session code, so this is stated as a run on the earlier source, not re-run |
| iOS Simulator suites (final probe, final source) | iPhone 17 Pro (iOS 26.5) and iPad mini (iOS 27.0): `testJoinFormValidationWithKeyboard`, `testCorrectionSheetWithKeyboardAndPicker`, `testSignedInDockInRealSafari` all passed (`ios-final/`). The same final probe **fails on the base build** (iPhone: dock outside the visible web area and not hittable in both bar states; `ios-before/iphone-17-pro-final-probe-failures.txt`) |

Stack: the app, Auth/Firestore/RTDB/Functions on remapped ports (37xxx for the live stack, 47xxx for the clone, Chrome 37350/37333). Peer lanes' 8080/9099/9000/5001 emulators were not used, killed or written to (the testing
package's hard-coded ports were remapped in the clone only). Nothing was deployed or written to staging.

## Observations that are not defects (checked, left alone)

- At page top the dock is correctly off screen: it pins only while its own panel is on screen.
- iOS 26 Safari draws page content under the translucent status bar; the "CONNECTED" strip sits just below the clock.
- iPad Safari reports `documentElement.clientHeight` 75px below `innerHeight`; the dock still pins to the visible bottom.

## Not covered (carried)

Physical iOS/Android hardware, VoiceOver/TalkBack, Safari with the compact tab-bar setting or a different text size,
a real TV at viewing distance, Android Chrome's dynamic toolbar, and the on-screen keyboard over the (text-free) dock
panels. Staging was not re-run; the deployed baseline (`dt-staging-playthrough-20261004`, 17/17) predates all
dock work.
