# Operations runbook: setup, resume, recovery, backup, restore

Board task A07. Scope: the network/persistence slice Sonnet A owns (`apps/functions`, `packages/contracts`,
`packages/engine`, the Firestore/RTDB data model). This is an **operational runbook for a real deploy**, not a
description of anything this session has executed — no deploy has been run under this task; every `firebase` command
below is written for John (or whoever holds deploy authority) to run deliberately, one at a time, reading the
output before proceeding. Nothing here creates a new Firebase project, a production project, or any paid resource.

## 0. What "done" means here, and what it doesn't

This runbook covers **setup, resume/recovery, and backup/restore** for the room-persistence layer that A01–A06
built and independently reviewed: `createRoom`, `admitMember`, `claimSeat`, `submitRoomCommand`, `recoverSeat`.

It does **not** cover, because these do not exist yet:

- **Client-side outbox/reconnect** (deferred in A06; no automatic retry-on-reconnect exists — a dropped connection
  today means the player re-invokes the same callable by hand, or the app does, once that UI exists).
- **RTDB presence** (Phase 2 PR 5, `docs/PHASE_2_PR5_PLAN.md` — plan-only, not implemented).
- **App Check enforcement** — currently monitoring-only (`enforceAppCheck: false` on every callable,
  `docs/ARCHITECTURE.md` section 11); a request without a valid token is logged, never blocked.
- **Automated backup/retention/deletion** — `docs/ARCHITECTURE.md` section 8's retention table is explicitly
  "proposed... do not automate deletion until product approves values." Nothing in this repository automates it.
- **A real deployed staging candidate.** As of this task, `sonnet-a/a01`–`a06` (PRs #13/#15/#18/#23/#27/#30) are
  independently reviewed but **unmerged** — merge authority is John's. Nothing has been deployed to
  `powerglove-1cd23` under any of this work. Section 3 below prepares the exact commands for when John chooses to.

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

## 3. Preparing a versioned staging candidate (commands to run, not run here)

None of the following has been executed under this task. This is the exact sequence John would run once he has
decided to merge the A01–A06 branches (this repository's merge authority) and wants a staging deploy:

```
# 1. From a checkout of `main` after merging #13, #15, #18, #23, #27, #30 (in that dependency order):
npm ci
npm run check          # full gate: format, lint, typecheck, 325/325 unit tests
npm run build           # functions bundle + web build
PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator   # 106/106 across all three suites

# 2. Deploy rules first (Firestore + RTDB), separately from functions, so a rules regression
#    is caught and rollback-able independently of function code:
npx firebase deploy --only firestore:rules,database --project powerglove-1cd23

# 3. Deploy functions:
npx firebase deploy --only functions --project powerglove-1cd23

# 4. Record the deployed commit SHA and the Firebase CLI's own release/version output
#    (printed at the end of the functions deploy) in this file's "Deploy log" section below —
#    that pairing is the "versioned staging candidate."
```

Do not deploy `hosting` (no `apps/web` production build pipeline or CDN target is configured in `firebase.json`
today — `apps/web` is exercised locally/in CI, not served from Firebase Hosting yet). Do not pass `--force`.

### Deploy log

*(Empty. No deploy has occurred under board tasks A01–A07. Fill in commit SHA, timestamp, and operator name at
the first real staging deploy, and keep every subsequent entry — do not overwrite this section.)*

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

This is the real, reviewed flow — not a fixture. As of this task, the only client exercising it end-to-end is
`apps/web/test-emulator/session.test.ts` (A05); the production `apps/web` UI screens (Sonnet C's C01–C05) still
run against a `TEMPORARY` fixture engine, not this real backend (see section 8 below — this is the honest gap
this runbook cannot paper over).

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
  A05) picks up the live state with no new admission call needed. **There is currently no outbox** — any command
  the player was mid-composing when the connection dropped is lost client-side; only commands the server already
  accepted (and thus wrote a receipt/event for) survive. This is a real, acknowledged gap (A06's deferred scope),
  not something this runbook can work around operationally.
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

## 8. The one gap this runbook cannot close: `apps/web` still runs on fixtures

As of this task, the production-facing screens in `apps/web` (Sonnet C's C01–C05) are wired to a `TEMPORARY`
fixture engine (`FixtureSessionGateway.ts`, `fixturePlayLoop.ts`, `fixturePlayLoopStore.ts`, `etrTemp.ts` per
C05's own status comment on issue #14), not to the real `FirebaseSessionClient`/`FirebaseRoomRepository` this
runbook's setup/resume/recovery flow describes. A `sonnet-c/c06-integration` branch exists locally
(unpushed as of this task) that appears to be exactly this integration work in progress.

**Consequence for A07's own acceptance criteria**: genuine three-device rehearsal evidence — real players, on
real devices, driving the real screens through the real backend — is not honestly producible yet, because the
screens a rehearsal would exercise are not yet wired to the backend this runbook documents. Per A07's own
instruction to "explicitly mark physical-device checks pending if only browser contexts available," this is
marked **pending**, more strongly than that: not just the physical-device half, but the whole rehearsal, is
blocked on the fixture-to-real-backend integration landing first. Fabricating rehearsal evidence against the
fixture engine would test nothing this runbook is actually about, so none is included here.

**What is real and independently reviewed**: every flow this runbook describes (create/join/claim/act/recover)
has been exercised end-to-end through the real Firebase Functions and Firestore emulators (section 4), not
mocked or faked, by `apps/web/test-emulator/session.test.ts` and every `apps/functions/test-emulator/*.test.ts`
file, and each slice's independent review is recorded under `docs/reviews/`. What is not yet real is the
*production UI's* wiring to that backend — a distinct, substantial, cross-cutting task that touches Sonnet C's
screens as much as Sonnet A's backend, already apparently claimed and in progress elsewhere as of this task.
