# Two-seat playtest runbook (GM seat + player seat, emulator-backed)

Scope: play one real DigiTable session with a GM seat and a player seat against the Firebase Emulator Suite (Auth,
Firestore, Functions, RTDB) and the Vite dev server, all on one Mac. Nothing here touches the staging project or any
deployed resource; no `firebase deploy` is involved. A staging rehearsal remains a separate, deliberate step
(`docs/RUNBOOK.md` section 3) that only John runs.

**Status of the evidence this runbook exists to collect:** acceptance row 22 of `docs/PHASE_2_PLAN.md` (three
physical devices, then staging) is **still open**. The automated suites prove the same behavior through two
independent browser-equivalent Firebase apps against the real emulators, but no physical-device run has been
recorded. Section 8 is the table to fill in when a person has run it; do not pre-fill it.

## 0. What this runbook can and cannot do today

- **Works today:** two browser windows or profiles on the same Mac (GM in one, player in the other), both at
  `http://localhost:5173`. `localhost` is a secure context, so `crypto.randomUUID` is available.
- **Does not work today: two physical devices over the LAN.** Three things the code does not yet provide:
  1. `apps/web/src/session/roomClient.ts` hard-codes the emulator endpoints to `127.0.0.1`; there is no
     `VITE_FIREBASE_EMULATOR_HOST` (or similar) setting, so a phone cannot reach the Mac's emulators.
  2. `firebase.json` binds the emulators to their defaults (loopback); there is no LAN-bound emulator config.
  3. The app calls `globalThis.crypto.randomUUID()` directly (for example `apps/web/src/session/ownership.ts`,
     `apps/web/src/player2/PlayerDashboardScreen.tsx`, `apps/web/src/gm2/GmDirectorScreen.tsx`). Browsers withhold
     it on a plain-HTTP non-`localhost` origin, so a LAN device on `http://<mac-ip>:5173` fails at the first command
     unless a `getRandomValues`-based fallback is added or the origin is HTTPS.
  Making that work is a small, separate change (endpoint host setting, LAN emulator config, UUID fallback) that
  has not been made or tested. Until then, physical-device evidence must come from the staging rehearsal, or from a
  branch that adds those three things.

## 1. What you need

- The Mac that will host everything, with Node 22 and a JDK for the emulators
  (`PATH=/opt/homebrew/opt/openjdk/bin:$PATH` on this machine).
- Two browser windows (or one normal window plus a private window / second profile, so the two seats do not share
  `localStorage` seat ownership).

## 2. Host workaround for this Mac

Directory enumeration under `/Users/john/Documents` blocks esbuild and Firebase startup before source is read
(recorded in `docs/reviews/2026-09-17-s06-outbox-reconciliation-review.md`). Run everything from an APFS clone
under `/private/tmp`:

```sh
cp -cR /Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/today-deepseek /private/tmp/digitable-play
cd /private/tmp/digitable-play
```

(The clone includes `node_modules`. Run `npm ci` in it only if dependencies changed.)

## 3. Start the backend

```sh
export PATH=/opt/homebrew/opt/openjdk/bin:$PATH
npm run build --workspace @digitable/functions
npx firebase emulators:start --only auth,firestore,database,functions --project demo-digitable
```

Wait for the "All emulators ready" banner. `demo-digitable` is the emulator-only placeholder project; the CLI never
contacts Google for it. The emulators listen on loopback only.

## 4. Start the web app

In a second terminal in the same clone:

```sh
cd apps/web
VITE_FIREBASE_API_KEY=demo-api-key \
VITE_FIREBASE_AUTH_DOMAIN=demo-digitable.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=demo-digitable \
VITE_FIREBASE_APP_ID=demo-app-id \
VITE_FIREBASE_USE_EMULATOR=true \
npx vite --port 5173
```

These are the variables `apps/web/src/firebase/config.ts` and `apps/web/src/session/roomClient.ts` read. Without the
`VITE_FIREBASE_*` config the app runs in fixture mode (one in-memory room per tab), which is not a two-seat test.
Open `http://localhost:5173` in both windows.

## 5. Session script

