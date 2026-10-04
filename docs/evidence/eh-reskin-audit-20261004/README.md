# Reskin / pop-out audit, lane `sonnet-eh` (2026-10-04): real Safari shows emulator realtime 30 s late; the "iPhone SE typing failure" was the rig

Base: reviewed candidate `a0e8f36` (the `sonnet-eg` chain). **Product change: one small, emulator-only transport setting** in
`apps/web/src/firebase/firestore.ts`. **No CSS, component, authority, authorization, projection, engine, rules, asset or secret change.**
Everything else is the iOS Simulator rig, its tests, and docs. Not merged, not deployed. The only writes to a deployed project are the
test rooms the staging runs below create (see "Staging").

## What this lane did

Took the one lead nobody had settled: the `sonnet-eg` handoff recorded that on an iPhone SE (3rd generation) Simulator "the two
session-creating tests fail typing into the third create-form field ... rig vs page undetermined". The smallest supported phone had therefore
never had a real-Safari pass of the signed-in dock or the correction sheet. Everything below ran against the unmodified base first.

## Finding 1: the typing failure is a rig defect, not a page defect

Reproduced exactly (`ios/typing-diagnosis/`): SE 3 (375x667, iOS 26.5), the keyboard is up after typing the second field, `tap()` on
"Your display name" (frame y 292-341, centre 316.5) leaves the keyboard dismissed and no element focused. The accessibility tree with the
keyboard up (`accessibility-tree-keyboard-up.txt`) shows Safari's own UI drawn just below that field: the address capsule
(`CapsuleNavigationBar`, "Address" 127.0.0.1) at {145, 334, 85x32} and the form-assist toolbar at y 376-424, so the field's lower edge is next to it.
Tap results on that field, same flow, fresh page each time: at 10%, 30% and 50% of its height (horizontal position 55%, `dbg4-vertical-offsets.log`) and at
20% horizontally, 50% height (`dbg3-variants.log`, V2) it focuses; at 90% height it does not (keyboard gone); a plain centre `tap()` failed in every run
(five: `dbg2-center-tap.log`, `dbg3-variants.log` V1, V4, V6 and the full-suite runs); a double tap works (the first dismisses the keyboard, the second focuses).
**The exact mechanism is not established**: the capsule's frame does not contain the centre point, so its touch area may be larger than its accessibility
frame, or the tap lands somewhere else; the logs cannot separate horizontal from vertical position beyond the cases listed. The conclusion that holds
is narrower and enough: taps in the upper part of a field focus it reliably, the failure is in the Simulator's tap on Safari's UI region and not in anything the
page does. No page JavaScript touches focus here (`grep` of `.blur(`, `.focus(`, `scrollIntoView` in `apps/web/src` finds only the sheet, the dock and the
inline-validation first-invalid focus, none run on a blur or tap), and inline validation only renders after a failed submit, so nothing shifts under the finger. A
person has the form-assist **Next** button. Fix is in the rig: `tapField` taps the upper-left part of the field (and scrolls the field into view first).

## Finding 2 (real): against the emulators, Mobile Safari received Firestore updates only through the 30 s fallback poll

While timing the rig I logged how long the GM's own **Load scene** takes to appear (`createSessionAndOpenConsole`). With the default transport:
**30.1 s on every run, iPhone SE 3 and iPhone 17 Pro** (`ios/base-default-transport/`; three runs). With
`experimentalForceLongPolling` it is **1.1 s** (`ios/probe-forced-long-polling/`), and the callable itself takes about 40 ms (emulator log).
30.1 s is the `useRoomProjection` fallback poll (30,000 ms + jitter), so the live `onSnapshot` listener delivered nothing to Safari. The SDK
(12.19) already auto-detects long polling by default, so the cause is not established (a stream that connects but does not deliver, which
auto-detect does not catch, is a hypothesis; the headless-Chrome audits are unaffected).

**Not claimed:** physical iPhones, a LAN host (`lan-up.sh`), Android, Safari on macOS, or any other action than Load scene were not measured.
The deployed site was measured once: the same flow in the same Simulator Safari against <https://digitable.signal-bleed.com> took **4.1 s**
(`ios/staging/`), so nothing says production is affected and its transport is left at the SDK default.

