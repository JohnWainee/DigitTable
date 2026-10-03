# Two-device playtest evidence checklist

Fill this in during the manual session from `docs/PLAYTEST_TWO_DEVICE.md`. Copy the file to a
dated name (for example `CHECKLIST-2026-09-18.md`) so the blank template stays reusable. Tick only
what you personally saw; write what happened for anything that did not go as described.

## Session header

| Field | Value |
| --- | --- |
| Date / start time | |
| Commit (`git rev-parse --short HEAD`) | |
| Stack | local emulators via `scripts/playtest/lan-up.sh` (yes / no) |
| Laptop / GM browser + version | |
| Player device model, OS, browser + version | |
| Table display device (or "none") | |
| Network (home Wi-Fi name is not needed; note "shared, trusted") | |

## A. Bring-up

- [ ] `scripts/playtest/lan-up.sh` printed the three URLs
- [ ] Player device opened `http://<lan-ip>:4173/` and saw the landing hero art
- [ ] No `randomUUID` or other console error on create/join (mobile console or remote inspect)

## B. Flow (tick when seen on the named device)

| # | Step | Device | Seen | Notes |
| --- | --- | --- | --- | --- |
| 1 | Create session; codes card shown once | GM | [ ] | |
| 2 | Load opening scene; scene art visible | GM | [ ] | |
| 3 | Join with code + passphrase; recovery code shown once | Player | [ ] | |
| 4 | Roster shows six portraits; claim one; dashboard opens | Player | [ ] | |
| 5 | "Characters claimed: 1/6" appears without refresh | GM | [ ] | |
| 6 | Table joins with the **table code**; shows map, scene, party, no controls | Table | [ ] | |
| 7 | Declare action; "Declared" state; appears in GM Pending actions | Player / GM | [ ] | |
| 8 | Roll it; allocation panel appears; confirm allocation | GM / Player | [ ] | |
| 9 | Result shown; "Back to scene" works | Player | [ ] | |
| 10 | Pause shows on player and table; Resume clears it | GM / all | [ ] | |
| 11 | End round; Advance scene (reason if required); all devices switch scene | GM / all | [ ] | |
| 12 | Reload player tab: returns to dashboard, no re-join | Player | [ ] | |
| 13 | Wi-Fi off 10 s then on: strip recovers, no duplicate action | Player | [ ] | |

## C. Privacy and isolation (must all be "yes")

- [ ] The table screen never shows the room code, passphrase, table code, or any recovery code
- [ ] The table screen has no buttons or inputs
- [ ] The player never sees GM-only notes or unrevealed threats (Scene director "hidden" threats)
- [ ] A second player (if present) cannot see the first player's private sheet details

## D. Layout and art

- [ ] Phone portrait: no horizontal scrolling on any screen
- [ ] Phone landscape or tablet: layout still usable
- [ ] Table on the large display: readable from across the room, scene banner visible
- [ ] With Wi-Fi to the internet unavailable (LAN only) art still loads (it is served locally)
- [ ] Any missing image showed a clean fallback (gradient scene, monogram, threat glyph)

## E. Accessibility quick pass (record device + assistive tech used)

- [ ] Keyboard only on the laptop: complete declare and allocate without a mouse
- [ ] Screen reader (VoiceOver) announces state changes without moving focus (optional)
- [ ] Reduced motion setting on: no distracting animation

## E2. Mobile pop-outs, keyboard and forms (physical devices; OWED, not performed)

Headless Chrome and the iOS Simulator (`scripts/playtest/ios-simulator/`) do not replace these. Record the
device, OS, browser and assistive technology next to each item.

- [ ] iPhone Safari, portrait: GM correction sheet; tap the Reason field. Title, field, Apply and Cancel are all above the keyboard
- [ ] iPhone Safari, landscape, keyboard up: the sheet scrolls as one page, nothing is clipped, the typed-in field stays in view; the keyboard's Done restores the pinned title and actions
- [ ] Android Chrome (portrait and landscape): the same two checks
- [ ] Native pickers (Scene, Edit target, Advance, Character): the OS list opens, shows full option text, and the chosen value is repeated in full under the control
- [ ] Join / Create / Recover / Table forms: an invalid submit shows the app's own error under the field (no browser bubble), focus lands in the first invalid field, the keyboard stays up and the error is readable above it
- [ ] The inline errors are announced by VoiceOver (iOS/macOS) and TalkBack, and by NVDA with Chrome and Firefox; the sheet traps focus and restores it on close
- [ ] Larger text (iOS Larger Text / Android font size) and browser zoom: no horizontal scroll, sheet still reachable
- [ ] Windows High Contrast / forced colours: controls and the sheet keep visible boundaries

## F. Problems found

| # | Severity (blocker / annoying / cosmetic) | Device | What happened | Screenshot |
| --- | --- | --- | --- | --- |
| | | | | |

## G. Verdict

- [ ] Playable end to end on two devices
- [ ] Ready for the staging rehearsal (`docs/RUNBOOK.md`)
- Signed off by / date:
