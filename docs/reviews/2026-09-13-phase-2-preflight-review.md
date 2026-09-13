# Phase 2 preflight: independent contract re-evaluation before persistence

- **Scope authority:** `docs/ARCHITECTURE.md` section 17, step 4 ("Independently review and adjust contracts before persistence").
- **Reviewed:** `main` at `26d370e` (Phase 1A–1C merged) — `packages/contracts`, `packages/engine`, `packages/testing`, `templates/eat-the-reich`, `apps/web/src/repository/InMemoryRoomRepository.ts`.
- **Against:** `docs/ARCHITECTURE.md`, `docs/DATA_AND_SYNC_MODEL.md`, every prior review/resolution in `docs/reviews/`.
- **Date:** 2026-09-13.
- **Verdict:** No blocking defect in the merged code. Six items from the architecture third-pass review (R1–R6) were still open against the canonical document and are now folded into `docs/ARCHITECTURE.md` by this same change. Nine new findings (P1–P9) surface from reading the actual Phase 1A–1C implementation with a persistence lens rather than the pseudocode the third-pass review checked; none blocks the emulator-only slice identified in `docs/PHASE_2_PLAN.md`, but four (P1, P2, P6, P8) must land before any Function writes to real Firestore.

## Disposition of the third-pass review (R1–R6)

The third-pass review (`docs/reviews/2026-09-12-architecture-review-third-pass.md`) approved PR #1 and recommended folding R1 in "before realtime work begins" and R2–R6 "whenever the doc is next touched." This is that touch.

| Finding | Status after this review |
|---|---|
| R1 — rules cannot establish room membership from a UID alone | **Folded into `docs/ARCHITECTURE.md` section 8**: `rooms/{roomId}/uidBindings/{uid}` reverse index, written transactionally alongside `bindings/{memberId}`. This is a documented design, not yet code — `packages/contracts` has no `uidBindings` type and no rule files exist yet (correctly, per scope discipline). Phase 2 PR 2 (data model + rules) must implement it exactly as now written, not reinterpret it. |
| R2 — room status read outside the transaction | **Folded into `docs/ARCHITECTURE.md` section 8**: `authority/current` now documented as also carrying `roomStatus`/`gmMemberId`, with `meta/current` as a denormalized mirror kept in sync in the same transaction. `AuthorityRecord<TState>` in `packages/contracts/src/authority.ts` does **not** yet have these fields — that is a Phase 2 contract change (PR 2), not a doc-only fix, and is sequenced explicitly in `docs/PHASE_2_PLAN.md`. |
| R3 — GM lockout residual | **Folded into `docs/ARCHITECTURE.md`**, stated as an accepted v1 residual with a named v2 option. |
| R4 — GM-code theft is a permanent takeover | **Folded into `docs/ARCHITECTURE.md`**, stated as an accepted residual with the existing rotation mitigation restated. |
| R5 — old UID can re-create presence after redemption | **Folded into `docs/ARCHITECTURE.md`**, stated as an accepted residual; token revocation deferred until observed to matter. |
| R6 — pick one `receiptId` scheme | **Folded into `docs/ARCHITECTURE.md`**: `${memberId}_${commandId}`, `commandId` validated as a UUID. Note (P2 below): the merged `InMemoryRoomRepository` uses a different, incompatible separator (`:`) for its own in-memory receipt map — harmless today (it never touches Firestore), but the Firebase repository must not copy that convention forward. |

## New findings (P1–P9)

Ranked by severity; "before persistence" means before any Function writes to a real (including emulated) Firestore instance.

### P1 (High, before persistence). Command IDs are minted server-side, not by the caller — idempotent retry is currently unreachable

`apps/web/src/repository/InMemoryRoomRepository.ts`'s private `dispatch()` calls `globalThis.crypto.randomUUID()` to mint `commandId` on every invocation, inside the repository, after the public method (`beginAction`, `submitOpposition`, `allocateResults`) has already been called. `runCommand`'s `priorReceipt` short-circuit (`packages/engine/src/runCommand.ts`) is real and correct, but nothing in the current call chain can ever reach it, because a retry of a public repository method mints a *new* `commandId` rather than resubmitting the same one.

This is already flagged as a known, deliberate gap in the Phase 1B review ("Preserve the existing engine-level idempotency guarantees when Phase 2 adds reconnect/outbox behavior; Phase 1B's public repository methods intentionally mint new command IDs") and in `CLAUDE_HANDOFF.md`. Restating it here because it is a **contract-shape** issue, not just a follow-up note: `docs/ARCHITECTURE.md` section 6 requires an "Outbox: unsent commands with UUID... and status," which means `commandId` must be minted at the point a player *commits* to an action (compose → confirm), stored client-side before the network call, and reused verbatim across retries and reconnects. None of the three current repository call sites do this, and the repository's public method signatures (`beginAction(threatId, actionId, gearIds)`, taking no `commandId` parameter) cannot express it.

