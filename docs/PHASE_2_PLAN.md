# Phase 2 implementation plan — realtime room

- **Status:** In progress. PRs 1–2 merged; PR 3 implemented and twice independently reviewed (see `docs/reviews/2026-09-14-phase-2-pr3-*.md`), awaiting merge; PR 4 onward not started. Originally written before implementation per `docs/ARCHITECTURE.md` section 17, step 4/5.
- **Scope authority:** `docs/IMPLEMENTATION_ROADMAP.md` Phase 2; `docs/ARCHITECTURE.md` section 17, steps 5–6.
- **Preceded by:** [`docs/reviews/2026-09-13-phase-2-preflight-review.md`](reviews/2026-09-13-phase-2-preflight-review.md) (contract re-evaluation; findings P1–P9).
- **Depends on:** [`docs/PHASE_2_DECISION_BRIEF.md`](PHASE_2_DECISION_BRIEF.md) for the three decisions John must make before PR 3 can start (region/projects, join policy, retention).
- **Date:** 2026-09-13.

## Roadmap exit criterion

> Three physical clients survive disconnect/reconnect.

Concretely: two players and one GM, on separate real devices against a Firebase emulator (then staging), join a room, resolve one opposed action with correctly isolated projections, and one of them can disconnect mid-flow and reconnect without duplicating an accepted command or losing state.

## What can start today, and what cannot

Two of the seven PRs below need none of the three decisions in `docs/PHASE_2_DECISION_BRIEF.md` and can start in the Emulator Suite immediately: **PR 1 (repository interface + emulator harness)** and **PR 2 (Firestore data model and rules)**. Both run entirely against local emulators with a placeholder project ID; nothing in either PR's design branches on region, join policy, or retention values. Everything from **PR 3 onward** either creates real Firebase projects (needs the region/project decision) or implements join/admission behavior (needs the join-policy decision), and must wait.

## PR sequence

Each PR is independently reviewable per `AGENTS.md`'s workflow expectations (own tests, own review, land before the next starts) and scoped to avoid pulling forward later-phase concerns, per the same file's scope discipline.

### PR 1 — Repository interface and emulator harness

- Extract an explicit `RoomRepository` interface (findings P1, P8 in the preflight review) that both `InMemoryRoomRepository` (retrofitted) and the future `FirebaseRoomRepository` implement: async command dispatch taking a caller-supplied `commandId`, projection subscription, and pending/accepted/rejected outbox states per `docs/ARCHITECTURE.md` section 6.
- Add `packages/testing` emulator helpers: spin up Firestore, Auth, and RTDB emulators (`firebase-tools`), a thin `@firebase/rules-unit-testing` wrapper, and CI wiring to start/stop them around the integration test run.
- No rules, no Functions, no real project yet. This PR proves the harness boots and a trivial read/write round-trips against the emulator.
- **Decisions needed:** none.

### PR 2 — Firestore data model and rules

- Implement the data model exactly as resolved in `docs/ARCHITECTURE.md` section 8 after this preflight's edits: `authority/current` (now carrying `roomStatus`/`gmMemberId`), `meta/current` mirror, `bindings/{memberId}`, the new `uidBindings/{uid}` reverse index (R1), `members`, `projections/{viewerId}`, `receipts/{receiptId}` (`${memberId}_${commandId}`, R6), `snapshots/{sequence}`, and the `events/{shared,gm,member-{memberId}}/items/{sequence}` partitions.
- Firestore security rules implementing the `uidBindings`-based membership/own-projection/gm/table checks from the R1 resolution. RTDB presence rules (`$uid === auth.uid`).
- Rule unit tests (allow/deny matrix) against the emulator from PR 1: every path × every role, per `docs/ARCHITECTURE.md` section 13's "explicit allow/deny test matrix for every path and role."
- No Functions yet — rules are tested by direct emulator reads/writes standing in for a trusted service identity where needed.
- **Decisions needed:** none.

### PR 3 — Anonymous auth, room admission, and GM claim

