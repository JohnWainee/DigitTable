# Phase 2 PR 4 implementation plan — trusted command authority (the transactional Function)

- **Status:** Planning only. **Blocked on PR 3.** No Cloud Functions, Firebase Admin/Functions
  packages, or runtime authority code are introduced by this document or by this branch.
- **Scope authority:** `docs/PHASE_2_PLAN.md` PR 4; `docs/ARCHITECTURE.md` ADR-002 and sections
  7–13; `AGENTS.md`'s engineering invariants and scope discipline.
- **Depends on:** PR 3 (`worktree-phase2-pr3-admission`, not merged) for `uidBindings`,
  `bindings`, `members`, and the room-lifecycle command family. This plan documents PR 3's
  **current, unreviewed draft shapes** so PR 4 is not designed against a guess, and flags every
  place a PR 3 review could still change them (see "Assumptions this plan makes about PR 3").
- **Date:** 2026-09-13.
- **Author:** Claude, in the isolated worktree `worktree-phase2-pr4-design`, per John's instruction
  to prepare an implementation-ready PR 4 plan without writing runtime authority code ahead of
  PR 3 landing.

## Why this is a planning-only document

`docs/PHASE_2_PLAN.md` PR 4 says: "this PR cannot land without PR 3's admission path to create
the members it authorizes commands for." As of this writing, PR 3 (`worktree-phase2-pr3-admission`
at `42df5b5`) is implemented but **not independently reviewed and not merged to `main`**. Writing
the actual transactional Function now would mean:

- Depending on `uidBindings`/`bindings`/`members` document shapes that could still change under
  PR 3's own review (the way PR 2's review changed `firestore.rules` after its author judged it
  done).
- Adding `firebase-admin`/`firebase-functions` to a workspace before `AGENTS.md`'s boundary
  ("No Firebase project, SDK wiring, emulator, or production credentials before the realtime
  milestone" — satisfied for emulator use since PR 1/2, but Functions-package wiring is new
  surface this PR would be first to add) is reviewed as part of PR 3 or PR 4 itself, not smuggled
  in as a side effect of planning.
- Violating `AGENTS.md`'s scope discipline: "Implement only what the current phase... calls for.
  Do not pull forward later-phase concerns."

This document is therefore the detailed design PR 4's implementer follows **after PR 3 merges**,
plus the acceptance matrix a reviewer checks the implementation against. It contains no source
changes outside `docs/` and `CLAUDE_HANDOFF.md`.

## Assumptions this plan makes about PR 3

Everything below is read from `worktree-phase2-pr3-admission` at `42df5b5` (draft, unreviewed).
Where PR 3's review changes any of these, this plan's affected section must be revised before PR 4
implementation starts — treat each as a named dependency, not a fact.

| Assumed from PR 3 draft | File | What PR 4 depends on |
|---|---|---|
| `UidBindingDocument { memberId, capability }` at `uidBindings/{uid}` | `packages/contracts/src/room.ts` | PR 4's capability-resolution step (§1 below) reads this shape verbatim. |
| `MemberBindingDocument { memberId, uid, capability }` at `bindings/{memberId}` | `packages/contracts/src/room.ts` | Cross-checking a binding's `uid` back against the authenticated caller (defense in depth, §1). |
| `RoomMemberDocument { memberId, capability, displayName, joinedAtServer, lastSeenAtServer }` at `members/{memberId}` | `packages/contracts/src/room.ts` | Not read by PR 4's transaction (not in its documented read set); PR 4 does not update `lastSeenAtServer` — confirm this stays true or add it to the transaction's write set. |
| `CommandReceiptDocument { receiptId, memberId, commandId, status, acceptedSequence, roomRevision }` at `receipts/{memberId}_{commandId}` | `packages/contracts/src/room.ts` | PR 4 is the **first writer** of this document; the shape must gain a `sharedEventIds`/result-echo field or PR 4 must accept that a retry cannot rebuild `sharedEvents` from the receipt alone (see §2 and the P2/S3 note below). |
| `receiptIdFor(memberId, commandId)` producing `${memberId}_${commandId}` | `packages/contracts/src/room.ts` | PR 4's receipt path construction reuses this function; must not re-implement the concatenation inline (S6 follow-through — one contract-typed source of truth for rules-sensitive field names). |
| `AdmissionCommand`, `AdmitMemberInput`, `ClaimSeatInput`, `AdmissionAccepted` | `packages/contracts/src/admission.ts` | Confirms admission commands are **platform-owned and never enter a game template** ("these never enter a game template") — PR 4's Function must route `AdmitMember`/`ClaimSeat` (and PR 6's `RotateRecoveryCode`/`RecoverSeat`/`KickMember`) through a *different* code path than game commands, not through `runCommand`/`authorizeGameAction`. This plan's §0 makes that split explicit. |
| Firebase Anonymous Auth verified enabled on staging project `powerglove-1cd23` (Functions/Firestore `us-west1`, RTDB `us-central1`) | `CLAUDE_HANDOFF.md` (PR 3 worktree) | PR 4's Function deploys to the same project/region; no new region decision needed. |
| `firestore.rules` denies all client writes to every document PR 4 writes (`authority`, `receipts`, `events/*`, `projections/*`) | `firestore.rules` (merged, PR 2) | PR 4's Function must use the Admin SDK (which bypasses rules) precisely because rules cannot express game-rule invariants (ADR-002) — this is confirmed unchanged by PR 3's draft. |
| S3 (PR 2 review): `receipts/{receiptId}` denies a read when the document does not yet exist (`resource == null` on a pending receipt) | `docs/reviews/2026-09-14-phase-2-pr2-independent-review.md` | Out of PR 4's scope to fix (assigned to PR 7), but PR 4's receipt-write transaction must not assume a client can already be listening on the receipt path before the transaction commits — the commit is what makes the document (and its readability) exist. |

If PR 3's review changes the `receipts` document shape (likely, given the missing result-echo
field above), re-run this plan's §2 and §7 before implementing.

## §0 — Two Functions, not one: platform-owned vs. template-owned commands

`docs/PHASE_2_PLAN.md` PR 4's mandate is specifically "the Cloud Function that wraps
`@digitable/engine`'s `runCommand`/`projectViewer`" — i.e., **game commands** for the currently
merged template surface (`BeginAction`, `SubmitOpposition`, `AllocateResults`). PR 3's
`AdmitMember`/`ClaimSeat` and PR 6's `RotateRecoveryCode`/`RecoverSeat`/`KickMember` are explicitly
"platform-owned room lifecycle commands; these never enter a game template" per PR 3's own
`admission.ts` doc comment.

PR 4 must not fold admission/recovery handling into the same callable as game-command dispatch,
because:

- Admission has no `AuthorizedMemberContext` yet — that context is *created* by admission, not
  consumed by it. `authorizePlatform` (`packages/engine/src/platformAuthorization.ts`) requires a
  `PlatformMember | null` that only exists after a seat is bound.
- Admission commands have no `expectedRevision`/receipt-idempotency shape defined by the current
  contracts (`admission.ts` has no `commandId` field at all yet — PR 3's review must resolve
  whether admission needs its own idempotency key, since "join" is not naturally retry-idempotent
  the way a game action is).