**Required before persistence:** define the outbox/command-ID contract (who mints, when, where it is persisted client-side, how a retry looks it up) before writing `FirebaseRoomRepository`, and change the repository interface so `commandId` is a caller-supplied input, not an implementation detail. Sequenced as Phase 2 PR 7 in `docs/PHASE_2_PLAN.md`, but the *interface* decision should be made when the shared repository interface is extracted (PR 1), so PR 2–6 aren't built against a shape that has to change again for PR 7.

### P2 (Low, before persistence). Local receipt-key separator diverges from the now-decided `receiptId` scheme

`InMemoryRoomRepository`'s `receiptKey = \`${memberId}:${commandId}\`` uses `:`; R6's resolution (folded into `docs/ARCHITECTURE.md` above) fixes `${memberId}_${commandId}` for the real `receiptId`. Harmless in the in-memory repository (it is a local `Map` key, never persisted or parsed), but flag it so `FirebaseRoomRepository`'s receipt lookup is written against the architecture's scheme from the start rather than the in-memory repository's incidental one.

### P3 (Informational). Projection fan-out cost is confirmed, not just estimated

`templates/eat-the-reich/src/engine.ts`'s `project()` includes every character summary, every threat summary, and the room-wide `activeRoll` regardless of whether the viewer participated in the command that changed them. In this template, almost every accepted command changes almost every viewer's projection — there is no command whose effect is scoped narrowly enough to skip a projection write for an uninvolved viewer. This confirms, against real code rather than the pseudocode `docs/ARCHITECTURE.md` section 7 reasoned about, that the documented "worst case" (8 participants + GM + table × 64 KiB ≈ 640 KiB per command) is close to the *typical* case for this template, not a rare edge. Total writes per command stay low (authority + receipt + ≤2 event docs + ≤10 projections ≈ 14, far under Firestore's 500-writes-per-transaction limit), so this is not a blocker — it is a cost-model confirmation to carry into the "revisit triggers" in `docs/ARCHITECTURE.md` section 18 if a second template or larger rooms change the picture.

### P4 (Medium, before persistence). `SubmitOpposition`'s authorization checks capability, not seat identity — correct only because capability resolution is trusted

`authorizeGameAction`'s `SubmitOpposition` case (`templates/eat-the-reich/src/engine.ts`) allows any actor with `capability === "gm"`, with no check that the actor is *the* room's bound GM (there is exactly one GM seat; the template has no way to know that from `AuthorizedMemberContext` alone). This is correct today only because `AuthorizedMemberContext.capability` is asserted by the platform, not the client — and in the local repository, capability comes from a hardcoded `Map`. In Phase 2, `capability` must be resolved from `bindings`/`uidBindings` inside the trusted Function before `authorizeGameAction` ever runs (which is already the documented order — platform authorization precedes template authorization). This finding is a confirmation to make explicit in the Phase 2 Function design, not a defect: the template is correctly relying on a platform guarantee it cannot itself verify, so the Function's capability-resolution step is now on the list of things that need its own emulator test (see the acceptance matrix in `docs/PHASE_2_PLAN.md`), not just the rules layer.

### P5 (Low). `actorMemberId` is round-tripped through the command payload and re-checked, rather than never accepted from the client

`BeginAction`'s payload carries `actorMemberId`, and `authorizeGameAction` denies the command if `ctx.memberId !== command.actorMemberId` (`templates/eat-the-reich/src/engine.ts`). This is safe as written, but it means the payload — which becomes genuinely attacker-controlled for the first time once it crosses a real network boundary in Phase 2 — carries a field whose only correct value is already known from trusted context. Recommend Phase 2's command-schema pass (contracts PR) considers dropping self-referential actor fields from payloads that are always scoped to the caller, deriving them from `ctx.memberId` server-side instead. Not urgent — the existing check is sound — but it is a smaller attack surface to carry into a real trust boundary than to remove later.

### P6 (High, before persistence). No command/event vocabulary exists yet for admission, GM claim, kick, or recovery

`packages/contracts` and `templates/eat-the-reich` define only the three in-scope-for-Phase-1 commands (`BeginAction`, `SubmitOpposition`, `AllocateResults`). `docs/ARCHITECTURE.md`'s "Join and GM claim," "Safety interrupt," and recovery-code flows, and section 11's "Realtime milestone commands include kick, code rotation, and admission closure," have no corresponding types anywhere in code. This is expected — those are Phase 2 scope, not something Phase 1C should have pulled forward — but it means Phase 2's first contracts PR is larger than "add Firebase," it is also "design and land the room-lifecycle command/event family" (`ClaimSeat`, `AdmitMember`, `RotateRecoveryCode`, `RecoverSeat`, `KickMember`, `CloseAdmission`, and their events), each classified against `expectedRevision` per section 7's rule ("only scene transitions, encounter loads, GM-seat administration... require `expectedRevision`"). Sequenced explicitly in `docs/PHASE_2_PLAN.md`.

### P7 (Low). `STABLE_ERROR_CODES` has no realtime-specific codes yet

`packages/contracts/src/errors.ts`'s union (`AUTH_REQUIRED`, `ROLE_FORBIDDEN`, `REVISION_CONFLICT`, `ROLL_ALREADY_RESOLVED`, `TEMPLATE_VERSION_MISMATCH`, `ROOM_ARCHIVED`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `UNKNOWN_ACTION`, `INVALID_ALLOCATION`) has nothing for a full room, closed admission, a locked-out recovery endpoint, or a kicked member — `docs/ARCHITECTURE.md` section 6's list already omits these too, so this is a documentation gap inherited into code, not a code-only miss. Add `ROOM_FULL`, `ADMISSION_CLOSED`, `RECOVERY_LOCKED`, and `MEMBER_KICKED` (or similar) alongside the P6 command family, rather than overloading `RATE_LIMITED`/`ROLE_FORBIDDEN` for meanings they don't carry.

### P8 (High, before persistence). The repository interface is implicit, not a contract — and its current shape assumes synchronous, single-process dispatch

`InMemoryRoomRepository`'s public methods (`beginAction`, `submitOpposition`, `allocateResults`, `getPlayerProjection`, etc.) return synchronously and are called directly by React components (per Phase 1B/1C's design). `docs/DATA_AND_SYNC_MODEL.md` states "the local vertical slice implements the same repository interface in memory/local storage" — but that interface is only implicit in the one concrete class; nothing in `packages/contracts` defines it as a type both a `FirebaseRoomRepository` and a future in-memory/test repository must satisfy. A real Firebase-backed implementation is inherently asynchronous (network calls, listener-based projection updates) and must express command results as pending → accepted/rejected rather than a synchronous return, matching section 6's "Outbox" state layer. Building `FirebaseRoomRepository` against no explicit interface risks silently changing the shape UI code depends on (as P1 already requires for `commandId`), which would touch every screen a second time. Recommend extracting an explicit `RoomRepository` interface (naming: `packages/contracts` or a new `packages/repository-interface`) as the first concrete step of Phase 2 PR 1, incorporating the P1 outbox fix, before either implementation changes.

