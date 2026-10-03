# Real Mobile Safari in the iOS Simulator (keyboard, rotation, native pickers)

`scripts/playtest/ui-audit.mjs` drives headless **Chrome**. Chrome cannot shrink only the _visual_ viewport the
way iOS does for the software keyboard (it shrinks the layout viewport, which is what Chrome Android does), so
the iOS keyboard behaviour was reasoned about and covered only in jsdom until this tool. It drives the **real
Mobile Safari in the iOS Simulator** with the real software keyboard, rotation and native `<select>` list, while
`page-logger-server.mjs` records what the **page itself** sees (`visualViewport`, the correction sheet's rectangles).

It is **not a physical device**. Real hardware, Android, other browsers, VoiceOver/TalkBack and Windows High
Contrast remain open (see `CLAUDE_HANDOFF.md`).

## Run

1. Start the Firebase emulators on their default ports (`firebase emulators:start --only auth,firestore,database,functions --project demo-digitable`, with the JDK on `PATH`).
2. Build the web app in emulator mode to a scratch directory outside the repository (never over `apps/web/dist`):

   ```sh
   IOS_DIST="${TMPDIR:-/tmp}/digitable-ios-dist"
   (
     cd apps/web
     VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_AUTH_DOMAIN=demo-digitable.firebaseapp.com \
     VITE_FIREBASE_PROJECT_ID=demo-digitable VITE_FIREBASE_APP_ID=1:000000000000:web:demo \
     VITE_FIREBASE_USE_EMULATOR=true npx vite build --outDir "$IOS_DIST" --emptyOutDir
   )
   ```

3. From the repository root: `scripts/playtest/ios-keyboard/run.sh --dist "$IOS_DIST" --out "${TMPDIR:-/tmp}/ios-keyboard" [--runtime iOS-26-5] [--test <name>]...`

The simulator reaches the Mac's loopback at the same address, so nothing is exposed to the network. `run.sh`
creates a **dedicated** Simulator device and deletes it afterwards, so a device another session is using is never
touched. The Xcode project here is a minimal host app plus a UI-test bundle (`IosPlaytestUITests`); nothing is
installed on a device and no signing identity, credential or Firebase project is involved.

## What it checks

| Test                                       | Measures                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `testCorrectionSheetWithRealKeyboard`      | The GM correction sheet with the keyboard up in portrait, **rotated while open**, raised in landscape, and landscape-first: `visualViewport.height`, whether the label + field are inside the visible sheet, whether Apply/Cancel are reachable, and a real touch scroll + tap of Cancel with the keyboard up. |
| `testSecretEntryOnRealIOSSoftKeyboard`     | Taps the **on-screen keys** into the join form and the recovery form and reads the values back: a default-traits field is the positive control; the room code and recovery code must come out upper-case, the passphrase exactly as typed.                                                                 |
| `testNativeValidationOnEmptySubmit`        | What iOS shows when a signed-out form is submitted empty with the keyboard up (screenshot).                                                                                                                                                                                                                |
| `testNativeSelectPicker`                   | The OS-drawn option list for a native `<select>` (screenshot, value before/after).                                                                                                                                                                                                                         |

Outputs in `--out`: screenshots (`ios-*.png`; a rotated device's screenshot is written in portrait orientation,
rotate it with `sips -r 270 file.png`), one `*.log` per test (`FRAME`/`VALUE`/`TOUCH` lines with timestamps),
`page-log.jsonl` (the page's own geometry, one JSON object per event/tick; correlate with the test log by
timestamp and the `MARK` lines) and `xcodebuild.log`.

## Pitfalls that each produced a wrong measurement once

- **First-run noise.** A fresh Simulator shows Safari feature tips and, the first time a keyboard appears, a
  "slide to type" **intro panel in place of the keyboard that is much taller than the real one**. A
  `visualViewport` number taken while it is up is not a keyboard measurement. The tests dismiss both, and the
  screenshots are worth looking at: that is how this was caught.
- **`typeText` is not the keyboard.** XCUITest `typeText` injects key events that bypass iOS's auto-shift and
  autocorrect, so it cannot observe `autocapitalize`/`autocorrect` at all (its positive control comes out
  unchanged). Use `softType()`, which taps the on-screen keys.
- **Stale test runner.** A reused Simulator can keep running an older installed copy of the runner after a
  rebuild; `run.sh` uninstalls it first.
- **Accessibility frames are not the visible area.** The keyboard's accessory bar (Previous/Next/Done) and the
  QuickType row sit above `keyboards.firstMatch.frame`; only the page's `visualViewport` says what is visible. The same
  goes for `isHittable`: an action below a 98px sheet's edge still reports `hittable=true`, because XCUITest does not know
  the sheet's clip. Use `page-log.jsonl` for what is on screen.
- **A rotated screenshot keeps its old orientation tag.** `sips -r 270` rotates the pixels but leaves the file's EXIF
  `Orientation` tag, so any viewer that honours the tag (browsers, GitHub) rotates the picture a second time. After
  rotating, set the tag back to 1 or strip the metadata, then look at the result.
- **One engine/OS per run.** Results here are iOS 26.5 on an iPhone 17 Pro; Dynamic Type, VoiceOver and Safari's
  other toolbar modes are not driven.

The logger records geometry, focus targets and the _length_ of typed values only; it never writes a typed value
or the page URL.
