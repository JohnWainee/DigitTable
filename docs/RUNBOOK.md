# Operations runbook: setup, resume, recovery, backup, restore

Board task A07. Scope: the network/persistence slice Sonnet A owns (`apps/functions`, `packages/contracts`,
`packages/engine`, the Firestore/RTDB data model). This is the **operational runbook for staging deploys**. The
first staging candidate was deployed on 2026-09-18; the commands below are the repeatable procedure for later
releases. Nothing here creates a new Firebase project, a production project, or any paid resource.

## 0. What "done" means here, and what it doesn't

This runbook covers **setup, resume/recovery, and backup/restore** for the room-persistence layer that A01–A06
built and independently reviewed: `createRoom`, `admitMember`, `claimSeat`, `submitRoomCommand`, `recoverSeat`.

It does **not** cover, because these do not exist yet:

- **Cross-device recovery automation.** Same-browser reconnect and durable command reconciliation exist, but a
  lost browser identity still requires the one-time recovery-code flow described in section 6.
- **RTDB presence** (Phase 2 PR 5, `docs/PHASE_2_PR5_PLAN.md` — plan-only, not implemented).
- **App Check enforcement** — currently monitoring-only (`enforceAppCheck: false` on every callable,
  `docs/ARCHITECTURE.md` section 11); a request without a valid token is logged, never blocked.
- **Automated backup/retention/deletion** — `docs/ARCHITECTURE.md` section 8's retention table is explicitly
  "proposed... do not automate deletion until product approves values." Nothing in this repository automates it.
- **Production promotion.** A staging integration candidate is live on `powerglove-1cd23`, but the stacked PRs
  remain unmerged and no production Firebase project exists. Merge and production authority remain John's.

## 1. Prerequisites (one-time, per operator machine)

1. Firebase CLI, already a repo devDependency: `npx firebase --version` (no global install needed).
2. `firebase login` — an interactive OAuth flow; run it yourself, this session cannot run it for you.
3. Confirm the CLI sees the staging project and nothing else unexpected:
   ```
   npx firebase projects:list
   ```
   Expect `powerglove-1cd23` in the list. **Do not run `firebase projects:create`** — the task brief and this
   runbook both treat creating any new Firebase project as out of scope; staging is the only project this
   repository ever targets, and production remains deliberately uncreated (`docs/PHASE_2_DECISION_BRIEF.md`
   Decision 1).
4. `npx firebase use powerglove-1cd23` (or `npx firebase use --add` the first time, aliasing it e.g. `staging`).
5. A JDK on `PATH` for the local emulator suite (`PATH=/opt/homebrew/opt/openjdk/bin:$PATH` on this machine) —
   needed for every command in section 4 (dev loop) but not for a real deploy.

## 2. Region — verify before every deploy, not just once

`docs/PHASE_2_DECISION_BRIEF.md` Decision 1 records Firestore for staging in **`us-west1`**, RTDB in its existing
**`us-central1`** location, and directs recording the Functions region alongside Firestore. As of this task
(A07), that co-location is enforced in code: `packages/contracts/src/deployment.ts` exports
`FUNCTIONS_REGION = "us-west1"`, consumed by every `onCall` in `apps/functions/src/callables.ts` and
`gameCallables.ts`, and by `apps/web/src/firebase/functions.ts`'s `getRoomFunctions`. Both sides now read the same
constant from the same package, so they cannot silently drift apart in code again — but **the actual Firestore
database region is a project-level GCP setting this repository cannot see or change**, and 2nd-gen Cloud Functions
still deploy to whatever region `FUNCTIONS_REGION` says, not to whatever region Firestore happens to be in.

Before any real deploy:

```
npx firebase firestore:databases:list --project powerglove-1cd23
```

Confirm the listed location matches `us-west1`. If it does not, **stop** — deploying functions to `us-west1`
against a Firestore database in a different region would violate the decision brief's co-location intent and
should not proceed without a fresh decision, not a runbook workaround.

## 3. Preparing or updating a versioned staging candidate

The 2026-09-18 staging release followed this sequence from the reviewed integration branch. Repeat it for later
staging candidates after the intended commits are integrated and reviewed:

