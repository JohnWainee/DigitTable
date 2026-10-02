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

1. Serve an emulator-mode build and the emulators, e.g. `scripts/playtest/lan-up.sh` (serves
   `http://127.0.0.1:4173`; a Simulator reaches the Mac's loopback at the same address), or run the
   emulators and a `vite preview` of a build made with `VITE_FIREBASE_USE_EMULATOR=true` (see
   `docs/PLAYTEST_TWO_DEVICE.md`).
2. `scripts/playtest/ios-simulator/run.sh [--base URL] [--out DIR] ["iPhone 17 Pro" "iPhone 17e" "iPad mini (A17 Pro)"]`

Needs Xcode and at least one iOS Simulator runtime. Nothing is installed on a device, no credentials or
Firebase project are involved (the emulator project id is the fake `demo-digitable`). Output (default
`/private/tmp/digitable-ios-playtest/<device>/`): PNG screenshots, a `.log` of every measured element
frame against the keyboard's frame, and `<device>-xcodebuild.log`. iOS screenshots of a rotated device
are written in the device's native (portrait) orientation; rotate with `sips -r 270 file.png`.

## What it checks

- **Signed-out forms:** with the keyboard up, submit an empty form from the keyboard's Go/Return key; the
  app's own inline error appears (no native validation bubble), focus stays in the first invalid
  field, and both the field and its error text sit fully above the keyboard. A malformed room code
  yields the pattern message.
- **Correction sheet:** create a session, load the opening scene, open a character's Correct sheet.
  Portrait with the keyboard up: the reason field, Apply, Cancel and the title are all above the
  keyboard. Landscape with the keyboard up: the sheet is in compact mode (it scrolls as one page); the
  reason field is above the keyboard. Landscape without the keyboard: captured.
- **Native `<select>`:** the scene select is tapped and the OS picker captured (the OS draws it, so the
  page cannot clip it).

## Findings it produced (2026-10-02, iOS 26.5 Simulator)

Landscape with the keyboard up leaves roughly 70-140 px of visible height. The earlier sheet pinned a
header and a footer and let only the body scroll; there the title scrolled out of view, the reason field
overlapped the footer, and the action buttons were clipped. The sheet now switches to a compact mode
(`data-compact`, set by `useVisualViewportBox` below 15rem of visible height) in which the whole sheet
scrolls. See `docs/reviews/2026-10-02-db-popout-picker-audit-review.md`.

## Limits

- One engine and OS version per run; text-size and Dynamic Type settings, VoiceOver, and Safari's
  various toolbar modes are not driven.
- Element frames come from the accessibility tree (points); frames of content scrolled out of a
  scrolling container are layout frames, so only controls expected to be on screen are asserted.