- `docs/ARCHITECTURE.md` section 7: "Platform code first checks room membership, seat capability,
  room status, payload bounds, and command-family guards" — this presupposes membership already
  exists, which is circular for the command that creates membership.

**PR 4's callable is `submitRoomCommand`** (exact name TBD at implementation, matches this plan's
examples), scoped to the template command family only. It takes an already-bound member as a
precondition (`request.auth.uid` must resolve through `uidBindings` to a `capability` other than
"the seat doesn't exist yet"). Admission (`AdmitMember`, `ClaimSeat`) is PR 3's own callable(s);
this plan does not design them and does not change PR 3's scope.

## §1 — UID binding to trusted capability resolution

Every invocation of `submitRoomCommand` starts by resolving the caller's Firebase Auth UID to a
platform capability, entirely inside the transaction, before any template code runs:

```ts
// Pseudocode — not implemented in this PR. Illustrates the read/branch shape only.
async function resolveCapability(
  tx: Transaction,
  roomId: RoomId,
  uid: string,
): Promise<PlatformMember | null> {
  const uidBindingRef = db.doc(`rooms/${roomId}/uidBindings/${uid}`);
  const uidBindingSnap = await tx.get(uidBindingRef);
  if (!uidBindingSnap.exists) {
    return null; // AUTH_REQUIRED, or more precisely "not a member of this room"
  }
  const { memberId, capability } = uidBindingSnap.data() as UidBindingDocument;
  return { memberId, capability };
}
```

Requirements this step must satisfy (each maps to a named architecture/review finding):

1. **Single source of truth.** `uidBindings/{uid}` is the *only* document this step reads to
   resolve capability — never trust a `memberId`/`capability` claim in the request payload itself.
   `docs/ARCHITECTURE.md` section 8: "Rules use one `get()` of `uidBindings/$(request.auth.uid)`
   for every membership-shaped check" — the Function must apply the identical rule to itself, not
   just rely on rules (rules do not run for Admin-SDK-privileged Function code).
2. **Resolved before `authorizeGameAction`.** Preflight finding P4: *"`SubmitOpposition`'s
   authorization checks capability, not seat identity — correct only because capability resolution
   is trusted... In Phase 2, `capability` must be resolved from `bindings`/`uidBindings` inside the
   trusted Function before `authorizeGameAction` ever runs (which is already the documented
   order)."* This is the finding this whole step exists to close. A dedicated test asserts the
   resolution step runs and denies *before* any template function is invoked (§9, proof P4-a).
3. **No client-asserted identity anywhere in the call chain.** The callable's request carries only
   `{ commandId, payload, expectedRevision? }` (matching `RoomCommandRequest<TCommand>` from
   `packages/contracts/src/repository.ts`) plus the room ID from the callable's context/path — never
   a `memberId` or `capability` field. `AuthorizedMemberContext` is constructed *only* from the
   `uidBindings` read, never from the request body. (This closes finding P5's forward-looking
   concern about `actorMemberId`-shaped payload fields becoming attacker-controlled once the
   Function is a real network boundary — the *platform* identity used for authorization must never
   come from the payload; the template's own `BeginAction.actorMemberId` field can remain
   round-tripped and re-checked as P5 describes, since that check is against the *resolved*
   `ctx.memberId`, not a second source of truth.)
4. **`AUTH_REQUIRED` vs. `ROLE_FORBIDDEN` distinction preserved.** No `request.auth` at all →
   `AUTH_REQUIRED` (caller isn't signed in). A signed-in UID with no `uidBindings` document →
   also `AUTH_REQUIRED` per `authorizePlatform`'s existing `member === null` branch (not a member
   of *this* room is indistinguishable from "not authenticated" at the platform-authorization
   layer today — confirm this remains correct for Phase 2's threat model; do not invent a new code
   without adding it to `STABLE_ERROR_CODES` first, per §8).
5. **Defense in depth against a stale/dangling `uidBindings` entry.** If PR 6's kick/recovery flow
   deletes or rewrites `uidBindings/{uid}` transactionally (as `docs/ARCHITECTURE.md`'s "Redemption"
   flow requires), a command already in flight when that transaction commits must see the *new*
   state, not a stale read — this is automatic because Firestore transactions serialize against
   the live document, not a cache, but the test matrix (§9) must prove it with a concurrent
   kick-vs-command scenario, not just assume it.

## §2 — Receipt and idempotency

The transaction's receipt handling is the direct implementation of `runCommand`'s
`priorReceipt` parameter (`packages/engine/src/runCommand.ts`) plus the persistence PR 1/2 stopped
short of (in-memory only).

```ts
// Pseudocode — illustrates read/write order and branch structure only.
async function submitRoomCommand(tx, roomId, member, request, occurredAtServer, randomSeed) {
  const receiptRef = db.doc(`rooms/${roomId}/receipts/${receiptIdFor(member.memberId, request.commandId)}`);
  const receiptSnap = await tx.get(receiptRef); // read #2, after uidBindings read #1
  const authorityRef = db.doc(`rooms/${roomId}/authority/current`);
  const authoritySnap = await tx.get(authorityRef); // read #3

  const authority = parseAuthority(authoritySnap.data());

  let priorReceipt: AcceptedCommandReceipt | undefined;
  if (receiptSnap.exists) {
    const stored = receiptSnap.data() as CommandReceiptDocument;
    if (stored.status === "rejected") {
      // A prior rejection is not replayed through runCommand at all: return the stored
      // rejection directly without touching authority/events/projections again.
      return rejectedResultFrom(stored);
    }
    priorReceipt = {
      commandId: stored.commandId,
      roomRevision: stored.roomRevision,
      acceptedSequences: stored.acceptedSequence !== null ? [stored.acceptedSequence] : [],
    };
  }

  const random = createSeededRandom(randomSeed); // §3
  const result = runCommand(template, {
    member,
    authority,
    random,
    command: request.payload,
    commandId: request.commandId,
    occurredAtServer,
    priorReceipt,
  });

  // ... branch on result.ok, write authority/receipt/events/projections (§4)
}
```

Requirements:

1. **Receipt read happens inside the same transaction as the authority read**, per
   `docs/ARCHITECTURE.md` section 8: "Every accepted-command transaction reads `authority/current`,
   the actor's `bindings/{memberId}`, and the actor-private receipt if present." (The binding read
   is folded into §1's `uidBindings` read for capability; whether a *separate* `bindings/{memberId}`
   read is still required depends on whether the Function needs the member's `uid` for anything
   beyond what `uidBindings` already gives it — currently it does not, so this plan treats the
   `uidBindings` read as satisfying both the rules' membership check and the transaction's binding
   read. Flag this as a documentation clarification for `docs/ARCHITECTURE.md` section 8 if PR 3's
   review disagrees.)