```
# 1. From a checkout of `main` after merging #13, #15, #18, #23, #27, #30 (in that dependency order):
npm ci
npm run check          # full gate: format, lint, typecheck, currently 589 passing / 11 todo
npm run build           # functions bundle + web build
PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator   # currently 18 + 86 + 3 passing

# 2. Deploy rules first (Firestore + RTDB), separately from functions, so a rules regression
#    is caught and rollback-able independently of function code:
npx firebase deploy --only firestore:rules,database --project powerglove-1cd23

# 3. Deploy functions:
npx firebase deploy --only functions --project powerglove-1cd23

# 4. Build the web client with the registered staging web-app configuration, then deploy Hosting:
VITE_FIREBASE_API_KEY=<staging-web-api-key> \
VITE_FIREBASE_AUTH_DOMAIN=powerglove-1cd23.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=powerglove-1cd23 \
VITE_FIREBASE_APP_ID=1:564246956157:web:a3c97624113c72c54f8914 \
npm run build --workspace @digitable/web
npx firebase deploy --only hosting --project powerglove-1cd23

# 5. Record the deployed commit SHA and the Firebase CLI's own release/version output
#    (printed at the end of the functions deploy) in this file's "Deploy log" section below —
#    that pairing is the "versioned staging candidate."
```

Do not pass `--force`. The Firebase web API key is public configuration, but keep the build command in operator
history rather than committing an environment file. Hosting serves `apps/web/dist` with an SPA rewrite.

### Deploy log

- **2026-09-19 HST — Codex — sourcebook roster Hosting deploy:** built the web client from reviewed commit
  `5e8907b` with the registered staging Firebase configuration and deployed Hosting only to
  `powerglove-1cd23`. The custom domain <https://digitable.signal-bleed.com> returned the new
  `index-D8nuHDtl.js` bundle over valid HTTPS; the public bundle contains all six approved names:
  Iryna, Nicole, Cosgrave, Chuck, Astrid, and Flint. A follow-up diagnosis found that room creation still used
  the prior roster because the callable backend had not accompanied the Hosting release. All five Functions
  were then deployed from the same commit. A fresh-room `two-device-smoke.mjs --reload` run against the custom
  domain passed all 17 GM/player/table steps with no layout failures. Existing rooms retain their stored roster
  by design and must not be used to assess a roster update.

- **2026-09-18 HST / 2026-09-19 UTC — Codex — staging:** deployed the integration candidate based on commit
  `1af191e` to Firebase project `powerglove-1cd23`: Firestore rules, RTDB rules, all five `us-west1` callable
  Functions, and Hosting. The Functions deployment required removing local workspace packages from the deployed
  Functions package's `devDependencies` (the production bundle already contains their compiled code). The Cloud
  Run services were assigned `allUsers` the transport-level `roles/run.invoker` role; this is required for
  Firebase callable clients, while Firebase Auth and platform authorization remain enforced inside every
  callable. Hosting is live at <https://powerglove-1cd23.web.app>.
- **Live verification:** `node scripts/playtest/two-device-smoke.mjs --base
  https://powerglove-1cd23.web.app --out /private/tmp/digitable-staging-smoke-6 --reload --port 9335` passed all
  13 GM/player/table steps, responsive overflow checks at five widths, and player reload recovery. Evidence used
  isolated browser contexts on one machine; the physical two-device rehearsal is still pending.
- **2026-09-18 HST — Claude — independent verification, no deploy:** the deployed build passed the full playthrough
  again (see `docs/reviews/2026-09-18-staging-independent-playtest-review.md`). It found a 40px phone-width overflow
  on the GM console once the opening scene loads; the CSS fix is committed on `factory/today-integration` but
  **Hosting has not been redeployed**, so <https://powerglove-1cd23.web.app> still serves the unfixed build until
  step 4 above is run.
- **2026-09-18 HST — Codex — consolidated Hosting redeploy:** consolidated the independently reviewed F1 and
  F4-F7 fixes and the reviewed ink-black reskin/mobile sheet onto `factory/today-integration`, confirmed the
  Firestore database location is `us-west1`, and deployed Hosting only. `npm run check` passed with 678 tests
  and 11 todo; production builds passed; the emulator suites passed 18 rules + 86 Functions + 3 web tests.
  The post-deploy `two-device-smoke.mjs --reload` run passed every step, and `ui-audit.mjs` audited 150 states
  and 1,344 controls with zero control issues, overflow states, hard axe violations, or failures. Evidence is in
  `/private/tmp/digitable-staging-smoke-7` and `/private/tmp/digitable-ui-audit-staging` on the operator machine.
  Physical-device rehearsal remains open; no backend rules or Functions were redeployed.
