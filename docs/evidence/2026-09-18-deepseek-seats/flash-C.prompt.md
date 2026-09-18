You are a FLASH BUILDER implementing ONE bounded leaf of a DigiTable change. Work ONLY inside the git worktree you were given. Do not read or write any other checkout. Do NOT run `git commit`, `git push`, `git stash`, `git reset`, `git checkout`, or change any git config — the orchestrator commits. Do not add npm dependencies. Do not touch any file outside your reserved paths.

## Goal (S06 blockers for the client outbox/reconnect work)
The player dashboard must (1) present events from an AUTHORIZED event tail for presentation only, (2) never re-present an already-presented event after a refresh, (3) keep an ORDERED queue so a later reconciled command (e.g. `Pause`) can never overwrite an earlier recovered `ActionResolved`, (4) restore the attack-success explanation ("Defended: removed N attack successes") for a recovered resolution, and (5) NEVER expose a presentation item before the hook's projection has caught up to that item's revision. Projections remain the SOLE source of domain state; events must never be used to reconstruct or mutate domain state.

Two other builders already landed the pieces you consume (read them; do not change them):
- `packages/contracts/src/eventTail.ts`, and `readEventTail` / `readEventTailHead` / `presentationScope` on `RoomRepository` (`packages/contracts/src/repository.ts`); implemented for Firebase and in-memory repositories.
- `apps/web/src/session/presentationLedger.ts`: `PresentationLedgerStorage`, `PresentationSession`, `PresentableEvent`, `emptyLedgerData` (read its doc comments and tests for exact semantics: cursor advances only over acknowledged prefixes; `fetchCursor()` is where the next read starts; `acknowledge(eventId)` persists; absent/corrupt ledger => `load()` returns null).

## Reserved paths (you may create/edit ONLY these)
- `apps/web/src/session/useRoomProjection.ts`
- `apps/web/src/session/presentationQueue.ts` (new: pure selection helpers)
- `apps/web/src/player2/PlayerDashboardScreen.tsx`
- `apps/web/test/session/useRoomProjection.presentation.test.tsx` (new)
- `apps/web/test/session/presentationQueue.test.ts` (new)
- `apps/web/test/player2/recoveredResolution.test.ts` (rewrite for the new selection helper; the old `findRecoveredActionResolution` export is being removed)
Other screens (`ClaimCharacterScreen`, `GmDirectorScreen`, `TableDashboardScreen`) call `useRoomProjection` without the new option and must keep compiling and behaving exactly as today: do not edit them; if one of them stops compiling because you removed `recoveredResult`, tell the orchestrator instead of editing it (search first — only `PlayerDashboardScreen` should use it).

