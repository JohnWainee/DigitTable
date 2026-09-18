# Two-device playtest runbook (GM + player, local emulators)

Scope: a **private, local-only** playtest of *Eat the Reich* on this repo's real code path —
real Firebase Auth, Functions, Firestore rules and per-viewer projections — running in the
**Firebase Emulator Suite on the GM's laptop**, played from two (optionally three) devices on the
same Wi-Fi. Nothing is deployed and no Firebase project, credential, or production resource is
involved (project id `demo-digitable` is an offline fake). This is **not** the staging rehearsal
(`docs/RUNBOOK.md`, acceptance row 22); it is the fastest honest way to play the game today.

Why not fixture mode? Fixture mode (no `VITE_FIREBASE_*`) keeps state in one browser tab's
memory. Two devices would each see a different, empty world. Use it only for solo demos.

## 1. Prerequisites (once)

- Node 22 and `npm ci` in the repo root.
- Java (`brew install openjdk`); the Firestore/RTDB emulators are JVMs.
- Both devices on the **same Wi-Fi** as the laptop. Allow incoming connections for `node` and
  `java` if macOS asks (System Settings > Network > Firewall).
- **If the checkout is under `~/Documents`**, macOS blocks esbuild/Firebase startup there. Copy it
  first: `rsync -a --exclude .git --exclude .claude ./ /private/tmp/digitable-play/ && cd /private/tmp/digitable-play && npm ci`.
- Google Chrome is needed only for the automated rehearsal in section 6.

## 2. Start

```bash
scripts/playtest/lan-up.sh
```

It builds Functions and the live-mode web app, starts the emulators bound to `0.0.0.0`
(`firebase.lan.json`), serves the app on port 4173, and prints the URLs:

| Device | URL |
| --- | --- |
| GM (laptop) | `http://localhost:4173/` |
| Player (phone) | `http://<laptop-lan-ip>:4173/` |
| Table display (optional, big screen) | `http://<laptop-lan-ip>:4173/#/table` |

**Security note.** The emulators bind to `0.0.0.0` (every interface, including VPN and hotspot) and the
Firestore/Auth emulators have no real authentication: anyone on the network can bypass the security
rules with an emulator owner token and read GM secrets or wipe every room. Use a network you trust
(home Wi-Fi, never café or public Wi-Fi), and stop the script (Ctrl-C) when the session ends. All room
data lives in emulator memory and disappears when it stops. The RTDB emulator is not started (presence
is not implemented yet).

## 3. Session script (about 20 minutes)

1. **GM** opens the URL, taps *Create a session*, enters a session name, a passphrase (4+ chars)
   and a display name. On the "Write these down" card, record the **room code**, **table code**
   and **GM recovery code**, tick the box, continue, and open the director console.
2. **GM** presses *Load scene* (opening scene: the drop forecourt). The scene art appears.
3. **Player** opens the phone URL, taps *Join by code*, enters room code, passphrase, name. Record
   the shown recovery code, continue, tap *Claim* on a character, then *Continue to your dashboard*.
4. **(Optional) Table:** on the big screen choose *Join as the table display*, enter room code and
   **table code** (not the passphrase). It shows the route map, scene, party; no controls.
5. **Player** picks a stat (and items/abilities if desired) and taps *Declare action*.
   **GM** sees it under *Pending actions*; review claims/threats and tap *Roll it*.
6. **Player** assigns every kept die to a target and taps *Confirm allocation*; the result appears
   on all devices. Player taps *Back to scene*.
7. **GM** tries *Pause* (player and table show "Paused"), then *Resume*.
8. **GM** taps *End round N*, then *Advance scene* (a reason is required if the primary objective
   is not complete). Player and table switch to the new scene.
9. **Reload test:** reload the player's browser tab. It should return to the dashboard without
   re-joining. Then briefly turn the phone's Wi-Fi off and on; the status strip should recover.

## 4. Known behaviour and limits (read before blaming the app)

- **One command at a time per seat.** While the "awaiting confirmation" line is visible, a second
  ordinary command from the same seat is refused with "Your previous action is still awaiting
  confirmation". Wait for it to clear (normally under a second) and press again. `Pause` is exempt.
  The Scene director's *reason* field is cleared when you press *Advance scene* even if that press
  is refused this way, so retype the reason.
- **Plain-http LAN pages are not a secure context.** `crypto.randomUUID` does not exist there; the
  app uses `apps/web/src/shared/uuid.ts` instead. If you ever see
  `randomUUID is not a function`, you are running a build older than this fix.
- **Identity lives in the browser profile.** A private/incognito tab, cleared site data, or a
  different browser is a *new* anonymous identity and cannot resume the seat. There is currently
  **no recovery-code entry screen** in this branch (the "Enter your recovery code" strip text has
  nothing behind it). `sonnet-c/c08-recovery` (`97126b5`) adds one and applies cleanly onto this
  base (tested in a scratch worktree); merging it is John's decision. Workaround: keep using the
  same browser profile, or start a fresh room.
- The landing/create/join pages show "Connected" from a short timer, not from a live link check;
  the room screens (claim, player, GM, table) show real connection state.
- Emulator data is volatile: stopping `lan-up.sh` deletes every room, member, and secret.
- Functions log `admission.appCheckMissing` warnings; App Check is monitoring-only and unset here.
- Placeholder art is original but unapproved for public release (see
  `assets/generated/eat-the-reich/LICENSE-ASSETS.md`); fine for a private playtest.

## 5. Troubleshooting

| Symptom | Check |
| --- | --- |
| Phone cannot open the URL | Same Wi-Fi? Try the other LAN address printed by Vite in the preview log (`lan-up.sh` prints the log directory); firewall prompt; guest/isolated Wi-Fi networks block device-to-device traffic. |
| Page loads, create/join fails | the emulator log (path printed by `lan-up.sh`); the page host must match the emulator host (the app targets the page's own hostname; override with `VITE_EMULATOR_HOST` at build time). |
| Script exits "Java is required" | `brew install openjdk` (the script adds `/opt/homebrew/opt/openjdk/bin` to `PATH`). |
| Port already in use | Another emulator/preview is running (ports 9099, 5001, 8080, 4173). Stop it first. |
| Images missing | Expected fallbacks (gradient scene, monogram, threat glyph); play is unaffected. |

## 6. Automated rehearsal (optional, needs Chrome)

With `lan-up.sh` running, this drives GM (desktop), player (phone emulation) and table (1920x1080)
as isolated browser profiles through the whole loop over the LAN address and writes screenshots and
`report.json`:

```bash
node scripts/playtest/two-device-smoke.mjs --base http://<lan-ip>:4173 --out /tmp/run --reload
# variants: --no-images (all art blocked), --block "*scene-*" (only large scene art blocked),
#           --routes-only (signed-out route + viewport audit)
```

It exits non-zero on any failed step and records console errors, failed requests, and horizontal
overflow at 375/768/1024/1280/1920. Committed evidence from the run that produced this runbook is in
`docs/evidence/today-qwen/`.

## 7. Recording the session

Use `docs/evidence/today-qwen/CHECKLIST.md` while playing and attach screenshots or notes.
