# iOS Simulator playtest (real Mobile Safari)

> Vendored from the `sonnet-eq` lineage (`218bfea`) for the `ho` lane (2026-10-08), with two edits for this
> lineage: the sticky-dock test is removed (this lineage has no sticky dock), and the join-form test no
> longer requires an app-drawn inline error (this lineage validates natively; iOS draws its own bubble,
> which XCUITest cannot read, so the test checks the field stays above the keyboard and focused).
> Run on a dedicated simulator device (e.g. `xcrun simctl create ho-iPhone17Pro-26 ...`) so a peer
> lane's booted device is never touched; on a fresh device the first run of the Back test can fail with
> "Neither element nor any descendant has keyboard focus" (rig typing, not the page): rerun it.

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

- **Signed-out forms:** with the keyboard up, submit an empty form from the keyboard's Go/Return key; focus
  stays in the first invalid field, which sits fully above the keyboard (the native validation bubble is
  OS chrome and is not asserted). A malformed room code is then submitted the same way.
- **Correction sheet:** create a session, load the opening scene, open a character's Correct sheet.
  Portrait with the keyboard up: the reason field, Apply, Cancel and the title are all above the
  keyboard and the field does not overlap the action row. Landscape with the keyboard up: the reason
  field is above the keyboard and does not overlap the action row; Apply and Cancel are only recorded,
  because in that state the sheet scrolls as one page (compact mode, which XCUITest cannot observe; it is
  asserted by the Chrome tight-keyboard scenarios in `ui-audit.mjs`). Landscape without the keyboard:
  captured.
- **Native `<select>`:** the scene select is tapped and the OS picker captured (the OS draws it, so the
  page cannot clip it).

## Findings it produced

2026-10-02 (original lineage, iOS 26.5): landscape with the keyboard up leaves roughly 70-140 px of visible
height, and the earlier pinned header/footer overlapped the reason field. This lineage handles it with a
CSS size container on the backdrop (`@container sheet (max-height: 10rem)`: the sheet becomes one scrolling
page), asserted in headless Chrome by `ui-audit.mjs`. 2026-10-08 (`ho`, iOS 26.5): the correction sheet,
Back-closes-only-the-sheet and the signed-out form checks all pass against both the pre-change and the
changed build; evidence is in `docs/evidence/ho-reskin/ios-simulator/`.

## Limits

- One engine and OS version per run; text-size and Dynamic Type settings, VoiceOver, and Safari's
  various toolbar modes are not driven.
- Element frames come from the accessibility tree (points); frames of content scrolled out of a
  scrolling container are layout frames, so only controls expected to be on screen are asserted.
