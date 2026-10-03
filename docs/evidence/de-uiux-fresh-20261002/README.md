# Fresh UI/UX audit of PR #41 candidate `d0fe5b4` — evidence (2026-10-02)

Branch `sonnet-de/reskin-uiux-20261002`. Record and verdict: [`docs/reviews/2026-10-02-de-reskin-uiux-fresh-audit-review.md`](../../reviews/2026-10-02-de-reskin-uiux-fresh-audit-review.md).
Everything here was produced against **local** builds on loopback with the Firebase emulators (fake `demo-`
project); nothing was deployed. The one network run is the staging smoke, which exercises the **deployed,
pre-candidate** build and is baseline context only.

**What the pack does and does not contain.** The two smoke reports used to carry a working room code (one from a
room created on the deployed staging site, one from an emulator room), which an independent review caught;
`two-device-smoke.mjs` now records only the code's _shape_ (`XXXXX-XXXXX`) and both reports were redacted. No other
report, log or screenshot contains a room, table or recovery code, checked by scanning every committed text file for
the key names and for letter/digit/hyphen code shapes. The iOS secret-entry log and screenshots do contain the
throwaway strings that test types into the form (`ab12cd`, a made-up passphrase, `abcd2345efgh`); they match no room
or seat. The page logger records geometry, focus targets and typed-value _lengths_ only (not values, not the URL).
Screenshots that showed a throwaway local room code were cropped to the alert strip.

## Files

