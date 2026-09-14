# Phase 2 PR 2 independent review request: Firestore data model and security rules

- **Branch:** `claude/phase-2-pr-2-firestore-159rmr`
- **Base:** `main` at `2b66088` (Phase 1A–1C, the Phase 2 preflight, and Phase 2 PR 1 merged).
- **Scope authority:** `docs/PHASE_2_PLAN.md`, PR 2 ("Firestore data model and rules").
- **Date requested:** 2026-09-14.
- **Status:** Awaiting an independent second pass. This document is the request, not the review — per `AGENTS.md`'s workflow expectations, a non-trivial change is not complete until reviewed by a pass independent of the one that wrote it. Record the outcome as a new `docs/reviews/YYYY-MM-DD-phase-2-pr2-implementation-review.md` (or similar) alongside this file, following the pattern of `docs/reviews/2026-09-13-phase-2-pr1-independent-review.md`.

## What changed

1. `packages/contracts/src/room.ts` (new): TypeScript contract shapes for every Firestore document in `docs/ARCHITECTURE.md` section 8's room data model — `RoomMetaDocument`, `MemberDocument`, `BindingDocument`, `UidBindingDocument`, `ReceiptDocument`/`receiptDocumentId`, `SnapshotDocument`, `RoomCodeDocument`, and `memberEventPartitionId`. `AuthorityRecord<TState>` (`packages/contracts/src/authority.ts`) gained `roomStatus: RoomStatus` and `gmMemberId: MemberId`, closing preflight review finding R2. Every existing `AuthorityRecord` construction site was updated to supply both fields; no engine/template/UI runtime behavior changed.
2. `firestore.rules` (replacing PR 1's default-deny placeholder): the `uidBindings`-based authorization model from third-pass architecture review finding R1 — one `get()` per request establishes membership, own-projection/receipt/event-partition ownership, and GM/table capability. Every write is denied unconditionally (no Function exists yet). Reads are gated per path as documented in the new rules file's own comments.
3. `database.rules.json` (replacing PR 1's default-deny placeholder): `presence/{roomId}` readable by any authenticated user; `presence/{roomId}/{uid}` writable only by that UID; everything else denied.
4. `packages/testing/test-emulator/`: `roomRulesFixtures.ts` (shared fixture data/seeding), `firestoreRoomRules.security.test.ts` (34 tests), `rtdbPresenceRules.security.test.ts` (7 tests) — an allow/deny matrix covering every collection/path in the data model and the roles that can reach it (player, GM, table, a signed-in non-member, unauthenticated).
5. `packages/contracts/test/room.test.ts` (new): unit tests for `receiptDocumentId`/`memberEventPartitionId`.

## What this PR deliberately does not do

Per `docs/PHASE_2_PLAN.md`'s PR 2 boundary and this task's constraints:

- No Cloud Functions. No path in either rule set is client-writable for game/room data — every write in the emulator test matrix is asserted to fail, including for the GM and for the document's own subject (e.g. a member cannot write their own `bindings` or `uidBindings` document).
- No anonymous auth/admission, GM claim, recovery-code redemption, client reconnect/outbox, or UI wiring. `apps/web`, `packages/engine`, and `templates/eat-the-reich`'s pure functions are unchanged except the additive, source-compatible `AuthorityRecord` fields.
- No real Firebase project, credentials, or deployment. Everything runs against the `demo-digitable` emulator project from Phase 2 PR 1.

## Specific things worth an independent, adversarial look

1. **The `uidBindings` `get()` pattern itself.** Every rule function (`isMember`, `uidBinding`, `hasCapability`, `isOwnMemberId` in `firestore.rules`) calls `get(/databases/$(database)/documents/rooms/$(roomId)/uidBindings/$(request.auth.uid))`. Confirm this resolves correctly for every path depth tested (`rooms/{roomId}/events/{partitionId}/items/{sequence}` is five segments deep) and that Firestore's `get()` document-read quota per rule evaluation (10 per request as of the current Firestore rules engine) isn't exceeded by any single client request in the tested paths — each rule here only ever calls `get()` once per evaluation via helper functions, but confirm the emulator doesn't memoize differently from production in a way that would hide a quota issue.
2. **The event-partition rule's string comparison.** `events/{partitionId}/items/{sequence}`'s member-private branch is `partitionId == 'member-' + uidBinding(roomId).memberId` (string concatenation), not a parse of `partitionId`. Confirm this is actually more robust than parsing (it is — Firestore rules cannot cleanly extract a variable-length prefix from a wildcard segment) and that the test matrix's `PLAYER_ONE_EVENT_PARTITION`/`PLAYER_TWO_EVENT_PARTITION` fixtures (`memberEventPartitionId`, e.g. `member-member-player-one`) actually exercise a case where the member ID itself already contains `member-`, which is the realistic shape (`templates/eat-the-reich/test/fixtures.ts`'s `PLAYER_MEMBER_ID` is `member-rook`).
3. **Receipt read authorization uses `resource.data.memberId`, not the GM's capability.** Confirm the required proof ("The GM cannot read another member's receipt", `docs/ARCHITECTURE.md` section 13) is actually enforced by the rule text, not just by the absence of a passing test for the opposite case — `firestoreRoomRules.security.test.ts`'s "denies the GM reading another member's receipt (required proof)" test should be read adversarially: does it actually attempt the read the rule is supposed to block, using the real GM UID and a real other-member's receipt document?
4. **RTDB's read boundary is intentionally weaker than Firestore's.** `presence/{roomId}` is readable by *any* authenticated user, not just room members — this is a documented, accepted residual (`docs/ARCHITECTURE.md` section 8: "RTDB cannot verify a Firestore binding..."), not an oversight. Confirm the review agrees this residual is acceptable as scoped, and that the write rule (`auth.uid === $uid`) is not accidentally satisfiable by an unauthenticated client (RTDB's `auth` is `null` when signed out, and `null === $uid` is false for any string `$uid`, but this is worth a direct adversarial check against the emulator, which `rtdbPresenceRules.security.test.ts` does test).
5. **The `AuthorityRecord` contract change's blast radius.** Confirm every `AuthorityRecord<TState>` construction site in the repository was updated (grep for `roomRevision:` and `nextSequence:` as loose markers, since those two fields have shipped together with `roomStatus`/`gmMemberId` since this PR) and that no test silently started passing with an incomplete object due to a permissive test fixture type.
6. **The sandboxed-environment proxy workaround documented in `CLAUDE_HANDOFF.md`** (`firebase-tools`' `apiv2.js` ignoring `NO_PROXY`) is an environment-specific note, not a code change — confirm no repository file was modified to route around it (it wasn't; `firebase.json` is unchanged from PR 1), and that this note doesn't quietly paper over a real rules defect. Reproduce independently: run `npm run test:emulator` first without unsetting proxy env vars (expect the `database.rules.json:Unable to parse JSON` failure) and then with them unset (expect 46/46 passing), to confirm the diagnosis rather than taking it on faith.

## Verification performed by the implementing pass

- `npm run format` / `npm run lint` / `npm run typecheck` / `npm run test` (`npm run check`) — all clean; 159/159 unit/component tests pass.
- `npm run build` — clean.
- `npm run test:emulator` (with `HTTPS_PROXY`/`https_proxy`/`HTTP_PROXY`/`http_proxy` unset, per the note above) — 46/46 emulator tests pass across 3 files.
- `npm audit` — unchanged from PR 1 (9 moderate, all transitive `firebase-tools` dev tooling; non-breaking fix already applied; the remainder needs a 5-major-version `firebase-tools` downgrade, not applied).
- `git diff --check` — clean.

## What this review should not re-litigate

- The `uidBindings` reverse-index design itself (third-pass review R1) and the `AuthorityRecord` field placement (R2) — both are already-approved architecture decisions this PR implements, not proposes. Disagreement with the underlying design belongs in a fresh architecture review, not this implementation review.
- Anything gated on PR 3 onward (real project creation, admission policy, GM claim, recovery, reconnect/outbox) — out of scope by `docs/PHASE_2_PLAN.md`'s own PR boundaries.