- **2026-09-18 HST — Codex — recovery/security Hosting redeploy:** added the lost-identity recovery form backed
  by the existing `recoverSeat` callable, rotated replacement-code handling, and removed recovery credentials
  from local persistence (including automatic scrubbing of legacy records). Updated Firebase dependencies;
  `npm audit --omit=dev` is clean. The only full-audit residuals are in the local Firebase CLI dependency tree,
  whose npm-proposed remediation is an incompatible downgrade. `npm run check` passed with 681 tests and 11
  todo; builds passed; emulator suites passed 18 + 86 + 4 tests; the live three-surface smoke passed every step
  after Hosting deployment. No rules or Functions runtime code changed or was redeployed.

## 4. Local dev loop (setup for iteration, not staging)

Every command below runs entirely against the local Emulator Suite (`firebase.json`'s `emulators` block:
auth 9099, Firestore 8080, RTDB 9000, Functions 5001) with the placeholder project ID `demo-digitable`. Nothing
here touches `powerglove-1cd23`.

```
npm install
npm run check
PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator
```

The three suites this drives (`packages/testing`, `apps/functions`, `apps/web`) exercise the real callables over
real HTTP through the emulator — not `.run()` unit-test shortcuts — including the region-qualified endpoint names
verified in section 2's code change (the emulator log line reads `Beginning execution of "us-west1-createRoom"`
etc. after this task's fix, proof the client and server now agree on region even though the emulator itself does
not enforce or care about region).

## 5. Session setup (creating and joining a room)

This is the real, reviewed flow — not a fixture. Both the emulator integration suite and the deployed `apps/web`
GM/player/table surfaces exercise it end to end against Firebase. Section 8 records the remaining physical-device
verification gap.

1. **Create a room**: `createRoom` callable (`apps/functions/src/createRoomAuthority.ts`). Caller supplies
   `requestId` (client-minted, idempotency key), `sessionName`, `passphrase`, `creatorDisplayName`. Server mints
   a 10-symbol room code (`generateRoomCode`, `packages/engine/src/roomCode.ts`), the GM's recovery code, hashes
   the passphrase, and atomically provisions the room with the GM seat already claimed (board task A03's
   fix: `initialState()` tolerates an empty roster since no player has joined yet). **The recovery code and room
   code are returned once, in the response — never persisted in plaintext anywhere, never put in a URL.** Give
   the GM this response's `roomCode` (to share) and `recoveryCode` (to keep privately) immediately; there is no
   way to retrieve either again except regenerating the recovery code via `recoverSeat` (section 6).
2. **Join a room**: `admitMember` callable, `roomCode` + `passphrase` + `displayName` + `requestedCapability`
   (`"player"`). Returns `roomId`, `memberId`, `capability`, a per-seat `recoveryCode` (again, shown once), and
   the live `roomRevision` at admission time (A05 review fix — this used to be approximated client-side and was
   wrong for any room with prior activity; it is now server-echoed).
3. **Claim the table seat** (optional, at most one per room): `claimSeat` with the room's separate table code —
   a GM issues this out of band; the general passphrase never claims the table seat and the table code never
   admits a player or the GM (`docs/ARCHITECTURE.md` section 8).
4. **Act in the room**: `submitRoomCommand` with a `WireCommandRequest` (`commandId` — client-minted UUID,
   `payload`, `templateId`/`templateVersion`, optional `expectedRevision`). Idempotent per `(memberId, commandId)`
   — a retried request with the same pair replays the stored receipt rather than re-executing (A04).

## 6. Resume and recovery

Two distinct cases, both already implemented and independently reviewed — do not conflate them in support
guidance to players:

- **Same browser/device, same session** (the common case: a page reload, a brief network blip): the client's
  existing Firebase Auth anonymous UID is still valid and still bound (`uidBindings/{uid}` still points at the
  member's seat). Re-subscribing to `rooms/{roomId}/projections/{viewerId}` (`FirebaseRoomRepository`,
  A05) picks up the live state with no new admission call needed. S06's durable outbox retains submitted commands
  across reloads and reconciles them with server receipts; the live staging smoke verifies that the claimed seat
  and dashboard restore after reload without rejoining.