### P9 (Informational). Emulator-test seam does not exist yet, correctly

`packages/testing` (fixtures, `fakeTemplate`, `collectStrings`/`findLeakedSecrets`) has zero Firebase-emulator awareness, exactly as `AGENTS.md` specifies ("emulator helpers arrive with realtime work"). Confirmed no stray Firebase dependency anywhere: `grep -ril firebase . --include=*.json` (excluding `node_modules`) returns nothing, and `npm ls` reflects no such package. Phase 2 PR 1 is genuinely starting from zero on this axis, which is the expected, correct state to start realtime work from.

## Verification performed

- Read every file listed under "Reviewed" above in full, not excerpted.
- Traced the command path end to end: `authorizeGameAction` → `decide` → `reduce` → `runCommand` → `projectViewer`, across both the engine harness and the one template that exercises it.
- Confirmed no Firebase/React-in-packages/Three.js dependency exists anywhere in the repository (`grep -ril firebase . --include=*.json`, excluding `node_modules`, returns nothing; `apps/web` is the only workspace with a UI framework dependency, per its intentionally scoped ESLint exemption).
- Confirmed Node 22.23.2 in this environment satisfies the root `package.json` `engines.node: ">=22.12"` constraint that Phase 2's Firebase tooling will run under.

## What this review did not re-litigate

- Findings F1–F14, L1–L10 (first-pass review) and N1–N12 (second-pass review): already verified closed by the third-pass review against the canonical document, and nothing in the merged Phase 1A–1C code reopens them.
- Accessibility, presentation, and template-content scope: out of this review's focus per the assigned task (contracts before persistence).