2. **Rejected-but-idempotent replay.** `runCommand` only short-circuits *accepted* prior receipts
   (`priorReceipt` is typed as `AcceptedCommandReceipt`, never a rejection). A retried command
   whose first attempt was rejected must return the *same rejection* without re-running
   `authorizeGameAction`/`decide` a second time with possibly different inputs (state may have
   changed between the two attempts, and re-deciding a "rejected" retry against new state could
   accept it — silently changing the outcome of a request the caller already gave up on and may
   have shown an error for). This is a **new requirement this plan adds beyond what
   `runCommand` currently implements** — `runCommand` has no concept of a stored rejection at all.
   Two implementation options, to be decided during PR 4 implementation (not by this plan):
   - (a) Store rejections too (`CommandReceiptDocument.status === "rejected"` already exists in
     PR 3's draft shape, so this is "use the field that's already there"), and short-circuit in the
     Function layer before calling `runCommand` at all (as sketched above).
   - (b) Never store a receipt for a rejected command, accepting that a retried command re-runs
     authorization/decision from scratch against current state (simpler, but means a client retry
     of a rejected command can get a *different* rejection reason, or even succeed, if state moved
     — e.g., retrying an `AllocateResults` that was rejected because the roll was already resolved
     will be rejected identically every time since that's a state fact, but a `PAYLOAD_TOO_LARGE`
     rejection retried with the same oversized payload is also stable; the risky case is a
     rejection whose cause is *time-dependent*, which no current template command has).
   **Recommendation for the implementer:** (a), because it makes retry behavior uniform
   (accepted and rejected both replay verbatim) and closes a real "what does the client's outbox do
   with a retried-and-now-differently-rejected command" UX ambiguity before PR 7 has to design
   around it. This requires `CommandReceiptDocument` to carry enough of the `StableError` to
   reconstruct `RoomCommandRejected` (`code`, `message`) — confirm this field exists in
   `packages/contracts/src/room.ts` before implementation; if it does not, add it as part of PR 4's
   contract changes (not PR 3's, since PR 3's `AdmissionAccepted`/receipt usage doesn't need it).
3. **Concurrent-invocation idempotency (the acceptance matrix's #3, P0).** Two simultaneous
   invocations with the same `commandId` are **not** prevented from both starting — Firestore
   transactions don't provide a lock a Function can check before entering. Instead:
   - Both transactions read the same `receiptSnap` (initially not-exists) and both proceed to
     `runCommand` with `priorReceipt: undefined`, drawing from **independently generated** seeds
     (§3 — the seed is generated once per invocation, before the transaction, so two invocations
     of the same logical retry have two different seeds if the caller is genuinely double-submitting
     rather than retrying a cached commandId — but the point of receipt-checking is that only one
     commits).
   - Both attempt to write the receipt document with the *same* `receiptRef` path
     (`${memberId}_${commandId}` is deterministic, not random) as part of their transaction commit.
   - Firestore's optimistic-concurrency transaction semantics mean only one of the two transactions
     commits; the other's `runTransaction` call throws (a contention/abort error) and the SDK
     automatically retries it — **against the now-committed state**, where `receiptSnap.exists` is
     `true`. The retried loser therefore takes the `priorReceipt` short-circuit branch and returns
     the winner's stored result. This is exactly ADR-002's documented behavior: *"Concurrent
     invocations with the same command ID may generate different seeds, but only the transaction
     winner commits; each loser observes and returns the winner's stored result without exposing
     its seed or candidate values."*
   - **This is why the seed must be generated fresh on every transaction attempt, including the
     automatic retry the Admin SDK performs on contention** — not reused across attempts of the
     *same* invocation. (Reuse only applies across *distinct* invocations sharing a `commandId`,
     i.e. a client-level retry after a network failure, not a single invocation's internal
     transaction-contention retry. See §3 for the precise boundary.)
4. **Idempotent retry does not re-fan-out events to `sharedEvents` in the response** — matching the
   already-recorded PR 1 nuance: *"`AcceptedCommandReceipt` stores only accepted sequence numbers,
   not event payloads, so a retry's `sharedEvents` comes back empty rather than duplicating the
   original."* PR 4 either accepts this limitation for its own response shape (a retried command's
   HTTPS response has `sharedEvents: []`) or extends `CommandReceiptDocument` to store enough to
   reconstruct them (needed for §2 requirement 2's rejection-message case regardless, so the same
   schema change likely serves both). **Decide once, not twice** — if the implementer adds a
   result-echo field for rejections, extend it to accepted `sharedEvents` too rather than solving
   the two cases differently.

## §3 — Fixed, retry-stable seed generation

`docs/ARCHITECTURE.md`, ADR-002: *"Each Function invocation generates one seed with
`crypto.randomBytes` before entering the transaction and constructs a deterministic generator from
it inside `DecisionContext`... Firestore retries reuse the seed and therefore repeat the same
internal draws."* `packages/engine/src/randomness.ts`'s `createSeededRandom` already implements the
deterministic-generator half; PR 4 adds only the seed-generation and retry-wiring around it
(exactly as `docs/PHASE_2_PLAN.md` PR 4 scopes it: *"already implemented in `packages/engine`'s
deterministic generator — this PR only adds the seed-generation and transaction-retry wiring
around it"*).

The precise rule, since ADR-002's prose has two retry concepts that must not be conflated:

- **Transaction-internal retry** (Firestore's own optimistic-concurrency retry when a transaction
  callback is re-invoked because a read document changed underneath it, or on contention with
  another writer touching the same documents): the seed must be generated **once, outside
  `runTransaction`'s callback**, and the *same* seed value passed into every re-invocation of the
  callback within that one `submitRoomCommand` call. Firestore's Admin SDK re-runs the *callback*
  function on retry, so if seed generation is placed inside the callback, each internal retry would
  mint a new seed and violate reproducibility the moment any transaction needed even one internal
  retry (which is expected under load, not exceptional).

  ```ts
  // Correct: seed generated once, callback closes over it.
  const randomSeed = crypto.randomBytes(32); // one seed per HTTPS invocation
  await db.runTransaction(async (tx) => {
    const random = createSeededRandom(randomSeed); // same seed on every internal retry
    // ... reads, runCommand(..., random), writes
  });
  ```

  ```ts
  // Wrong: a new seed on every internal retry breaks reproducibility.
  await db.runTransaction(async (tx) => {
    const randomSeed = crypto.randomBytes(32); // regenerated per retry — do not do this
    const random = createSeededRandom(randomSeed);
    // ...
  });
  ```

- **Client-level retry** (the same logical command re-submitted by the client after a timeout or
  disconnect, arriving as a brand-new HTTPS invocation of `submitRoomCommand` with the same
  `commandId`): this is a **different invocation**, generates its **own fresh seed**, and *never
  reaches `decide`/draws randomness at all* if the first invocation's transaction already committed
  a receipt — it takes the `priorReceipt` short-circuit (§2) before `random` is ever constructed
  from the new seed. The fresh seed is therefore generated but unused in that case — acceptable
  (a wasted `crypto.randomBytes` call, not a correctness issue) and simpler than special-casing seed
  generation around whether a receipt might exist, which would require the same `uidBindings`/receipt
  reads §1–§2 already do, before knowing whether to bother generating a seed at all.

- **The seed is never persisted anywhere** — not in the receipt, not in the event envelope, not in
  a log. ADR-002: *"emitted events capture only the committed faces, never the seed."* Structured
  logs (§10) may record that a seed was generated and its byte length, never its value.

- **`crypto.randomBytes(32)`** (or equivalent Node `crypto` API available in the Functions runtime)
  is the production seed source; `createSeededRandom` accepts `string | Uint8Array`, so the raw
  bytes can be passed directly without a string conversion. Tests inject a fixed
  `Uint8Array`/string seed per `docs/ARCHITECTURE.md`'s "Tests inject a fixed seed," bypassing
  `crypto.randomBytes` entirely — this requires the transaction body to accept an injected
  `RandomSource` (or seed) as a parameter for testability, not call `crypto.randomBytes` inline
  where a test can't intercept it. Structure the implementation so the HTTPS handler generates the
  seed and passes it into a separately unit-testable transaction function, mirroring
  `runCommand`'s own separation of "pure decision logic" from "harness."

## §4 — Platform authorization before template authorization

This is already an implemented, tested invariant at the pure-function level
(`packages/engine/src/platformAuthorization.ts`'s `authorizePlatform`, called before
`runCommand`'s internal `authorizeGameAction` call). PR 4's job is wiring this into the Function's
call order correctly, not re-deciding the order:

```ts
// Pseudocode — order of operations inside the transaction, after §1/§2's reads.
const platformResult = authorizePlatform(
  member,              // §1's resolved PlatformMember | null
  { status: authority.roomStatus, templateId: authority.templateId, templateVersion: authority.templateVersion },
  { templateId: request.templateId, templateVersion: request.templateVersion, payload: request.payload },
);
if (!platformResult.allowed) {
  // Write a rejected receipt (§2) and return — never call runCommand at all.
  return rejectedResultFrom(platformResult);
}
const result = runCommand(template, { member: member!, authority, random, ... }); // runs authorizeGameAction internally
```

Requirements:

1. **`authorizePlatform` runs against the transaction's own reads**, not against a separately
   cached room-status value — this is precisely R2's fix (`authority/current` carries `roomStatus`
   directly so the transaction's own read reflects a concurrent archive/GM-transfer). Do not read
   `meta/current` for this check; `meta/current` is documented as "a denormalized, cheaply-readable
   mirror... for clients that only need to display room status," not an authorization input.
2. **A template cannot weaken platform authorization** (`AGENTS.md` engineering invariant, restated
   from `docs/ARCHITECTURE.md` section 7). Concretely: `runCommand` must never be called for a
   command that `authorizePlatform` already rejected — there is no "call both and take the more
   permissive result" path. The pseudocode above's early return enforces this by construction; the
   test matrix (§9, proof P6) asserts a `table`-capability actor's game command is rejected by
   `authorizePlatform` alone, without needing template code to also reject it (this generalizes the
   existing `attemptCommandAsTable` regression test from `apps/web`'s in-memory repository into an
   emulator-level proof against the real transaction).
3. **`authorizePlatform`'s payload-size check runs against the wire payload**, i.e., the actual
   JSON the client sent over HTTPS, before any parsing/validation that might reshape it — order:
   size check via `authorizePlatform` (part of platform authorization) happens before
   `template.schemas.parseCommand` is even called, so an oversized malformed payload is rejected on
   size grounds without spending effort parsing it. Confirm the implementation's callable-handler
   wiring preserves this order — it is easy to accidentally parse-then-authorize since JSON parsing
   of the request body is unavoidable at the callable boundary (the callable framework does this for
   you), but *schema validation into `TCommand`* is a separate step that should happen after
   `authorizePlatform`, not before.
4. **Command-family guard**: `authorizePlatform` denies `table`-capability actors from all game
   commands (`GAME_COMMAND_CAPABILITIES = ["player", "gm"]`). Admission/recovery commands are
   already routed to a separate callable (§0) so this guard never needs to special-case them.

## §5 — Atomic authority/event/projection/receipt writes

Everything below happens inside the **one** Firestore transaction that started with §1's
`uidBindings` read. `docs/ARCHITECTURE.md` section 8: *"It writes the updated authority document,
receipt, emitted event documents, and affected complete viewer projections."*

```ts
// Pseudocode — write side, after runCommand returns result.ok === true.
tx.set(authorityRef, result.authority); // full replace, includes bumped roomRevision/nextSequence

tx.set(receiptRef, {
  receiptId: receiptIdFor(member.memberId, request.commandId),
  memberId: member.memberId,
  commandId: request.commandId,
  status: "accepted",
  acceptedSequence: result.receipt.acceptedSequences[0] ?? null, // see note below
  roomRevision: result.receipt.roomRevision,
} satisfies CommandReceiptDocument);

for (const { destination, envelope } of result.envelopes) {
  const partitionRef = eventPartitionRef(roomId, destination, envelope.sequence); // §6 path rules
  tx.set(partitionRef, envelope);
}

for (const viewer of everyLiveViewerAffectedBy(result.envelopes, authority)) {
  const projection = projectViewer(template, result.authority, viewer);
  tx.set(projectionRef(roomId, viewer.viewerId), projection);
}
```

Requirements:

1. **One transaction, one commit.** All of authority, receipt, every event document, and every
   projection document are `tx.set()` calls against the *same* `Transaction` object before the
   transaction function returns — Firestore commits them atomically or not at all. This is the
   direct implementation of ADR-002's "one Firestore transaction" and section 12's "Atomically
   update event, actor-private receipt, revision, and projections in Firestore."
2. **`acceptedSequence` is singular in `CommandReceiptDocument` but `runCommand` can emit multiple
   sequences** (`AcceptedCommandReceipt.acceptedSequences` is `readonly number[]` — "one revision
   may contain several consecutive sequences," per ADR-003). This is a **contract mismatch to
   resolve during PR 4 implementation**: either (a) confirm every currently-defined template
   command emits exactly one logical event today (true for `BeginAction`/`SubmitOpposition`/
   `AllocateResults` — each emits exactly one `DecidedEvent`, per `templates/eat-the-reich/src/
  engine.ts`) and document that `CommandReceiptDocument.acceptedSequence` is deliberately singular
   because of that, revisiting if a future command emits more than one, or (b) widen
   `CommandReceiptDocument` to `acceptedSequences: readonly number[]` now, matching the engine's
   already-general shape, to avoid a breaking receipt-schema change later. **Recommendation:**
   (b) — it costs nothing now and avoids a schema migration once a command that emits two events
   (e.g., a future "resolve and also apply a status effect" command) exists.
3. **"Every affected viewer projection" is every live viewer for the current template**, per
   preflight finding P3: *"almost every accepted command changes almost every viewer's projection
   — there is no command whose effect is scoped narrowly enough to skip a projection write for an
   uninvolved viewer."* PR 4 must not attempt a narrower "which viewers actually changed" optimization
   for the current template — `everyLiveViewerAffectedBy` in the pseudocode above resolves, in
   practice, to "every member with a binding, plus `gm`, plus `table` if a table seat is claimed."
   This is deliberate scope discipline (do not build a diffing optimization the current template
   gives no benefit from) but must be revisited per `docs/ARCHITECTURE.md` section 18 if a second
   template's commands are more narrowly scoped.
4. **Projection writes use `projectViewer` unchanged** (`packages/engine/src/projectViewer.ts`) —
   PR 4 does not reimplement projection assembly; it calls the existing pure function once per
   viewer against `result.authority` (the *post-command* state), inside the transaction, and writes
   each result. No projection write happens against pre-command state.
5. **Event partition writes use the destination-to-path mapping from `docs/ARCHITECTURE.md` section
   8** (`events/shared/items/{sequence}`, `events/gm/items/{sequence}`,
   `events/member-{memberId}/items/{sequence}`), driven by `EventDestination`'s existing
   `destinationKey` helper (`packages/contracts/src/event.ts`) for the *logical* key, but the
   physical Firestore path uses the literal `shared`/`gm`/`member-{memberId}` segments already
   encoded in `firestore.rules` (`events/{partition}/items/{sequence}` with
   `partition == "member-" + binding(roomId).data.memberId`) — do not invent a different path
   scheme; reuse the rules' literal string convention exactly, since a mismatch here means client
   reads (already reviewed and merged) silently return empty results instead of erroring.
6. **`meta/current` mirror write.** `docs/ARCHITECTURE.md` section 8: "the transaction that changes
   `roomStatus`/`gmMemberId` writes both documents atomically." The current template's three
   commands (`BeginAction`, `SubmitOpposition`, `AllocateResults`) never change `roomStatus`/
   `gmMemberId`, so **PR 4's transaction does not need to write `meta/current` for any
   currently-defined game command** — confirm this stays true; if a future command changes either
   field, add the mirrored write in the same transaction at that time, not preemptively.
7. **No write outside the documented read set's derived documents.** The transaction must not, for
   example, update `members/{memberId}.lastSeenAtServer` as a side effect of dispatching a command
   — presence/activity tracking is RTDB's job (PR 5), not this transaction's, and adding it would
   silently grow the transaction's write count (relevant to §11's write-limit budget) for a purpose
   outside PR 4's scope.

## §6 — Expected revision

`packages/contracts/src/repository.ts`'s `RoomCommandRequest.expectedRevision` and
`docs/ARCHITECTURE.md` section 7: "Only scene transitions, encounter loads, GM-seat administration,
and other explicitly enumerated room-wide transitions require `expectedRevision`." **None of the
three currently-defined template commands are revision-gated** — `BeginAction`, `SubmitOpposition`,
and `AllocateResults` all rely on entity preconditions (a roll's own status) enforced inside
`decide`, not on `expectedRevision`. PR 4 must still implement the check generically, because PR 3's
GM-seat-administration commands and PR 6's kick/recovery commands (both platform-owned, per §0,
so actually outside *this* Function) and any future template command that *is* revision-gated
depend on it existing correctly:

```ts
// Pseudocode — runs after the authority read (so authority.roomRevision is current),
// before authorizeGameAction/decide.
if (request.expectedRevision !== undefined && request.expectedRevision !== authority.roomRevision) {
  return rejectedResultFrom(stableError("REVISION_CONFLICT", "..."));
}
```

Requirements:

1. **Checked inside the transaction, against the transaction's own `authority` read** — not against
   a value the client fetched earlier and passed back stale. This is what makes the check
   meaningful under concurrency: two commands racing for the same revision-gated slot, both reading
   `roomRevision = N`, both expecting `N`; only one's transaction commits and bumps to `N+1`; Firestore's
   retry of the loser re-reads `roomRevision = N+1`, and *this* check (not just the receipt check)
   correctly rejects it with `REVISION_CONFLICT` if the retried attempt is a genuinely different
   command that happens to share no `commandId` with the winner. (If it shares a `commandId`, §2's
   receipt short-circuit handles it first and this check is never reached — receipt check must run
   before the revision check, matching the order in this plan's §2/§4 pseudocode.)
2. **`REVISION_CONFLICT` is rejected, not retried automatically.** Unlike a Firestore-internal
   transaction-contention retry (§3), a revision mismatch is a *logical* rejection the client's
   outbox must handle explicitly (re-fetch the current projection, decide whether to resubmit with
   a fresh `expectedRevision`, or surface a conflict to the user) — the Function must not loop
   trying newer revisions itself.
3. **Acceptance-matrix proof #10** (`docs/PHASE_2_PLAN.md`): "Stale `expectedRevision` on a
   revision-gated command is rejected with `REVISION_CONFLICT`, not silently applied or discarded."
   Since no current template command is revision-gated, this proof needs a **test-only
   revision-gated command** (a minimal fixture command added to `packages/testing` or a test
   double template, not to `templates/eat-the-reich`) to exercise the check at the emulator level
   without inventing real game content ahead of need. Document this test-support addition
   explicitly in the PR so a reviewer doesn't mistake it for real template scope creep.

## §7 — Privacy partitions

Already-decided architecture, restated here as PR 4's write-time obligations (not new design):

1. **Physical partitioning is the security boundary, not a visibility label.**
   `docs/ARCHITECTURE.md` section 7: "Events are stored physically under their authorized
   visibility path; a visibility string alone is not security." PR 4's transaction writes each
   `EventEffect`'s `destination` to its own document path (§5.5) — it never writes one event
   document with an embedded "visible to: [...]" field that a rule would have to interpret.
2. **Redaction happens in `decide`/`project`, not in the Function.** The Function trusts that
   `DecidedEvent.effects` already contains the correctly-redacted payload per destination (this is
   `templates/eat-the-reich/src/engine.ts`'s job, already implemented and tested for the hidden
   `hiddenDifficultyModifier`/intel fields per N12). PR 4 does not add a second redaction pass — if
   the Function needed to filter fields itself, that would mean the template/engine boundary had
   already failed, which is a template bug, not something PR 4 should compensate for.
3. **`explainPool` and `validAllocations` are never called from the Function.** They operate on a
   viewer's own already-materialized projection (client-side or in a read path), not during command
   processing — restating this only to be explicit that PR 4's transaction scope is
   `authorizeGameAction → decide → reduce → project` (via `runCommand`/`projectViewer`), not the
   full `GameTemplate` surface.
4. **GM's own projection legitimately contains hidden fields; `table`'s must not.** PR 4's
   §5.3 "every live viewer" loop calls `projectViewer` once per viewer *with that viewer's own
   `ViewerContext.capability`* — the redaction is a function of *which viewer* `project` is called
   for, already proven correct by `templates/eat-the-reich/test/multiRoleProjectionIsolation.property.test.ts`.
   PR 4 must not accidentally call `project` once and reuse the result across viewers (a real risk
   if the loop is refactored for "efficiency" — each viewer's projection is a distinct, separately
   computed document).
5. **Receipts are actor-private by construction.** `receipts/{memberId}_{commandId}` is written once,
   scoped to the acting member; PR 4 never writes a receipt under another member's ID, and — per
   the acceptance matrix's proof #13 — "The GM cannot read another member's receipt" is a rules
   property (already implemented, PR 2) that PR 4 must not undermine by, say, also copying receipt
   data into a GM-readable path for convenience.

## §8 — Anonymous actor behavior

`docs/ARCHITECTURE.md`'s "Safety interrupt" flow and `EventActor`'s `{ kind: "anonymous" }` variant
have no backing command yet (Phase 3, per `docs/PHASE_2_PLAN.md` row 12's explicit note: *"Row 12
(safety interrupts) has no backing command/event yet anywhere in the template or contracts...
Verify this by construction in PR 4... rather than by an end-to-end test that has no safety command
to drive yet"*). PR 4's obligation is narrower than implementing safety commands — it is to prove
the transaction writer **supports** an anonymous actor today, so nothing in PR 4's design has to
change when Phase 3 adds the first safety command.

1. **`runCommand`'s `actor` parameter already accepts `{ kind: "anonymous" }`**
   (`RunCommandInput.actor?: EventActor`, defaulting to `{ kind: "member", memberId: ... }`).
   PR 4's transaction wiring must pass this parameter through from the command-family classification
   step, not hardcode `{ kind: "member", memberId: member.memberId }` as the only possibility.
   Concretely: `submitRoomCommand`'s internal dispatch to `runCommand` should determine the actor
   kind from a per-command-type classification (a lookup table or a field on the command
   registration, not a Function-wide constant), even though every *currently defined* command
   resolves to `{ kind: "member", ... }` today.
2. **A test-only fixture command proves this**, since no real safety command exists yet: add one
   minimal command to a test double template (as §6.3 already needs one for revision-gating) whose
   `decide` result is delivered with `actor: { kind: "anonymous" }`, and assert the written event
   envelope's `actor` field is `{ kind: "anonymous" }` with no `memberId` anywhere in the document —
   this is acceptance-matrix proof #12's transport half ("the transaction writer must support an
   `{ kind: "anonymous" }` actor today... rather than by an end-to-end test that has no safety
   command to drive yet").
3. **The receipt for an anonymous-actor command is still written under the *acting* member's private
   partition**, per `docs/ARCHITECTURE.md`'s "Safety interrupt": "stores any receipt only in the
   submitting member's private partition" — anonymizing the *event's* actor does not anonymize the
   *receipt's* `memberId` field (the receipt is never client-readable by anyone but that member,
   per §7.5, so this is not a disclosure — it is what makes the submitting member's own outbox able
   to reconcile their own submission).
4. **No log line may include a member ID for an anonymous-actor command.** This is a structured-logging
   obligation, not a data-model one — see §10.

## §9 — Emulator concurrency/failure tests

Every row below is a required test in `packages/testing/test-emulator/`, run against the Firestore
emulator with a deployed (or emulator-loaded) version of the PR 4 Function — or, where the Functions
emulator adds more complexity than the property being tested needs, an equivalent direct-transaction
test that exercises the same transaction logic without the HTTPS callable wrapper (document which
approach is used per test; both are legitimate, but the acceptance matrix's concurrency proofs (#2,
#3) need the *transaction*, not the callable wrapper, since that's where the atomicity guarantee
actually lives).

| # | Test | What it proves | Matrix row |
|---|---|---|---|
| 1 | Single valid `BeginAction` from a bound player | Authority, receipt, `shared`/`member` event docs, and every live viewer's projection all commit in one transaction; response echoes `roomRevision`/`sharedEvents` | #1 |
| 2 | Same `commandId` submitted twice, sequentially (first completes before second starts) | Second call takes the `priorReceipt` short-circuit: no new event document, `roomRevision` unchanged, no second random draw (assert via a spy/counting `RandomSource` in the test-only transaction entry point) | #2 |
| 3 | Same `commandId` submitted twice, concurrently (both transactions start before either commits) | Exactly one event document exists at the expected sequence after both calls resolve; both calls' responses are identical (`roomRevision`, `sharedEvents`); the loser's response is the winner's stored result, not a second decision | #3 |
| 4 | `table`-capability actor attempts `BeginAction` | Rejected by `authorizePlatform` with `ROLE_FORBIDDEN`; no receipt, no event, no projection write of any kind (assert via absence, not just the response code) | #6 |
| 5 | Player attempts `AllocateResults` against another player's roll | `decide`'s entity-ownership check (using `DecisionContext.actor`) rejects it; template authorization proof, run through the real transaction rather than only the pure-function unit test | #4 |
| 6 | Revision-gated test-fixture command with a stale `expectedRevision` | Rejected with `REVISION_CONFLICT`; authority unchanged; no receipt marked accepted (a rejected receipt may still be written per §2's recommendation, but `roomRevision` on `authority/current` must not move) | #10 |
| 7 | Late-joining viewer requests a projection mid-encounter (no event tail replay) | `getProjection`/direct read returns a projection built via `projectViewer` against current `authority/current`, not reconstructed by replaying `events/*` | #11 (partial — full proof needs PR 7's client, but the *server-side* half — "the Function never requires an event replay to answer a projection read" — is PR 4's to prove) |
| 8 | Capability-resolution-before-authorization ordering (P4) | A `uidBindings` document engineered to be absent/wrong is caught by §1's resolution step; instrument (test-only) to assert `authorizeGameAction` is never invoked when resolution fails, not just that the end response is a rejection | new (this plan's own proof, closing finding P4 concretely) |
| 9 | Anonymous-actor fixture command (§8.2) | Written event envelope has `actor: { kind: "anonymous" }`; no member ID appears anywhere in that event document; receipt still carries the real submitting `memberId` | #12 (transport half) |
| 10 | Concurrent kick vs. in-flight command (requires a stand-in for PR 6's kick, since PR 6 hasn't landed — implement as a direct `uidBindings` deletion in the test, not a real kick command) | A command whose `uidBindings` read happens before a concurrent deletion still resolves capability correctly for *that* transaction attempt (already-committed reads are consistent); a command that starts *after* the deletion commits is rejected with `AUTH_REQUIRED`, proving no stale-capability window | new (§1.5's defense-in-depth claim, made concrete) |
| 11 | Worst-case write-count fixture (8 participants + GM + table, one command) | Total transaction write count (authority + receipt + event docs + 10 projections) stays under Firestore's 500-writes-per-transaction limit, matching preflight P3's "≈14, far under" estimate — assert the actual count, not just eyeball it | #18 |
| 12 | Worst-case projection-size fixture, same scenario | Every written projection document stays under 64 KiB (`checkProjectionBudget`); authority stays under its 256 KiB working budget (`checkAuthorityBudget`) — run against the *persisted* documents this transaction actually wrote, not just the in-memory fixture already covered by existing unit tests | #17 |
| 13 | Rejected-command retry (if §2.2's option (a) is chosen) | Retrying a `commandId` whose first attempt was rejected returns the identical rejection without re-running `decide` | new (§2.2's own proof) |

Failure-injection specifics the harness must simulate (per `docs/ARCHITECTURE.md` section 13's
"Resilience: disconnect after submit, duplicate submit, stale revision, late join" and
`docs/PHASE_2_PLAN.md`'s matrix):

- **Transaction abort/retry**: force a Firestore transaction-contention retry (e.g., two test
  clients racing a write to the same `authority/current` document) and assert the seed-reuse
  property from §3 — the accepted event's dice faces must be identical regardless of which attempt
  ultimately commits, provable by fixing the seed in the test harness and asserting the *committed*
  event's face values match what that fixed seed deterministically produces.
- **Simulated disconnect after submit, before response**: not fully provable in PR 4 alone (that's
  PR 7's client-side reconnect), but PR 4's *server-side* half is test #2/#3 above — the transaction
  commits exactly once regardless of whether the original caller ever saw the response.

## §10 — Structured logging and error handling

`docs/ARCHITECTURE.md` section 15: *"Structured server logs: command ID, hashed room ID, event
type, latency, result code—never narrative/private payloads. Safety commands omit UID/member
identity."* Concretely for PR 4:

1. **Log fields, every invocation:** `commandId`, a hash of `roomId` (never the raw room ID, since
   room IDs are shareable locators, not secrets, but hashing avoids casually correlating log entries
   across a support/ops surface with a room a user could screenshot-share), the command's `type`
   (e.g. `"BeginAction"`), latency in milliseconds, and the result code (`"accepted"` or the
   `StableErrorCode`). Never log `payload`, `state`, or any event's `payload` field.
2. **Never log the random seed** (§3) or any intermediate dice draw — only the final committed
   faces already present in the (non-logged) event payload; if a debug log of "what did the engine
   decide" is ever added, it must redact the same fields the template's own redaction already
   removes for non-GM viewers, defaulting to logging nothing from `Decision.events` at all rather
   than re-deriving a safe subset.
3. **Anonymous-actor commands never log `memberId`**, per §8.4 — the structured log for such a
   command uses a non-correlatable command reference (the `commandId` itself, which is a random
   UUID unconnected to any identity) instead of `memberId`.
4. **Client-visible errors are exactly `StableError { code, message }`** — the callable's thrown
   error must map to `functions.https.HttpsError` with the stable `code` as the error's `details`
   or a matching `code` mapping (exact wire shape TBD at implementation, but never a raw JS
   `Error`/stack trace reaching the client, per `docs/ARCHITECTURE.md` section 6: "Never expose
   stack traces or hidden payload details"). An *unexpected* internal exception (a bug, not a
   modeled rejection) must still map to a generic `internal` HTTPS error with no message detail,
   logged server-side with full detail for debugging — the two failure classes (modeled rejection
   vs. unexpected exception) must not be conflated in the client-facing response.
5. **New stable error codes needed by PR 4 itself:** none beyond what's already defined
   (`AUTH_REQUIRED`, `ROLE_FORBIDDEN`, `REVISION_CONFLICT`, `PAYLOAD_TOO_LARGE`, plus whatever the
   current template's commands already use). `ROOM_FULL`/`ADMISSION_CLOSED`/`RECOVERY_LOCKED`/
   `MEMBER_KICKED` (finding P7) belong to PR 3/PR 6's admission/recovery callables (§0), not to
   this one — do not add them to `STABLE_ERROR_CODES` as part of PR 4 unless PR 4 itself needs one
   the template/platform layer doesn't already define.

## §11 — Firestore transaction limits

Concrete numbers to test against (§9 tests #11/#12), not just cite:

- **500 writes per transaction** (Firestore hard limit). Preflight P3's estimate: "authority +
  receipt + ≤2 event docs + ≤10 projections ≈ 14" for the current template at 8 participants + GM +
  table. PR 4 must assert this count directly in a test, not rely on the estimate remaining true as
  the template evolves — add the assertion so a future template change that pushes the count up
  fails a test rather than silently approaching the limit unnoticed.
- **1 MiB per document** (`FIRESTORE_DOCUMENT_CEILING_BYTES`), **256 KiB working budget for
  `authority/current`** (`AUTHORITY_WORKING_BUDGET_BYTES`), **64 KiB per projection**
  (`PROJECTION_CEILING_BYTES`) — all already defined in `packages/contracts/src/size.ts` and
  already checked by `checkAuthorityBudget`/`checkProjectionBudget`. PR 4's obligation is to *call*
  these checks against what the transaction is about to write and fail closed (reject the command
  with a to-be-defined error, or — preferably — treat exceeding the working budget as a
  server-side invariant violation logged loudly, since a template that can exceed its own declared
  budget under normal play is a template bug PR 4 should surface, not silently accept) rather than
  writing an oversized document and letting Firestore's hard ceiling reject the whole transaction
  opaquely.
- **10 MiB max transaction size** (total request size across all documents in a transaction,
  separate from the per-document 1 MiB ceiling) — worth a one-line acceptance check in test #11/#12
  (sum of all written document sizes), since it is a distinct limit from both the per-document
  ceiling and the write-count limit and nothing in the current contracts checks it explicitly.
- **Transaction duration**: Firestore transactions that run long (repeatedly retried under heavy
  contention) eventually fail rather than retrying forever. Nothing in the current design changes
  this; note it here so the implementer doesn't need to rediscover it, and so the concurrency tests
  (§9 #3) include an assertion that contention resolves within a bounded number of retries under
  realistic test load (two concurrent callers), not an open-ended retry loop.

## §12 — Schemas and error handling (wire-boundary validation)

1. **`request.payload` is parsed via `template.schemas.parseCommand` after `authorizePlatform`'s
   size check (§4.3) and before `authorizeGameAction`/`decide`.** A parse failure (malformed shape,
   not just oversized) is a rejection with a stable code — `UNKNOWN_ACTION` already exists in
   `STABLE_ERROR_CODES` for "this doesn't look like a command this template recognizes"; confirm
   whether a *malformed but recognizable* command (right `type`, wrong field shapes) should map to
   `UNKNOWN_ACTION` too or needs a distinct code — recommend reusing `UNKNOWN_ACTION` for both
   rather than adding a new code for a distinction the client can't act on differently anyway.
2. **`request.commandId` is validated as a UUID before use**, per `docs/ARCHITECTURE.md` section 8:
   "with `commandId` validated as a UUID before use; no hashing is required." This validation must
   happen before it's used to construct the receipt document path (§2) — an invalid `commandId`
   must be rejected outright, not sanitized/coerced, since the receipt path is derived from it
   verbatim via `receiptIdFor`.
3. **`request.roomId`/route parameter is validated against the resolved member's actual room**
   — i.e., the `uidBindings` document read in §1 is read from `rooms/{roomId}/uidBindings/{uid}`
   using the *request's* `roomId`, which means a caller cannot reference a different room's
   `uidBindings` by supplying a mismatched room ID; there is no separate "does this uid belong to
   this room" check beyond the read itself succeeding, which is correct (the read failing to find a
   document *is* the check), but confirm the callable's routing (HTTPS callable path/data shape) is
   structured so `roomId` cannot be supplied inconsistently with a URL-embedded value if the
   callable framework's routing includes one.
4. **Every response shape matches `RoomCommandResult<TEvent>`** (`packages/contracts/src/
  repository.ts`) exactly — this is the contract `FirebaseRoomRepository` (PR 7) will parse against,
   so PR 4 must not invent an ad hoc response envelope. `RoomCommandAccepted<TEvent>` /
   `RoomCommandRejected` are the only two accepted shapes; `"pending"` is never a value the Function
   returns (per that type's own documentation: "never returned as `'pending'`; that state is the
   outstanding `dispatch` promise itself").

## §13 — Dependencies expected to be added, and what stays excluded

**To be added when PR 4 is actually implemented (after PR 3 merges):**

- `apps/functions` (new workspace, per `docs/ARCHITECTURE.md` ADR-001's `apps/functions/` —
  "trusted commands/admin operations"), with `firebase-admin` and `firebase-functions` as
  dependencies scoped to that workspace only.
- ESLint's Firebase import guard (`eslint.config.js`'s `no-restricted-imports` patterns, already
  scoped to allow `packages/testing/src/emulator.ts` and `packages/testing/test-emulator/**`) needs
  a matching carve-out added for `apps/functions/**` at implementation time — do not add it in this
  planning branch, since that would be introducing the dependency surface itself.
- `packages/testing`'s emulator harness (`createEmulatorTestEnvironment`) likely needs a Functions
  emulator wiring addition (`firebase.json`'s `emulators.functions` block, currently absent) —
  confirm at implementation time whether `firebase-tools`' `emulators:exec` needs the Functions
  emulator enabled for the transaction-level tests (§9), or whether testing the transaction logic
  directly (importing the transaction function and running it against `initializeTestEnvironment`'s
  Firestore emulator, bypassing the HTTPS callable layer entirely) is sufficient and simpler — this
  plan's §9 already flags this as a per-test decision.
- Likely a small `crypto`-only import in `apps/functions` for `randomBytes` (Node built-in, not a
  new package dependency).

**Explicitly excluded from PR 4, per this plan and `AGENTS.md`:**

- No admission/GM-claim/recovery/kick command handling (§0) — those are PR 3/PR 6's callables.
- No RTDB presence wiring (PR 5).
- No client-side `FirebaseRoomRepository`, outbox persistence, or reconnect logic (PR 7) — PR 4
  produces the server side those depend on, nothing client-facing.
- No real Firebase project creation or credential changes — PR 3's already-verified staging project
  (`powerglove-1cd23`) and regions (Functions/Firestore `us-west1`, RTDB `us-central1`) are reused,
  not re-decided.
- No App Check enforcement (monitoring-only per PR 3's scope, unrelated to PR 4).
- No safety-interrupt commands (Phase 3) — only the transport-level support proven by §8's
  test-only fixture.
- No second template, no maps/encounters/dossiers/broadcasts (Phase 3+).

## Acceptance matrix (review-ready)

This restates and sharpens `docs/PHASE_2_PLAN.md`'s PR-4-relevant rows (#1, #2, #3, #4, #6, #10,
#11, #12 (transport half), #17, #18) plus this plan's own additions, as a single checklist a
reviewer runs the implementation against. "Section" cross-references this document.

| # | Proof | Section | Verification |
|---|---|---|---|
| A1 | UID resolves to capability via `uidBindings` only; no client-asserted identity accepted | §1 | Test #8 (§9) |
| A2 | Capability resolved and checked before any template function runs | §1.2 | Test #8 (§9), instrumented call-order assertion |
| A3 | Platform authorization runs and can reject before template authorization ever runs | §4 | Test #4 (§9) |
| A4 | A template cannot weaken platform authorization (no combined/permissive path exists) | §4.2 | Code inspection + test #4 |
| A5 | Valid command commits authority + receipt + events + all live projections atomically | §5.1 | Test #1 (§9) |
| A6 | Sequential duplicate `commandId` short-circuits via stored receipt; no re-decision, no re-draw | §2, §3 | Test #2 (§9) |
| A7 | Concurrent duplicate `commandId` produces exactly one event and identical responses | §2.3 | Test #3 (§9) |
| A8 | Seed generated once per invocation outside the transaction callback; reused across internal Firestore retries; never persisted or logged | §3 | Test #3 + log inspection |
| A9 | Stale `expectedRevision` rejected with `REVISION_CONFLICT`; authority unchanged | §6 | Test #6 (§9) |
| A10 | Table-capability actor cannot issue any game command | §4.4 | Test #4 (§9) |
| A11 | Player cannot allocate/act on another player's entity-scoped state | §7.3 (via `decide`) | Test #5 (§9) |
| A12 | Every viewer's projection contains only that viewer's authorized content, freshly computed per viewer | §7.4 | Test #12 (§9) + existing property tests |
| A13 | GM cannot read another member's receipt (rules-level; PR 4 must not add a bypass) | §7.5 | Rules test (PR 2, unaffected) + code inspection |
| A14 | Anonymous-actor commands write no member ID into any event document; receipt still records the true submitter privately | §8 | Test #9 (§9) |
| A15 | No log line contains a payload, a random seed, or (for anonymous-actor commands) a member ID | §10 | Log inspection in test harness |
| A16 | Client-facing errors are exactly `StableError`; unexpected exceptions never leak stack traces | §10.4 | Test #4/#6 response-shape assertions + a forced-internal-error test |
| A17 | Worst-case command's transaction write count stays under Firestore's 500-write limit | §11 | Test #11 (§9) |
| A18 | Worst-case projection/authority sizes stay under documented budgets | §11 | Test #12 (§9) |
| A19 | Late join receives a projection via `projectViewer` against current authority, never an event-tail replay | §5.4, §7.3 | Test #7 (§9) |
| A20 | Rejected-command retry returns the identical rejection without re-deciding (if §2.2 option (a) chosen) | §2.2 | Test #13 (§9) |
| A21 | A concurrent kick-style `uidBindings` deletion is observed correctly by in-flight vs. newly-started commands | §1.5 | Test #10 (§9) |
| A22 | Response shape matches `RoomCommandResult<TEvent>` exactly, including the never-`"pending"` invariant | §12.4 | Test #1/#2/#3 response assertions |

A reviewer should treat A1–A22 as the PR's Definition of Done alongside the existing repo-wide gate
(`npm run check`, `npm run build`, `npm run test:emulator`, `git diff --check`), per `AGENTS.md`'s
workflow expectations.

## Open questions for the PR 4 implementer to resolve (not this plan's to decide)

1. §2.2: store rejections in `CommandReceiptDocument` and short-circuit them (recommended), or
   accept re-deciding retried rejections from scratch?
2. §5.2: widen `CommandReceiptDocument.acceptedSequence` to `acceptedSequences: readonly number[]`
   now (recommended) or keep it singular until a command needs otherwise?
3. §9: run the concurrency/transaction tests against a deployed Functions emulator callable, or
   against the transaction function directly (bypassing the HTTPS layer)? Either is acceptable;
   pick one and be consistent, and document the choice in the PR the way PR 1 documented its
   emulator-harness scope choices.
4. §1.1: does `docs/ARCHITECTURE.md` section 8's "actor's `bindings/{memberId}`" read remain a
   *separate* required read once `uidBindings` already supplies `memberId`/`capability`, or should
   the doc be corrected to say the `uidBindings` read satisfies both purposes? Resolve with a small
   documentation clarification alongside PR 4, not silently.

## Required checks for this planning branch

- `npm run format` — clean (no source changes; documentation-only diff).
- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npx vitest run` — unchanged pass count (no source files touched).
- `npm run build` — clean.
- `git diff --check` — clean.
- No `firebase-admin`, `firebase-functions`, or other new runtime dependency was added anywhere in
  this repository by this branch. No `apps/functions` workspace was created. No existing runtime
  contract (`packages/contracts`, `packages/engine`, `templates/eat-the-reich`, `apps/web`) was
  modified. Only `docs/PHASE_2_PR4_PLAN.md` (new) and `CLAUDE_HANDOFF.md` (status update) changed.
