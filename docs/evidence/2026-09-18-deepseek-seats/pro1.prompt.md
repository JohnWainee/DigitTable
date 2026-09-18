You are the SEMANTIC FOREMAN (read-only analyst) for a bounded DigiTable change. Do NOT write or edit any file. Use only read/grep/find/ls inside the packet directory you were given; it contains exactly the files you may inspect.

## Background (facts you can verify in the packet)
DigiTable is a realtime tabletop-RPG play surface. Firestore projections (`rooms/{roomId}/projections/{viewerId}`) are the SOLE source of client domain state. Events are stored in physical partitions `events/shared/items/{seq}`, `events/gm/items/{seq}`, `events/member-{memberId}/items/{seq}`; `firestore.rules` authorizes reads per partition. Sequences are allocated globally per room inside the command transaction, so each partition has gaps. One logical event may be copied to several partitions (e.g. a full copy to the actor's `member-` partition and a redacted copy to `shared`) and keeps ONE eventId. `EventEnvelope.roomRevision` is the accepted-command revision that produced the event and is committed in the same transaction as the projections at that revision.

Independent review 2026-09-17 (docs/reviews/2026-09-17-s06-outbox-reconciliation-review.md) found S06 (client outbox/reconnect) incomplete:
 H. No authorized event-tail replay and no durable presented-event dedupe (acceptance row 8: "Refresh does not re-fire theatre for an already-presented event ID").
 M. `useRoomProjection` keeps a single `recoveredResult` slot; a later reconciled command (e.g. `Pause`) overwrites an earlier recovered `ActionResolved`.
 L. A recovered `ActionResolved` summary loses the attack-success explanation (`attackSuccessesRolled`), because the resolved roll has left the projection.

## The design under review (the Sonnet orchestrator's proposal — attack it)
1. Contracts (already written; see packages/contracts/src/eventTail.ts and repository.ts): `readEventTail(memberId, viewer, cursor, limit)` reads, for shared + the member's own partition + `gm` when the viewer's capability is `gm`, up to `limit` records with `sequence > cursor[partition]` ordered by sequence; returns validated `EventTailRecord`s (no `actor` field) and a per-partition advanced cursor; `readEventTailHead` returns the latest sequence per authorized partition.
2. Cursors are PER PARTITION (never one merged number) because partitions are read by separate queries.
3. A persisted "presentation ledger" (localStorage, scoped by project+uid+roomId+memberId, single JSON key, strict parse; absent/corrupt => treated as ABSENT) holds: the per-partition cursor, a bounded FIFO list of acknowledged eventIds (max 128), and a bounded FIFO map rollId -> attackSuccessesRolled (max 32) recorded when an `ActionRolled` record is ingested.
4. ABSENT ledger => BASELINE: set cursor to `readEventTailHead`, present nothing from history (late join / cleared storage must not replay the past; acceptance row 11).
5. The cursor is advanced only over a contiguous acknowledged prefix per partition: cursor[p] = (smallest unacknowledged sequence in p) - 1, or the last fetched sequence in p if none are unacknowledged. Unacknowledged items are re-read after a reload (they were never presented). Acknowledged ids above the cursor are filtered by the bounded acknowledged-id list.
6. Merge across partitions: dedupe by eventId, preferring gm > member > shared copy for display; acknowledging an eventId acknowledges every copy. Order: ascending sequence, ties by eventId.
7. `useRoomProjection` exposes `presentation` (an ordered queue) instead of `recoveredResult`. PROJECTION-BEFORE-PRESENTATION invariant: an item is exposed only when the hook's current projection has `roomRevision >= item.roomRevision` (derived visibility rule, not just call ordering); the sync loop refreshes the projection before releasing items.
8. The queue is the ONLY presentation path: the player dashboard no longer builds its resolution summary from `dispatch().sharedEvents`; it derives it from queue items (own-character `ActionResolved`, merged with a following `InjuryCategoryChosen` for the same rollId). The summary is acknowledged only when the player dismisses it; every other item is auto-acknowledged.
9. Recovered explanation: `attackSuccessesRolled` for a resolved roll comes from the ledger's rollId map (recorded at ActionRolled ingest) or the same fetched batch; else null and the "Defended" line is simply omitted.
10. Only the player dashboard opts in to presentation replay; GM/table/claim screens do not read the tail.
11. Live-mode and fixture-mode (`InMemoryRoomRepository`, which will keep its envelopes with their destinations) both implement the two new repository methods.

## What I need from you (semantic analysis, evidence-based)
Verify by READING THE CODE, then report. Cite `path:line` for every finding. Examine at least:
 a. PRIVACY: can any step surface another viewer's private data or a GM-only value to a player, or put an event `actor` (safety authorship) into a client presentation structure? Confirm from `templates/eat-the-reich/src/engine.ts` which events are redacted per destination and whether shared copies keep the same eventId as private copies.
 b. CURSOR/DEDUPE CORRECTNESS: any sequence where the per-partition cursor + acknowledged-id set can skip an unpresented event or re-present a presented one (cross-partition duplicates, out-of-order acknowledgement, eviction of the bounded id list, pagination via `limit`, the same command's copies committed atomically but read by separate queries).
 c. BASELINE: does baseline-at-head ever hide an event this member SHOULD see because their own recovered command produced it (see `reconcilePending`, `receipt.acceptedSequence`, which records only the FIRST emitted sequence)? Propose the smallest safe handling.
 d. REVISION GATE: is `EventEnvelope.roomRevision <= projection.roomRevision` guaranteed sufficient for "projection before presentation"? Consider projection listener lag, `receive()` in useRoomProjection ignoring older revisions, and events for revisions the viewer's projection never changes.
 e. REACT/HOOK HAZARDS in `useRoomProjection`: stale closures, StrictMode double effects, unmount/identity-change races, unbounded timers, concurrent `sync()` calls, and `dispatch()` interplay.
 f. FIRESTORE: will `where("sequence", ">", n) + orderBy("sequence") + limit(n)` on each partition collection be authorized by `firestore.rules` as list queries, and need any composite index? Will `orderBy desc limit 1` for the head?
 g. MULTI-TAB: two tabs sharing one localStorage ledger — what breaks and what is the smallest acceptable mitigation?
 h. Anything in the design that violates: projections are the sole domain state; events never reconstruct state; theatre/presentation never blocks game state.

## Deliverable format (end your response with these sections, populated)
FINDINGS: numbered; each = severity (BLOCKER/HIGH/MEDIUM/LOW), `path:line` evidence, concrete failure scenario, smallest recommended amendment.
CONFIRMED-SOUND: bullet list of design points you verified hold, with evidence.
AMENDED-TESTS: the precise unit/property/integration tests that MUST exist to prove the corrected design (name + assertion).
DESIGN-VERDICT: `SOUND` or `AMEND` (then list amendments in priority order).
Keep the whole response under ~1800 words. Do not reproduce file contents.
