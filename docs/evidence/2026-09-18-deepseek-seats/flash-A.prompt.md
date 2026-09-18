You are a FLASH BUILDER implementing ONE bounded leaf of a DigiTable change. Work ONLY inside the git worktree you were given. Do not read or write any other checkout. Do NOT run `git commit`, `git push`, `git stash`, `git reset`, `git checkout`, or change any git config — the orchestrator commits. Do not add npm dependencies. Do not touch any file outside your reserved paths.

## Reserved paths (you may create/edit ONLY these)
- `apps/web/src/session/presentationLedger.ts`  (new)
- `apps/web/test/session/presentationLedger.test.ts`  (new)

## Read first (read-only context)
- `packages/contracts/src/eventTail.ts` (types you consume: `EventTailCursor`, `EventTailPartition`, `EventTailRecord`, `EMPTY_EVENT_TAIL_CURSOR`)
- `apps/web/src/repository/commandOutbox.ts` (house style for identity-scoped `Storage` persistence and strict parsing)
- `apps/web/test/memoryStorage.ts` (in-memory `Storage` for tests)
- `AGENTS.md`: pure logic, no wall clock, no ambient randomness; this module is framework-independent (no React, no Firebase imports).

## What to build: a persisted, bounded "presentation ledger"
Purpose: a viewer's client fetches its authorized event tail for TIMELINE/THEATRE PRESENTATION ONLY and must never re-present an event it already presented after a refresh. Projections are the sole source of domain state; nothing here reconstructs state from events. Facts you may rely on (verified in the engine): all copies of one logical event (in the `shared`, `member` and `gm` partitions) carry the SAME `eventId` and the SAME `sequence`; sequences are global per room, so each partition has gaps; two copies of one event can arrive in different tail pages because the partitions are read by separate queries.

### Constants (export all)
```ts
export const MAX_ACKNOWLEDGED_EVENT_IDS = 512;   // FIFO cap on persisted acknowledged ids
export const MAX_PENDING_EVENTS = 64;            // in-memory cap on unacknowledged logical events
export const MAX_SEQUENCE_LAG = 300;             // an unacknowledged event this far behind the newest ingested sequence expires
export const MAX_ROLL_CONTEXTS = 64;             // FIFO cap on remembered roll contexts
```
Invariant that makes eviction safe (document it in a short comment): because pending events expire once they lag the newest ingested sequence by more than `MAX_SEQUENCE_LAG`, the cursor can never trail by more than that many sequence numbers, so any event still re-readable above the cursor was acknowledged recently enough (< `MAX_ACKNOWLEDGED_EVENT_IDS` acknowledgements ago, since each sequence number is at most one logical event) to still be in the acknowledged list.

### Persistence
```ts
export interface RollContext { readonly rollId: string; readonly attackSuccessesRolled: number }
export interface PresentationLedgerData {
  readonly cursor: EventTailCursor;                        // per partition; nothing at or below these sequences needs re-reading
  readonly acknowledgedEventIds: readonly string[];        // oldest -> newest, unique, at most MAX_ACKNOWLEDGED_EVENT_IDS
  readonly rollContexts: readonly RollContext[];           // oldest -> newest, unique rollId, at most MAX_ROLL_CONTEXTS
}
export function emptyLedgerData(cursor?: EventTailCursor): PresentationLedgerData;   // default cursor = EMPTY_EVENT_TAIL_CURSOR

export class PresentationLedgerStorage {
  constructor(storage: Storage, scope: string);            // `scope` is an opaque identity-scoped string supplied by the repository
  load(): PresentationLedgerData | null;                   // null when absent OR invalid; NEVER throws
  save(data: PresentationLedgerData): boolean;             // false (never throws) if storage rejects the write
}
```
- One key: `digitable.presented.v1:${scope}`.
- `load()` strictly validates: JSON object; `cursor.{shared,gm,member}` are non-negative safe integers; ids are non-empty strings, unique, length <= cap; rollContexts have non-empty string `rollId`, non-negative safe-integer `attackSuccessesRolled`, unique `rollId`, length <= cap. ANYTHING else (bad JSON, wrong types, over-cap arrays, duplicates) => `null`. Unknown extra top-level keys are tolerated when the required fields are valid.
- `save()` MERGES with what is currently stored before writing so two tabs sharing a key cannot regress each other: cursor = per-partition max; acknowledgedEventIds = stored ids first then any new ids (order preserved, no duplicates), re-trimmed to the newest MAX; rollContexts = union by rollId (incoming value wins), re-trimmed. An invalid stored value is ignored (incoming data is written). All storage access is inside try/catch; return `false` on any failure.