Use **window G** (GM) and **window P** (player). Note the time and result of each step in section 8.

1. **G:** Landing -> _Create a session_. Enter a session name, a passphrase, a display name. Record the room code,
   the table code and the GM recovery code shown once (they are never displayed again).
2. **P:** Landing -> _Join by code_. Enter the room code, the passphrase and a display name. Record the player recovery
   code. Then claim a character on the claim screen.
3. **G:** Director console -> _Load scene_ (opening scene).
4. **P:** Declare an action (pick a stat, optionally gear) on the player dashboard. **G:** the pending action
   appears; review it and press _Roll it_. **P:** the dice appear; allocate them and confirm.
5. Both windows show the resolved state from their own projection; **P** sees the resolution summary once.
   (After a reload, _Resume session_ on the landing screen returns to the same seat.)

Resilience checks (these are the S06 behaviors; run each once):

- **R1 refresh mid-flow (P):** after step 4 declare, and again after the GM rolls but before allocating, reload the
  page. The pending state is restored from the projection; no duplicate action appears.
- **R2 lost response (P):** on the allocate step, press confirm and immediately set P's DevTools Network throttling
  to _Offline_ (on a phone, airplane mode). Wait 10 seconds, restore the connection. The action settles once (no
  second allocation, no reroll) and the summary appears once.
- **R3 no re-fire (P):** after dismissing the resolution summary, reload. It does not reappear.
- **R4 ordering (P/G):** while P is offline in R2, have G press _Pause_ and resume. When P reconnects the earlier
  resolution summary is still presented; the pause does not replace it.
- **R5 late join (optional third window):** in a fresh browser profile (or a private window) join the same room
  as a second player after step 4. It shows the current state from its projection and does **not** replay the
  earlier events as new presentation. (There is no recovery-code screen in the web app yet, so this uses a new
  seat rather than `recoverSeat`.)
- **R6 privacy (G/P):** G's console shows hidden threat notes; P's dashboard never does at any point.
- **R7 two tabs, one seat (P):** open the player dashboard in two tabs of the same profile. Each tab may present
  the same resolution summary once; this is a known limit (see section 9), not a failure.

## 6. Optional table display

Open `http://localhost:5173/#/table` in a third window and enter the table code from step 1 to add the shared
display. It shows only the shared projection.

## 7. Teardown

`Ctrl-C` both terminals (the emulators keep no data across runs unless exported). Delete `/private/tmp/digitable-play`
when finished. Nothing was written outside that directory and the emulators' in-memory data.

## 8. Evidence log (fill in when run by a person; leave blank otherwise)

Record the device/browser/OS honestly. If both seats were browser windows on one Mac, say so; that is not the
physical-device evidence acceptance row 22 asks for.

| Step                        | Device / browser / OS | Result (pass/fail) | Time | Notes |
| --------------------------- | --------------------- | ------------------ | ---- | ----- |
| 1 Create                    |                       |                    |      |       |
| 2 Join + claim              |                       |                    |      |       |
| 3 Load scene                |                       |                    |      |       |
| 4 Declare / roll / allocate |                       |                    |      |       |
| 5 Resolution summary once   |                       |                    |      |       |
| R1 refresh mid-flow         |                       |                    |      |       |
| R2 lost response            |                       |                    |      |       |
| R3 no re-fire               |                       |                    |      |       |
| R4 ordering                 |                       |                    |      |       |
| R5 late join                |                       |                    |      |       |
| R6 privacy                  |                       |                    |      |       |
| R7 two tabs, one seat       |                       |                    |      |       |

## 9. Known limits of this setup

- Loopback only (section 0). Plain HTTP on `localhost`: no service worker and no HTTPS-only features. Not a
  substitute for the staging rehearsal over HTTPS.
- App Check is not enforced (no site key is configured) and RTDB presence is not implemented (Phase 2 PR 5).
- The presentation ledger is one `localStorage` record per seat and browser profile. Two tabs of one seat can each
  present a not-yet-acknowledged summary once; an acknowledgement in one tab reaches the other only after its next
  ledger load.
- Emulator data is in-memory; restarting the emulators discards every room.