- Anonymous Firebase Authentication wiring.
- The join flow (`docs/ARCHITECTURE.md`, "Join and GM claim"): room-code resolution, capacity/admission-policy checks, per-IP/per-room throttling, seat creation transaction (writes `bindings`, `uidBindings`, `members`, initial recovery code).
- GM claim as a transactional, member-seat-bound operation.
- **Revision after the PR 3 independent review (2026-09-14):** the join flow is hosted as operable callables (`admitMember`, `claimSeat`) in the trusted Cloud Functions codebase `apps/functions` (ADR-001's layout) in *this* PR, not deferred to PR 4 — a throttle needs request metadata, and a boundary that only tests can call is not the join flow. The table seat is admitted by a separate table code (`admission/tableSecret`), a wrong secret denies reclaim, and every persisted read fails closed. PR 3 still does not deploy: the codebase is bundled by `npm run build` and proven against the Firestore emulator through the same handlers a deployed request reaches.
- New command/event types for this family (finding P6): `ClaimSeat`, `AdmitMember`, and their events, plus new stable error codes (finding P7): `ROOM_FULL`, `ADMISSION_CLOSED`.
- App Check added in **monitoring mode only** (not enforced) per `docs/ARCHITECTURE.md` section 11 — enforcement is a "before public preview" gate, not Phase 2.
- **Decisions needed:** room join policy (open code / code + passphrase / invites) — this PR's admission-policy check branches directly on it. Firebase region/project — this is the first PR that provisions anything real.

### PR 4 — Trusted command authority (the transactional Function)

- Lands in the same `apps/functions` codebase PR 3 established (which already hosts the admission callables), reusing its Admin-SDK transaction shape, stable-error → `HttpsError` mapping, and emulator harness.
- The Cloud Function that wraps `@digitable/engine`'s `runCommand`/`projectViewer` in one Firestore transaction: resolve `uidBindings` → capability (finding P4), read `authority/current` + binding + receipt, run platform authorization → template authorization → `decide` → `reduce`, then atomically write authority, receipt, ordered events, and every affected viewer projection (finding P3 confirms this is effectively "every live viewer" for the current template).
- One `crypto.randomBytes` seed per invocation, injected as `DecisionContext.random`, never persisted (already implemented in `packages/engine`'s deterministic generator — this PR only adds the seed-generation and transaction-retry wiring around it).
- Concurrent-invocation and retry tests: two simultaneous calls with one `commandId` produce one event and identical responses; a retried transaction reproduces the same dice faces without re-drawing.
- **Decisions needed:** none beyond PR 3's (this PR cannot land without PR 3's admission path to create the members it authorizes commands for).

### PR 5 — RTDB presence

- UID-keyed presence writes (`presence/{roomId}/{uid}/{connectionId}`), connect/disconnect wiring (`onDisconnect`), and the documented residual-disclosure acceptance (room-ID-level presence visible to any authenticated user who knows the room ID).
- **Decisions needed:** none.

### PR 6 — Recovery-code redemption

- The redemption flow: rate limiting/lockout, transactional seat rebind, code invalidation, old-UID presence deletion (with the R5 residual explicitly tested, not just documented), and the seat-only GM-visible audit event.
- New command/event types (finding P6): `RotateRecoveryCode`, `RecoverSeat`, `KickMember`, plus `RECOVERY_LOCKED`/`MEMBER_KICKED` error codes (finding P7).
- Tests proving the R3/R4 residuals are *bounded* as documented (a lost GM cannot recover; a stolen GM code transfers the campaign) rather than silently different in implementation.
- **Decisions needed:** retention/export/deletion values only affect a later archival step, not this PR's redemption logic — safe to build without waiting further, but the decision brief should be resolved by the time this PR opens.

### PR 7 — Client reconnect and outbox

- `FirebaseRoomRepository` implementing PR 1's `RoomRepository` interface: real command dispatch with client-minted, persisted `commandId`s (closing finding P1), reconnect-time projection refresh, event-tail replay for timeline/theatre only, and receipt reconciliation for pending outbox commands.
- Multi-device and failure-injection tests (see matrix below) run against the emulator with real network-like latency/disconnect simulation.
- **Decisions needed:** none beyond prior PRs'.

## Acceptance and failure-injection matrix

Combines the "required vertical-slice proofs" and testing categories from `docs/ARCHITECTURE.md` sections 11 and 13 with this plan's PR boundaries. "PR" marks where each proof first becomes testable, not where it must be re-proven forever (regression coverage carries forward).

| # | Proof / injected failure | Category | First testable in | Priority |
|---|---|---|---|---|
| 1 | Valid action resolves once and projects consistently to every live viewer | Integration | PR 4 | P0 |
| 2 | Duplicate command (same `commandId`, retried) does not reroll or duplicate effects | Integration | PR 4 | P0 |
| 3 | Two concurrent invocations with one `commandId` produce one event and identical responses | Integration/concurrency | PR 4 | P0 |
| 4 | Player cannot allocate another player's roll or exceed successes | Unit (engine, already covered) + Integration (rules) | PR 2 (rules), PR 4 (end to end) | P0 |
| 5 | Player cannot read GM or another player's projection/event partition | Security (rules allow/deny matrix) | PR 2 | P0 |
| 6 | Table capability cannot issue any game or safety command | Security | PR 2 (rules), PR 4 (Function) | P0 |
| 7 | Refresh does not resubmit an accepted outbox command | Resilience | PR 7 | P0 |
| 8 | Refresh does not re-fire theatre for an already-presented event ID | Resilience | PR 7 | P1 |
| 9 | Disconnect after submit, before response: client reconnects and observes the accepted (or still-pending) result without resubmitting | Resilience | PR 7 | P0 |
| 10 | Stale `expectedRevision` on a revision-gated command is rejected with `REVISION_CONFLICT`, not silently applied or discarded | Resilience/Security | PR 4 | P0 |
| 11 | Late join mid-encounter receives a correct current-state projection, not a replayed event tail | Integration | PR 4/PR 7 | P0 |
| 12 | No client-readable path or application log identifies a safety-interrupt actor | Security/Privacy | PR 4 (once safety commands exist; tracked separately, see below) | P1 |
| 13 | The GM cannot read another member's receipt | Security | PR 2 | P0 |
| 14 | A lost anonymous identity can recover its GM seat without moving private campaign data | Integration | PR 6 | P0 |
| 15 | Recovery redemption is rate-limited and locks out after repeated failures | Security/Resilience | PR 6 | P0 |
| 16 | Old UID's presence node re-creation after redemption is observed and bounded (R5) | Resilience (documented residual) | PR 6 | P2 |
| 17 | `authority/current` and every affected viewer projection stay within their documented byte budgets under a representative campaign fixture | Unit/Integration | PR 2 (schema), PR 4 (live) | P1 |
| 18 | A worst-case command's transaction write count (authority + receipt + events + projections) stays under Firestore's per-transaction write limit | Integration | PR 4 | P1 |
| 19 | Room admission respects capacity (8 participants + 1 table) and the chosen join policy | Integration | PR 3 | P0 |
| 20 | Kick immediately revokes the kicked member's read access (rules), not just UI-side removal | Security | PR 6 | P0 |
| 21 | App Check monitoring records traffic without blocking any legitimate client (enforcement is out of scope for Phase 2) | Observability | PR 3 | P2 |
| 22 | Three physical devices (2 players + 1 GM) complete one opposed action end to end against the emulator, then staging | E2E | PR 7 | P0 (roadmap exit criterion) |

Row 12 (safety interrupts) has no backing command/event yet anywhere in the template or contracts — `Pause`/`Fade`/`Veil`/`Skip` remain out of scope per `docs/IMPLEMENTATION_ROADMAP.md` Phase 3. It is listed here because the *transport* guarantee (no actor identity in any client-readable path or log) is a platform property Phase 2's event/receipt storage design must not preclude, even though the commands themselves land later. Verify this by construction in PR 4 (the transaction writer must support an `{ kind: "anonymous" }` actor today, which `packages/engine`'s `EventActor` type and `runCommand`'s `actor` override already allow) rather than by an end-to-end test that has no safety command to drive yet.

## Explicit exclusions (restated from `AGENTS.md` and `docs/IMPLEMENTATION_ROADMAP.md`)

- No maps, encounters, dossiers, broadcasts, private messages, lore, safety interrupts, or timeline UI — Phase 3.
- No Resolution Theatre/PixiJS rendering, no 3D dice — Phase 4.
- No App Check *enforcement* — "before public preview" gate.
- No second template.
- No production credentials or production project writes at any point in this plan; staging/production project creation itself requires the region/project decision and is scoped to PR 3 at the earliest, and even then only after John has approved specific project identifiers (see the decision brief).