### Session
```ts
export interface PresentableEvent<TEvent> {
  readonly eventId: string;
  readonly commandId: string;
  readonly sequence: number;
  readonly roomRevision: number;
  readonly payload: TEvent;                                // payload of the most-private copy (gm > member > shared)
  readonly partitions: readonly EventTailPartition[];     // every partition a copy was seen in, ordered gm, member, shared
}
export interface PresentationSessionOptions<TEvent> {
  readonly store: PresentationLedgerStorage;
  readonly initial: PresentationLedgerData;
  /** Template-specific extraction of roll context from an event payload; null for other events. */
  readonly rollContextOf?: (payload: TEvent) => RollContext | null;
  /** Test seam only; production callers omit it. */
  readonly limits?: { readonly maxAcknowledged?: number; readonly maxPending?: number; readonly maxSequenceLag?: number };
}
export class PresentationSession<TEvent> {
  constructor(options: PresentationSessionOptions<TEvent>);
  ingest(records: readonly EventTailRecord<TEvent>[]): void;
  pending(): readonly PresentableEvent<TEvent>[];
  acknowledge(eventId: string): void;
  data(): PresentationLedgerData;                           // the persisted-shape state
  fetchCursor(): EventTailCursor;                           // per partition max(data().cursor[p], highest sequence ingested from p): where the NEXT tail read starts
  attackSuccessesRolled(rollId: string): number | null;
}
```
Exact semantics (each is a correctness requirement and needs a test):
1. `ingest` ignores a record if its `eventId` is in the acknowledged list, OR the same `(partition, sequence)` is already pending, OR `sequence <= data().cursor[partition]`. It STILL counts toward `fetchCursor()` and the "highest ingested" bookkeeping even when ignored as already acknowledged.
2. `ingest` calls `rollContextOf(record.payload)` for EVERY ingested record (including ones ignored as already acknowledged), remembers non-null results in `rollContexts` (FIFO cap, replace-by-rollId keeps the newest position), then persists when anything changed.
3. `pending()` returns unacknowledged logical events: copies are merged BY `eventId` into one `PresentableEvent` (payload/sequence/roomRevision/commandId from the most-private copy: `gm` over `member` over `shared`), sorted ascending by `sequence`, ties by `eventId` (plain string compare). Acknowledged/expired ids never appear.
4. `acknowledge(eventId)`: idempotent; a no-op for an id that is neither pending nor already acknowledged. Adds the id to `acknowledgedEventIds` (FIFO trim), removes EVERY copy of it from the pending set, recomputes the cursor, persists via `store.save` (ignore a `false` result — presentation must never throw into game flow).
5. Expiry: after every `ingest`, any pending logical event whose `sequence < highestIngestedSequence - MAX_SEQUENCE_LAG` (highest over all partitions) is acknowledged automatically; and if more than `MAX_PENDING_EVENTS` logical events are pending, the oldest are acknowledged automatically until the cap holds. Use the `limits` overrides when present. (Presentation decoration may be dropped for late viewers — this is intentional.)
6. Cursor rule, per partition p: if some copy in partition p is still pending, `cursor[p] = max(previous cursor[p], minPendingSequence(p) - 1)`; otherwise `cursor[p] = max(previous cursor[p], highestSequenceIngested(p))`. The cursor NEVER decreases. Recompute after `ingest`, `acknowledge` and expiry, and persist when it changed.
7. `attackSuccessesRolled(rollId)` returns the remembered value or `null`.
8. Never mutate inputs; return copies. No `Date`, no `Math.random`.

## Tests you must write (`apps/web/test/session/presentationLedger.test.ts`, Vitest; use `MemoryStorage` from `apps/web/test/memoryStorage.ts`; `fast-check` is available)
Unit: (a) `load` -> null for absent/bad JSON/wrong types/over-cap/duplicate ids; (b) save/load round trip; (c) scope isolation; (d) save merge: two `PresentationLedgerStorage` instances on one storage do not regress each other's cursor/acks; (e) `save` returns false and does not throw when `setItem` throws; (f) ingest+pending ordering by sequence with ties; (g) cross-partition dedupe prefers gm > member > shared and lists all partitions; acknowledging removes every copy; a second copy of an already-ACKNOWLEDGED event arriving in a LATER `ingest` call is ignored (the split-page case); (h) after a "reload" (new `PresentationSession` from `store.load()`) an acknowledged event is not presented again; (i) an unacknowledged head keeps the cursor below it so a reload re-reads it, while later acknowledged events above it are filtered by the id list; (j) the cursor never decreases; (k) id-cap FIFO eviction and rollContext cap/replace; (l) `rollContextOf` is applied to acknowledged/ignored records too and survives reload; (m) `fetchCursor()` >= `data().cursor` and advances on ingest even with nothing pending; (n) expiry by sequence lag and by pending cap (use `limits`), expired events never reappear and unblock the cursor; (o) no `rollContextOf` supplied works.
Property (fast-check): generate a random server log (N <= 60 events; each event lives in a random non-empty subset of the three partitions; one shared eventId and one shared global ascending sequence per event; per-partition gaps). Use small `limits` satisfying `maxAcknowledged >= maxSequenceLag + 5` (e.g. lag 12, acknowledged 20, pending 8). Simulate a random schedule of: fetch-a-page (per-partition limit 1..5 starting at `fetchCursor()`, with the two copies of an event sometimes deliberately split across different fetches), acknowledge-the-first-pending, reload (new session from `store.load()`), then drain. Invariants: an eventId that has been acknowledged or expired NEVER appears in `pending()` again (including after reloads); no eventId is presented (observed in `pending()` before being acknowledged) after it was acknowledged; `data().cursor` never decreases; `acknowledgedEventIds.length` never exceeds the cap.

## Done criteria (run from the repository root of YOUR worktree and report the tail of each output)
1. `npx vitest run apps/web/test/session/presentationLedger.test.ts`
2. `npx tsc --noEmit -p apps/web/tsconfig.json`   (errors in files outside your reserved paths that implement `RoomRepository` are expected and out of scope — list them, do not touch them)
3. `npx eslint apps/web/src/session/presentationLedger.ts apps/web/test/session/presentationLedger.test.ts`
4. `npx prettier --check apps/web/src/session/presentationLedger.ts apps/web/test/session/presentationLedger.test.ts`
All applicable checks must pass with zero warnings. Fix failures in your reserved files only. Finish with a short summary of what you built and the exact command results. Do not commit.