Fix (`apps/web/src/firebase/firestore.ts`): when an emulator host is given (only a `VITE_FIREBASE_USE_EMULATOR=true` build passes one) the
instance is created with `initializeFirestore(app, { experimentalForceLongPolling: true })`, once per app, otherwise `getFirestore(app)` as
before. Why it matters now: the open release item is a physical two-device rehearsal against LAN emulators (`docs/PLAYTEST_TWO_DEVICE.md`);
if a phone behaves like the Simulator, every cross-device update would arrive up to 30 s late and look like a defect in the app.
It changes no rules, authorization, projection or document path (the transport only).

| Real Mobile Safari, `createSessionAndOpenConsole` "scene appeared ... s after tapping Load scene" | base (default transport) | candidate (long polling) |
| --- | --- | --- |
| iPhone SE (3rd generation), iOS 26.5 | 30.1 s (2 runs) | 1.1 s (2 runs, final rig) |
| iPhone 17 Pro, iOS 26.5 | 30.1 s (1 run) | 1.1 s (2 runs, final rig) |
| iPad mini (A17 Pro), iOS 27.0 | not run on base | 1.1 s |
| iPhone 17e, iOS 27.0 | not run on base | 1.1-1.3 s |
| staging site (deployed, default transport), iPhone 17 Pro | n/a | 4.1 s (the deployed build, `5e8907b`) |

## Real-Safari results on the candidate (all three XCUITests per device)

`testJoinFormValidationWithKeyboard`, `testCorrectionSheetWithKeyboardAndPicker`, `testSignedInDockInRealSafari` (`ios/candidate/*.log`, pass/fail summaries in `ios/candidate/RESULTS.txt`):
**iPhone SE 3, iPhone 17 Pro, iPad mini, iPhone 17e: 3 of 3 passed, 0 failures.** SE 3 and iPhone 17 Pro were rerun on the final rig after the
independent review; iPad mini and iPhone 17e ran on the rig before that review's robustness edits (tap-into-view guard, drag settle, budget variable).
On the **iPhone SE** the first real-Safari numbers for the smallest phone: portrait with the keyboard up the correction sheet's title (y 69),
reason field (150-199), Apply/Cancel (228-296) all sit above the keyboard top (451); landscape with the keyboard (213) the field and both buttons are
reachable (compact mode); the Declare dock is pinned and hittable at the top of the form, mid-page, at the bottom, in landscape with the bars
collapsed and showing, and after rotating back; the GM pending dock is pinned. Two rig robustness fixes were needed on the SE and are in the diff:
the tap offset above, and `bringIntoView` (a slow swipe's momentum carried the Compose rows past the screen in landscape after they were first
seen). iOS 27 base behaviour was not measured (the 17e run took 2,319 s to boot and run on a loaded machine).

## Chrome audit, before and after (headless Chrome against the isolated emulator stack)

Same bundle but for the transport setting (the product CSS is identical, so the screenshots match by construction; they are kept as the
before/after record at phone 375, tablet, desktop and the 1920x1080 table display). Both served from `vite preview`; Chrome ports 43350/43351.

| `ui-audit.mjs` (288 states, phone 320/375/390/412, landscape, tablet, desktop, table; 150%/200% text; dock, pinch, validation, sheet cases) | base (`ui-audit-before.log`) | candidate (`ui-audit-after.log`) |
| --- | --- | --- |
| controls audited (>= 44px targets, inside the viewport, >= 16px text-entry type) | 3,320 | 3,336 |
| control issues / overflow states / **hard axe violations** | 0 / 0 / 0 | 0 / 0 / 0 |
| text boxes whose contrast was measured from rendered pixels / failures | 8,462 / 0 | 8,440 / 0 (319 boxes had too few glyph pixels to score; counted, not passed) |
| keyboard-focus checks / dock focus checks / pinch / validation / sheet cases | see logs | 87 / 385 / 4 / 8 / 23 |
| findings | 6 | 6 |

