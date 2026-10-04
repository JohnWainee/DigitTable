# iOS Simulator playtest (real Mobile Safari)

`ui-audit.mjs` drives headless Chrome. Headless Chrome cannot shrink only the _visual_ viewport the way
iOS Safari does for the software keyboard (`Emulation.setVisibleSizeOverride` no longer exists), so the
bottom-sheet's keyboard behaviour on iOS was previously only reasoned about and covered in jsdom. This
harness drives the **real Mobile Safari in the iOS Simulator** with an XCUITest bundle (taps, typing,
the software keyboard, the native `<select>` picker, rotation) against a locally served build, and
fails when a control that must be visible with the keyboard up is covered by it.

It is **not** a physical device. It does not replace the manual release gate
(`docs/evidence/today-qwen/CHECKLIST.md`, section E2): real iOS hardware, Android, VoiceOver, TalkBack,
NVDA and Windows High Contrast remain unperformed here.

## Run

1. On this Mac's loopback, run the Firebase emulators and serve an emulator-mode build:
   `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npx firebase emulators:start --only auth,firestore,functions --project demo-digitable`
   (after `npm run build --workspace @digitable/functions`), and, from `apps/web`, `VITE_FIREBASE_API_KEY=demo-key
   VITE_FIREBASE_AUTH_DOMAIN=demo-digitable.firebaseapp.com VITE_FIREBASE_PROJECT_ID=demo-digitable
   VITE_FIREBASE_APP_ID=1:000000000000:web:demo VITE_FIREBASE_USE_EMULATOR=true npx vite build --outDir /tmp/digitable-web`
   then `npx vite preview --outDir /tmp/digitable-web --port 4173`. A Simulator reaches the Mac at
   `127.0.0.1`. Do not use `lan-up.sh` for this: it binds the unauthenticated emulators to every interface.
2. `scripts/playtest/ios-simulator/run.sh [--base URL] [--out DIR] ["iPhone 17 Pro" "iPhone 17e" "iPad mini (A17 Pro)"]`
   (the default base is `http://127.0.0.1:4173`; a non-loopback base is refused unless `--allow-remote`,
   because the flows create rooms).

Needs Xcode and at least one iOS Simulator runtime. Nothing is installed on a device, no credentials or
Firebase project are involved (the emulator project id is the fake `demo-digitable`). The Simulator must
show its **software** keyboard (the tests assert it appears): that is the default for a headless boot; if
the Simulator app has "Connect Hardware Keyboard" on, turn it off (I/O > Keyboard). Simulators the script
booted are shut down afterwards. Output (default `/private/tmp/digitable-ios-playtest/`):
`<device>/` holds PNG screenshots and a `.log` of every measured element frame against the keyboard's
frame; `<device>-xcodebuild.log` sits beside that directory. iOS screenshots of a rotated device
are written in the device's native (portrait) orientation; rotate with `sips -r 270 file.png`.

## What it checks

- **Signed-out forms:** with the keyboard up, submit an empty form from the keyboard's Go/Return key; the
  app's own inline error appears (no native validation bubble), focus stays in the first invalid
  field, and both the field and its error text sit fully above the keyboard. A malformed room code
  yields the pattern message.
- **Correction sheet:** create a session, load the opening scene, open a character's Correct sheet.
  Portrait with the keyboard up: the reason field, Apply, Cancel and the title are all above the
  keyboard and the field does not overlap the action row. Landscape with the keyboard up: the reason
  field is above the keyboard and does not overlap the action row; Apply and Cancel are only recorded,
  because in that state the sheet scrolls as one page (compact mode, which XCUITest cannot observe; it is
  asserted by the Chrome tight-keyboard scenarios in `ui-audit.mjs`). Landscape without the keyboard:
  captured.
- **Native `<select>`:** the scene select is tapped and the OS picker captured (the OS draws it, so the
  page cannot clip it).

## Findings it produced (2026-10-02, iOS 26.5 Simulator)

Landscape with the keyboard up leaves roughly 70-140 px of visible height. The earlier sheet pinned a
header and a footer and let only the body scroll; there the title scrolled out of view, the reason field
overlapped the footer, and the action buttons were clipped. The sheet now switches to a compact mode
(`data-compact`, set by `useVisualViewportBox` below 15rem of visible height) in which the whole sheet
scrolls. See `docs/reviews/2026-10-02-db-popout-picker-audit-review.md`.

## Findings it produced (2026-10-04, `sonnet-eh`, iPhone SE 3rd generation and iPhone 17 Pro, iOS 26.5)

- **Realtime updates did not reach Mobile Safari against the emulators.** In the iOS Simulator the GM's own
  "Load scene" appeared 30.1 s after the tap on both phones (the `useRoomProjection` fallback poll), 1.1 s with
  Firestore long polling (iPhone 17 Pro, iPhone SE 3rd generation, iOS 26.5; after the fix also iPad mini and
  iPhone 17e on iOS 27.0). Fixed for emulator builds in `apps/web/src/firebase/firestore.ts`; cause not
  established, physical devices not measured. The same flow against the deployed staging site took 4.1 s, so
  production transport is untouched. `createSessionAndOpenConsole` logs the delay and requires it to be under
  `DIGITABLE_SCENE_BUDGET` seconds (default 20).
- **A centre tap on a field failed next to Safari's own UI.** On a 667pt phone with the keyboard up, a tap at the
  middle or lower part of the next field dismissed the keyboard and focused nothing ("Neither element nor any
  descendant has keyboard focus"); taps in its upper part focused it every time. Safari's address capsule and
  form-assist bar are drawn just below that field, but the exact mechanism is not established. This is the
  "iPhone SE typing failure" earlier lanes could not attribute: a rig issue, not a page defect. `tapField` taps
  the upper part of the field (scrolling it into view first). A person can also use the form-assist Next button.
- **A swipe loop can stop on a transient frame.** `bringIntoView` drags toward the element and re-checks.
- Create the SE device once: `xcrun simctl create "eh-iPhoneSE3" com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation com.apple.CoreSimulator.SimRuntime.iOS-26-5`
  (the script matches simulators by exact name). `xcodebuild` can linger after a failing run; check for it before
  starting another run on the same device.

## Limits

- One engine and OS version per run; text-size and Dynamic Type settings, VoiceOver, and Safari's
  various toolbar modes are not driven.
- Element frames come from the accessibility tree (points); frames of content scrolled out of a
  scrolling container are layout frames, so only controls expected to be on screen are asserted.