## Hook contract (`useRoomProjection`)
```ts
export interface UseRoomProjectionOptions {
  /** Opt in to authorized event-tail presentation. Default false: no tail is read at all. */
  readonly presentEvents?: boolean;
  /** Test seam; defaults to window.localStorage. */
  readonly storage?: Storage;
}
useRoomProjection(roomId, memberId, capability, options?): RoomProjectionState
```
`RoomProjectionState` REMOVES `recoveredResult` and ADDS:
```ts
readonly presentation: readonly PresentationItem[];            // ordered queue, unacknowledged, revision-gated
readonly acknowledgePresentation: (eventId: string) => void;
export type PresentationItem = PresentableEvent<EatTheReichEvent> & { readonly attackSuccessesRolled: number | null };
```
Behavior (each bullet needs a test):
1. When `presentEvents` is false the hook never calls `readEventTail`, `readEventTailHead`, or `presentationScope`, and `presentation` is `[]`.
2. Ledger scope: `repository.presentationScope(member)`; storage `options.storage ?? window.localStorage`. On the first tail sync of an effect instance: `store.load()`; if `null` => BASELINE: `head = await repository.readEventTailHead(member, viewer)`, then `baseline[p] = head[p]` for each partition p EXCEPT when this same `sync()` pass's `reconcilePending` returned accepted results carrying `acceptedSequence`: then `baseline[p] = Math.max(0, Math.min(head[p], lowestAcceptedSequence - 1))` for every partition, so the events of a just-recovered command are still presented; `initial = emptyLedgerData(baseline)`, `store.save(initial)`. Net effect: history is NEVER replayed on a late join / cleared storage, but a recovered command's own events are not baselined away. (Pass the sync pass's reconcile results into the tail-sync function for this.) Otherwise use the loaded data. Build one `PresentationSession` per effect instance with `rollContextOf: (e) => e.type === "ActionRolled" ? { rollId: e.rollId, attackSuccessesRolled: e.attackSuccessesRolled } : null`.
3. Each `sync()` (existing loop; keep its projection refresh, `reconcilePending`, retry/backoff, `online`/`offline` behavior and `status` semantics EXACTLY as they are): after projection refresh and reconcile, run a tail sync: page from `session.fetchCursor()` using `repository.readEventTail(member, viewer, cursor)` up to 4 pages per sync while `hasMore`, `session.ingest(page.records)` each page, then publish `session.pending()` to state. A failure in the tail sync must be caught separately and must NOT change `status`, `lastError`, or block the projection/reconcile work (presentation never blocks game state); it is simply retried on the next sync.
4. `reconcilePending` results feed presentation ONLY through the baseline rule in bullet 2 (a lost-ledger safeguard); ordinary presentation comes from the tail. Rejected results still call `setLastError` exactly as today. Accepted results only trigger a projection refresh (existing) and rely on the tail for presentation.
5. PROJECTION-BEFORE-PRESENTATION: `presentation` is DERIVED as `published.filter(item => projection !== null && item.roomRevision <= projection.roomRevision)` mapped to `PresentationItem` with `attackSuccessesRolled = event.type === "ActionResolved" ? session.attackSuccessesRolled(event.rollId) : null`. This must be a derived rule (via `useMemo`), not merely call ordering, so that no render ever exposes an item whose `roomRevision` exceeds the rendered projection's `roomRevision`.
6. `acknowledgePresentation(eventId)` calls `session.acknowledge(eventId)` and republishes `session.pending()`; it is safe to call with unknown ids and repeatedly.
7. Cleanup: on effect cleanup or identity change drop the session; late async results from a cancelled effect must not set state (use the existing `cancelled` guard).
8. After an ACCEPTED `dispatch`, request an immediate sync (the existing `syncRef.current()` calls already do this — keep them).

## Pure selection helpers (`presentationQueue.ts`)
```ts
export type ActionResolvedEvent = Extract<EatTheReichEvent, { type: "ActionResolved" }>;
export interface OwnResolution { readonly event: ActionResolvedEvent; readonly attackSuccessesRolled: number; readonly eventIds: readonly string[] }
export function selectOwnResolution(queue: readonly PresentationItem[], characterId: string): OwnResolution | null;
export function isOwnResolutionItem(item: PresentationItem, characterId: string): boolean;
```
- `selectOwnResolution` returns the FIRST (lowest sequence) queued `ActionResolved` whose `characterId` matches. If a later queued `InjuryCategoryChosen` has the same `rollId` and `characterId`, merge: `event = { ...resolved, injuryMark: chosen.mark, injuryChoicePendingMode: null }` and include both event ids in `eventIds`. `attackSuccessesRolled` = the item's `attackSuccessesRolled ?? 0`.
- `isOwnResolutionItem` is true for `ActionResolved`/`InjuryCategoryChosen` items of that character.
- `ActionResolvedEvent` is also exported today from `ConfirmSummary2`; import the type from there instead of redeclaring if that is cleaner.

## PlayerDashboardScreen changes
- Call `useRoomProjection(roomId, memberId, "player", { presentEvents: true })`.
- Delete `findRecoveredActionResolution`, `pendingResolution`, `dismissedRecovery`, and the code that built a summary from `dispatch(...).sharedEvents` (`handleAllocate`/`handleChooseInjury` keep dispatching but no longer set summary state; `handleAllocate` no longer needs the `attackSuccessesRolled` parameter).
- `const resolution = self ? selectOwnResolution(presentation, self.id) : null;` render the existing `ConfirmSummary2` / `ChooseInjuryPanel2` branches from `resolution` exactly as they render today from `pendingResolution ?? recoveredEvent` (same conditions, same `attackSuccessesRolled` prop). `onContinue` acknowledges EVERY id in `resolution.eventIds`.
- Auto-acknowledge every queued item for which `isOwnResolutionItem` is false, in a `useEffect` keyed on `presentation` (they need no interactive presentation; the dashboard has no other event-driven UI). Guard against calling acknowledge for an item more than once per render pass.
- Keep every other behavior (live region text, pause button, error handling, pending banner) unchanged.
- Replace `globalThis.crypto.randomUUID()` with `randomUuid()` imported from `./../session/uuid.js` (another builder is creating that module; if it is not present in your worktree yet, create NOTHING — leave the original call and tell the orchestrator).

## Tests
1. `presentationQueue.test.ts`: selection picks the lowest-sequence own resolution; ignores other characters; merges `InjuryCategoryChosen` (both ids returned); returns null on empty; `attackSuccessesRolled` null -> 0; `isOwnResolutionItem`.
2. `useRoomProjection.presentation.test.tsx` (`renderHook`/`waitFor` from `@testing-library/react`; mock `../../src/session/roomClient.js` for `getRoomRepository` and `ensureLiveAuthReady`; build a small controllable fake `RoomRepository` in the test; use `MemoryStorage` from `../memoryStorage.js` as `options.storage`; drive sync with the hook's own effect, using fake timers only if you need them):
   a. projection-before-presentation: the projection fetch is held at revision 4 while the tail already returns a rev-5 record — `presentation` stays empty and every render satisfies `presentation.every(i => i.roomRevision <= projection.roomRevision)`; once projection revision 5 arrives the item appears.
   b. ordered queue is not overwritten: tail returns `ActionResolved` (seq 3) then `Paused` (seq 4); both are present, in order; a later item never removes an earlier one.
   c. no re-presentation: acknowledge the resolved item, unmount, remount a new hook with the SAME storage and a fake tail that honors the cursor — the acknowledged event does not reappear; an UNacknowledged event DOES reappear after remount.
   d. baseline: empty storage + fake head at sequence 10 + a fake tail holding sequences 1..10 → nothing is presented (no history replay), and `readEventTail` is first called from cursor 10.
   d2. baseline with recovery: empty storage + fake head 10 + `reconcilePending` returning an accepted result with `acceptedSequence: 8` → `readEventTail` is first called from cursor 7 and the sequence-8 event is presented once the projection has caught up; sequences 1..7 are not.
   e. recovered explanation: ingest an `ActionRolled` (attackSuccessesRolled 3) and acknowledge it, remount, then a later `ActionResolved` for the same `rollId` arrives — the item's `attackSuccessesRolled` is 3.
   f. tail failure isolation: `readEventTail` rejects → `status` stays `live`, `projection` still updates, `lastError` stays null.
   g. `presentEvents: false` (default): none of the three tail methods is called; `presentation` is `[]`.
3. Rewrite `recoveredResolution.test.ts` to cover recovered summary selection through `selectOwnResolution` (own-character match after the roll left the projection; other character ignored; dismissed (acknowledged) event not returned once it is absent from the queue).
Use `template`/event fixtures already exported by `@digitable/template-eat-the-reich` where convenient; a fully populated `ActionResolved` literal like the one in the existing `recoveredResolution.test.ts` is fine.

## Done criteria (run from the repository root of YOUR worktree; report the tail of each output)
1. `npx vitest run apps/web`
2. `npx tsc --noEmit -p apps/web/tsconfig.json`
3. `npx eslint <every .ts/.tsx file you created or edited>`
4. `npx prettier --check <every file you created or edited>`
All must pass with zero warnings. Fix failures in your reserved files only. Finish with a short summary and the exact command results. Do not commit.