The 6 findings are the **known, documented limit** the previous lane recorded (`eg` evidence): single 10-14 letter ability/item names in a
checkbox row ("Phantasmagoria", "Fragmentation", "submachine", "Panzerfaust") that break across lines at **150-200% text on 320-375 px
phones**. They are identical on base and candidate, because this change touches no CSS. They make `ui-audit.mjs` exit 1 (`exit 1` in both logs);
**the candidate's audit is not a clean pass and is not described as one.** The `page-has-heading-one` best-practice note on the intentional
missing-room route remains. `report.json` is kept for both runs; the 700 full-page screenshots per run are not committed (200 MB), only a
representative set (landing, GM console with the scene loaded, player compose, player allocation, table after a roll, at phone/tablet/desktop/table).

## Gates

| Gate | Result |
| --- | --- |
| `npm run check` (`check-final.log`) | exit 0: format, lint, typecheck, **837 passed**, 11 todo (81 files passed, 1 skipped). The base is 829 (`sonnet-eg`); the 8 new tests: 4 in `apps/web/test/firebase/firestore.test.ts` (3 fail on the old `firestore.ts`), 4 contract tests (all fail on the old rig and old `firestore.ts`) |
| `npm run build` (`build.log`) | exit 0 (existing chunk-size warning) |
| `ui-audit-selftest.mjs` (`selftest.log`) | SELF-TEST PASSED |
| emulator suites, APFS clone with every port remapped to 44xxx (`emulator-suite.log`, repeated callable-verification debug lines removed) | **18 rules + 86 Functions + 4 web passed**, exit 0; the web suite passes with the new initialisation (Node uses gRPC, so long polling itself is not exercised there) |
| `two-device-smoke.mjs --reload` against the **deployed staging site** (`staging-smoke.log`) | ALL STEPS PASSED, 17 PASS (see below) |

## Staging playthrough (evidence only, not a deploy)

- URL: <https://digitable.signal-bleed.com>, serving bundle `index-D8nuHDtl.js`, which `docs/RUNBOOK.md` records as built from reviewed commit
  **`5e8907b`** (2026-09-19, sourcebook roster).
- **Commit relationship:** `5e8907b` is an ancestor of this branch (31 commits behind `a0e8f36`, and `a0e8f36` is this lane's base). Staging therefore does
  **not** contain the dock, the zine reskin, the large-text fix, the landscape-dock fix or this lane's transport setting, so it cannot validate any of them;
  it confirms the deployed baseline still passes the GM/player/table loop, and gave the 4.1 s Safari reading above. The iOS probe against staging also
  fails the landscape-keyboard sheet assertion (`ios/staging/xctest-failures.txt`: 61.0 > 44.5), the pre-fix defect fixed in the (undeployed) compact sheet;
  that is expected on that build and is not a regression.
- Test rooms created on the staging project by these two runs: one by `two-device-smoke.mjs` and one by the iOS probe ; nothing was deleted or modified, and no deploy, rules or Functions change was made.

## Not covered (still open)

Physical iOS/Android hardware (the 30 s symptom in particular has not been looked for on a phone), VoiceOver/TalkBack/NVDA, real browser-chrome collapse on
Android, a real TV, the iOS 27 base transport behaviour, why auto-detect did not engage, iPad on the base build. Staging has no build containing any of the
reskin work, so the reskin release is not complete until John deploys one and the physical pass is done.

## Isolation

Peers held default ports and many others (27xxx, 34xxx-39xxx, 54xxx-59xxx, 63xxx, plus 46xxx from the second session that shared this worktree). This lane
used 43xxx only for the live stack (auth 43099, Firestore 43080/43081, Functions 43001, hub 43400; previews 43174-43176; Chrome 43350-43360) and 44xxx for the
emulator-suite clone. Bundles were built with a throwaway Vite config under `node_modules/.eh/` (not in git) that rewrites only the three client port numbers.
Dedicated Simulator device `eh-iPhoneSE3` (created by this lane); the other devices are the stock ones, shut down by the script. No peer process was touched; two of
this lane's own hung `xcodebuild` processes after failing runs were killed by command line match on this lane's device id.
