# Reskin / pop-out audit, lane `sonnet-ef` (2026-10-04) — evidence only, no source change

Base: reviewed candidate `125cbaf` (`sonnet-ec` chain). **No source file changed**, so "before" and "after" are the same
code; the captures are a single current-state record, not a before/after pair. Not merged, not deployed; no staging write
and no staging request was made by this lane (the pre-reskin deployed baseline remains `9ee8aa5`'s 17/17).

## Audit result

Own inventory of every pop-out/option pattern: native `<select>` (SceneDirector x2, GmToolsPanel x4; each paired with the
in-page "Selected" echo), the Compose "Why?" `<details>`, the single modal `SheetDialog` (portal, inert background,
visual-viewport sizing via `useVisualViewportBox`, safe-area, internal scroll, compact mode), the sticky `ActionDock`
(visual-viewport unpinning, 45dvh cap), and the inline allocation/target radio lists. No anchored popover, menu, listbox or
datalist exists, so nothing can clip off-screen; the native select popup is OS-owned. Text-entry controls are 16px
(no iOS focus zoom), the viewport meta has no `maximum-scale`/`user-scalable` (pinch stays available), and
`interactive-widget=resizes-content` is set. **No defect found; no source fix is justified by evidence**, so no
regression test was added (nothing changed to cover).

New in this lane versus the previous audits' headless-Chrome-only keyboard emulation: the audit was also run in **real Mobile
Safari (WebKit) in the iOS Simulator** (iPhone 17e, iOS 27.0) via `scripts/playtest/ios-simulator/run.sh`, which can
shrink only the visual viewport with the software keyboard. Result: both XCUITests passed. In `ios/sheet-keyboard-typed.png`
the correction sheet sits wholly above the keyboard with title, focused field, and both actions visible;
`ios/sheet-landscape-keyboard-up.png` covers landscape; `ios/scene-select-picker.png` shows the native picker (OS-owned,
inside the screen) with the page's "Selected" echo still visible beneath. Simulator, not a physical device.

## Gates (all on this commit's source, which equals `125cbaf`)

| Gate | Result |
| --- | --- |
| `npm run check` (format, lint, typecheck, test; `check.log`) | exit 0: 805 passed, 11 todo (80 files passed, 1 skipped) |
| `npm run build` (`build.log`) | exit 0 (existing chunk-size warning) |
| `ui-audit-selftest.mjs` | passed (`selftest.log`) |
| `ui-audit.mjs` (real Chrome, live emulator flows) | 288 states, 3,384 controls, 0 control issues, 0 overflow states, 0 hard axe violations, 87 keyboard-focus + 369 dock-focus checks, 4 pinch scenarios, 8 validation scenarios, 23 sheet cases, 0 failures; one best-practice note (`page-has-heading-one` on the intentional no-such-room route). `after/report.json`; 13 representative captures kept in `after/` (phone, landscape, 320px 200% text, tablet, desktop, table 1920, six-member party) |
| `two-device-smoke.mjs --reload` (GM + player + table) | ALL STEPS PASSED incl. no overflow at 375/768/1024/1280/1920 (`smoke.log`) |
| iOS Simulator Mobile Safari | 2/2 tests passed (`ios-run.log`, `ios/*.log`) |
| Emulator suites (`npm run test:emulator`, APFS clone, ports remapped) | 18 rules + 86 Functions + 4 web passed (`emulator-suite.log`) |

## Isolation

Peers held default ports and 27xxx/37xxx/47xxx/54xxx-59xxx. This lane used 61xxx only: live stack auth 61099, Firestore
61080/61081, RTDB 61000, Functions 61001, hub 61400, preview 61274, Chrome 61350/61351, demo project `demo-digitable`.
The bundle was built with a throwaway Vite config kept outside the repo that rewrites only the three client port numbers.
The emulator suite ran in a clone whose `firebase.json` and `packages/testing/src/emulator.ts` ports were remapped to
611xx (the hard-coded 9000/8080/9099 are the known follow-up). Before and after, only this lane's own processes were stopped; no peer
process was touched, and no write reached a peer's emulator. The iOS Simulator used a dedicated "iPhone 17e" device; the
already-booted "iPhone 17 Pro" was left alone.

## Not covered (still open)

Physical iOS/Android hardware, VoiceOver/TalkBack/NVDA, Windows High Contrast, real browser-chrome collapse on a
phone, a real TV at viewing distance, real hardware pinch. Staging was not re-run: the reskin has no new deployed build, so
the full release is not complete until one is deployed (John's decision) and the physical/AT pass is done.

## Reviewer notes carried

Non-text divider colour `--rule` (#4a4a56) is about 2.3:1 on the page black: decorative separators only; form-control borders use `--mute` (about 6:1). Not a control-boundary failure, not changed.