| Path                                                                                    | What it is                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `staging/two-device-smoke-report.deployed-pre-candidate.json`                           | `two-device-smoke.mjs --reload` against `https://powerglove-1cd23.web.app`: 17/17, no console/request errors. The deployed bundle lacks this candidate's CSS (no `(height<=28rem)` query, no `.gear-item`, no capped gutters).      |
| `before/ui-audit-report.candidate-d0fe5b4-unmodified-harness.json`                      | The unmodified harness on the unmodified candidate: 174 states, 116 large-text sweeps, 1,686 controls, 15 modal records, 0 findings. The harness passes; the defects below are outside what it measured.                           |
| `before/fresh-probes-run1.json`, `before/fresh-probes-run2.json`                        | `scripts/playtest/fresh-probes.mjs` on the unmodified candidate: dense sheet-height sweep, rotation, select truncation, rejected-command visibility (5 widths), focus order, clipped content, forced colors, allocation state.     |
| `after/ui-audit-report.final.json` | The final harness on the final build (after the independent review's changes): 174 states, 116 large-text sweeps, 1,614 controls, 22 modal records, 5 feedback records, 0 findings. |
| `after/two-device-smoke-report.final.json`                                              | `two-device-smoke.mjs --reload` on the final build: 17/17.                                                                                                                                                                         |
| `after/fresh-probes-sheet-sweep-and-rotation.after.json` | The dense sheet-height sweep, the zoom-equivalent and the rotation-with-the-sheet-open probes on the final build. |
| `mutation/ui-audit-report.base-build-final-harness.json`                                | The **final** harness against the **unmodified** candidate (`--modal-only`): 18 findings (5 command-feedback, 13 tight-keyboard), with the two "must stay pinned" controls passing. Proves the new gates bite.                      |
| `real-200pct-text/ui-audit-report.final-build.json`, `…base-build.modal-only.json` | The audit under a **real** 200% browser text size (Chrome default font 32px, so rem media queries move too). Final build: state sweeps clean, 11 modal findings (3 default-text assumptions, 6 tight-keyboard heights set at 100% text, 2 pinned-control layout expectations; classified in the review). Base build: 35 failures. |
| `comparison/feedback-scroll-into-view.json`, `comparison/feedback-sticky-banner-d5d30b3.json` | The rejected-command probes against this branch (final build) and against the sibling lane's sticky banner (`d5d30b3`): whether the message is on screen, **where the pressed control ends up** (`pressedControlAfter`, measured after the tap), the banner's footprint, and keyboard-focus obstruction (`stopsOverlappingTheMessage`, `stopsEntirelyUnderTheMessage`). |
| `ios-simulator-logs/*.log`, `page-log.*.jsonl` | Per-test logs from the iOS Simulator runs of the documented `run.sh` (`FRAME`/`VALUE`/`TOUCH` lines with millisecond timestamps), and the page's own `visualViewport` / correction-sheet geometry (`page-log.before-fix.jsonl`, `page-log.after-fix.jsonl`: one JSON object per event or tick; correlate with the test log by timestamp and `MARK` lines). Before = the unmodified `d0fe5b4` bundle, after = the final bundle. |
| `screenshots/ios/` | Real Mobile Safari (iOS 26.5, iPhone 17 Pro): sheet before/after (including the 98px and 126px states after one touch scroll), native validation bubble, native option list, soft-keyboard secret entry. Landscape shots are stored upright: the Simulator writes them in portrait, so the files were rotated and carry no EXIF orientation tag. |
| `screenshots/chrome/`                                                                   | The rejected-command alert before/after (the "after" crops show only the alert strip), and the sheet at the iOS-measured heights.                                                                                                  |

## How the numbers were produced

- **Isolated stack.** A sibling session already held the default emulator ports (8080/9099/5001), and `firebase-tools`
  on macOS refuses any port a process listens on, whatever the address family. This run therefore used remapped ports
  (auth 19099, Firestore 18080, database 19000, functions 15001), project id `demo-digitable-de`, and a bundle built by a
  throwaway Vite plugin that swaps only the three port numbers in `apps/web/src/session/emulatorConfig.ts`; no repository
  file was changed to do this. The sibling's stack was never touched. (The stack was later killed from outside once —
  both stacks' Java processes exited with code 143 — and restarted; no result spans that.)
- **Base build.** `git archive d0fe5b4 apps/web` built the same way, so "before" and "mutation" are the exact unmodified source.
- **Real text size.** `CHROME_PATH` pointed at a wrapper that runs Chrome with `--blink-settings=defaultFontSize=32`
  (the harness's own 200% sweeps only set an inline root font size, which rem-based media queries ignore).
- **iOS.** `scripts/playtest/ios-keyboard/run.sh` (README there). The runs were iOS 26.5 on an iPhone 17 Pro Simulator.
- **Probes.** `node scripts/playtest/fresh-probes.mjs --base <url> --out <dir> --port <n> [--only A,B]`.

## Caveats

- A Simulator is real iOS WebKit with the real soft keyboard, not a physical device: touch feel, hardware keyboard
  heights on other models, and Safari toolbar states are not covered.
- The 98px / 126px visual-viewport heights are for one device and one OS; other models differ, which is why the fix
  is a threshold with a measured justification rather than a constant tuned to them.
- Probe numbers (`fresh-probes-*.json`, `comparison/*.json`) come from `fresh-probes.mjs`; the durable checks are the
  ones now in `scripts/playtest/ui-audit.mjs` and the unit/contract tests.
- **Control counts differ between runs without any coverage change.** The baseline audit counted 1,686 controls and the
  final-harness runs 1,614 (1,578 on one earlier run; 1,518 at a real 200% text size). The whole difference is the 12
  allocation states (6 viewports × assigned and unassigned), which showed 20 controls at baseline, 14 (or 11) on the
  final runs and 6 at 200% text, because the server seeds dice with `randomBytes(32)` and each run draws a different
  pool. State and large-text-sweep counts are identical (174 / 116); the modal-record count differs only because the
  final harness added seven tight-keyboard scenarios (15 → 22).
- **Two of the iOS tests record rather than assert.** The native-validation test logs "BUBBLE in accessibility tree:
  false" because iOS draws that bubble outside the web view, and the option-list test logs `wheels=0` because iOS 26 shows
  a popover list, not a wheel. In both the screenshot is the evidence. Likewise XCUITest frames and `hittable` do not know
  the sheet's clip (an action below the 98px edge still reports `hittable=true`), so the sheet claims rest on the page's own
  geometry in `page-log.*.jsonl`.
- **Chrome's portrait "tight keyboard" cases (320×220, 320×280, 375×447) share the layout the stylesheet _chooses_ with
  iOS, not its pixels:** iOS keeps the layout viewport tall (full-size chrome, the 1.5rem backdrop gap, `--vv-*` sizing)
  while Chrome shrinks the layout viewport. The landscape cases do reproduce the iOS pixels. Only 98px and 126px were
  measured on a device; the other heights are derived.
- D1 (the rejected-command alert) was exercised in real Chrome and by the GM-flow test; the claim list and player
  dashboard use the same component and are pinned by a source test. It was not exercised on iOS WebKit.