- **Lost browser identity** (cleared storage, new device, reinstalled app — the anonymous UID itself is gone):
  the player's old `uidBindings` entry is orphaned and unreachable to them. This is what `recoverSeat` is for
  (board task A06, independently reviewed, `docs/reviews/2026-09-14-a06-recoverseat-independent-review.md`):
  present the room code plus the recovery code shown once at admission/creation. On a match, the transaction
  atomically revokes the old UID's binding, binds the new one, issues a **fresh** recovery code (the presented
  one is spent and can never be reused), and writes a GM-visible audit entry naming only the seat's `memberId`
  (never the UID, never either code). **Give the player their new recovery code immediately after a successful
  recovery** — the old one is now dead and there is no other way to retrieve the new one.
  - **GM-side operational note**: if a player reports they cannot recover a seat, check the GM console's audit
    log (`rooms/{roomId}/audit/*`, GM-only read) for a `SeatRecovered` entry with that member's ID — a match
    there confirms someone (possibly the player themselves, from another device) already redeemed the code.
  - **Known, accepted residual** (`docs/ARCHITECTURE.md` section 8, R5): the old UID stays authenticated after
    redemption and can silently recreate an RTDB presence node until that browser session ends on its own — this
    is harmless for presence *display* today since RTDB presence isn't implemented yet, but will become a live
    residual once Phase 2 PR 5 lands. Do not represent recovery as a hard kick of the old device; it is a seat
    rebind, not a session termination.
  - **GM self-recovery has no path** (R3): if the GM loses both their browser and their own recovery code, there
    is currently no self-service recovery for the GM seat specifically. The only remedy today is starting a new
    room. Tell any GM this plainly before they lose their code, not after.
  - **A stolen GM code is a permanent takeover** (R4): redemption invalidates the presented code and hands full
    GM authority to whoever redeemed it. The only mitigation that exists today is rotating the GM's own recovery
    code (by having the legitimate GM redeem it themselves) immediately after any suspected exposure.
  - Recovery is rate-limited (`RECOVERY_THROTTLE_LIMITS`: 10 attempts per room-code+IP, 30 per IP, 60-second
    fixed window, `apps/functions/src/throttle.ts`) — the recovery code's own ~64.4 bits of entropy is the real
    defense against exhaustive search; the throttle only bounds automated velocity from one source
    (independent A06 review, item 6).

## 7. Backup and restore

**No backup automation exists in this repository.** This section describes what is possible with standard GCP
tooling against the staging project today, not anything this codebase implements or has exercised.

### Backup (manual, on-demand — not scheduled by anything in this repo)

```
gcloud firestore export gs://<a bucket you control>/backups/$(date +%Y%m%d-%H%M%S) \
  --project=powerglove-1cd23
```

This requires a GCS bucket to export into — none is provisioned by this repository, and provisioning one is a
new billable resource, which is out of scope for this task to create unilaterally. If John wants scheduled
backups, that is a deliberate infrastructure decision (bucket, retention/lifecycle policy, export schedule via
Cloud Scheduler) that should go through the same decision process as the region/project choices in
`docs/PHASE_2_DECISION_BRIEF.md`, not be silently added here.

RTDB has no equivalent export command implemented or exercised here either — presence data is designed to be
ephemeral (`docs/ARCHITECTURE.md` section 8: "Presence expires on disconnect/TTL") and is not a backup target
even once Phase 2 PR 5 lands.

### Restore (manual — **never exercised against `powerglove-1cd23`, or any project, in this repository**)

```
gcloud firestore import gs://<bucket>/backups/<timestamp> --project=powerglove-1cd23
```

This is the standard `gcloud` restore command, documented here for completeness because A07 asks for a restore
procedure to exist — but it has not been run, tested, or verified against this schema by any Sonnet A slice. Two
things any operator must confirm before trusting it in a real incident, neither of which this task can verify
without an actual export/import cycle against real data:

1. An import fully overwrites the target database's collections it touches — this is destructive to whatever is
   live in staging at the time. Never run it against a project with any unarchived, currently-played campaign
   without confirming with whoever is running that session first.
2. A restored `authority/current` document's `roomRevision`/`nextSequence` must be internally consistent with
   the room's own restored `events/*` documents, or `submitRoomCommand`'s revision-conflict guard
   (`REVISION_CONFLICT`, A04) will behave unpredictably against the first command issued after restore. This has
   not been tested; treat any real restore as also requiring a fresh `npm run test:emulator` pass against a
   *copy* of the restored data before trusting it for live play.

## 8. Remaining rehearsal gap: physical devices

The production-facing GM, player, and table screens are wired to the real Firebase backend and have passed the
live staging smoke described in the deploy log. That run used three isolated Chrome browser contexts on one
machine, including a phone-sized player viewport; it proves backend integration and cross-context propagation,
but not real Wi-Fi/cellular behavior, mobile browser chrome, touch ergonomics, or sleep/wake behavior.

Before production promotion, run one complete session on at least two physical devices: one as GM and one as
player. A third display should exercise the table surface when available; otherwise the GM device may use a
second tab. Record device/browser versions and any failures alongside the deploy log. This physical-device check
is the only remaining rehearsal evidence gap, not a fixture-integration blocker.
