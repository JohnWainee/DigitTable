You are a FLASH BUILDER implementing ONE bounded leaf of a DigiTable change. Work ONLY inside the git worktree you were given. Do not read or write any other checkout. Do NOT run `git commit`, `git push`, `git stash`, `git reset`, `git checkout`, or change any git config — the orchestrator commits. Do not add npm dependencies. Do not touch any file outside your reserved paths.

## Problem (verified by an independent semantic review)
`AGENTS.md` invariant: "Hidden GM-only inputs are redacted from player-visible projections AND player-visible event copies." `project()` in `templates/eat-the-reich/src/engine.ts` hides every Threat with `revealed === false` from players and the table (only `isGm` sees them; `toThreatPublicView` also never carries `notes`). But two events are stored in the `shared` partition — readable by every room member straight from Firestore — with UNREDACTED unrevealed-Threat data:
1. `SceneEdited` (`decideEditScene`, around `engine.ts:1205-1225`): `redactedForOthers` redacts only `addedThreats`. `updatedThreats` (`threatId`, `rating`, `attack`, `challenge`) and `removedThreatIds` are copied to `shared` even when they name an UNREVEALED Threat.
2. `RoundEnded` (`decideEndRound`, around `engine.ts:1085-1145`): `reinforcementDeltas` covers EVERY Threat (ids, `ratingAfter`, `attackAfter`, `status`) and the event is broadcast only to `shared`, so unrevealed Threats' ratings/attack leak.
The safe pattern already exists: `decideBeginAction` and `decideLoadScene`/`decideEditScene` emit per-destination `effects` (`gm` gets the full payload, `shared` gets a redacted payload) while `event: fullEvent` (used by `reduce`) stays full. `redactThreatsForShared` filters unrevealed Threats out and blanks `notes`.

## Reserved paths (you may create/edit ONLY these)
- `templates/eat-the-reich/src/engine.ts` (ONLY the two decide functions above and, if your audit finds another leak of GM-only/hidden data, that one decide function — keep every change minimal and localized)
- `templates/eat-the-reich/test/sharedEventRedaction.test.ts` (new)
Do NOT change `reduce`, `project`, schemas, commands, events types, or any other file. Do not change what the GM copy or the `reduce` input contains.

## Build
1. Fix `SceneEdited`: the `shared` payload keeps `addedThreats: redactThreatsForShared(addedThreats)` AND additionally filters `updatedThreats` and `removedThreatIds` to Threats that are `revealed` in `ctx.state.threats` (evaluate revealed-ness against the pre-command state you already have; a Threat added in the same command follows the same `addedThreats` redaction, so it never appears in the other arrays). The `gm` destination copy stays the full event. Keep `updatedObjectives`/`removedObjectiveIds`/objective arrays untouched (objectives are public per `toObjectiveView`).
2. Fix `RoundEnded`: emit explicit effects — `gm` gets the full event; `shared` gets the same event with `reinforcementDeltas` filtered to Threats revealed in `ctx.state.threats`. Keep the existing `eventId` and the full event as `event` for `reduce`. (Use the same `{ eventId, event, effects: [...] }` shape the other decide functions in this file use for per-destination payloads.)
3. AUDIT every OTHER decide function's `shared`-destination payload against `project()`'s visibility rules. Classify each finding:
   - GM-ONLY hidden data (unrevealed Threats/their stats or ids, Threat `notes`, hidden difficulty modifiers, any GM-only field) reaching `shared` => FIX it the same way (minimal, per-destination effects) and cover it with a test.
   - Player-private data about ANOTHER character (e.g. the full `injuryMark` detail on a shared `ActionResolved`, while the roster projection only shows `injuryBoxesMarked`/`downed`) => DO NOT change behavior (a product decision), only REPORT it in your final summary with `file:line`.
   Also report — do not change — `ActionDeclared.actorMemberId` in the shared copy.

## Tests (`templates/eat-the-reich/test/sharedEventRedaction.test.ts`; follow the fixtures/helpers already used by `decideScenes.test.ts` and `projectionIsolation.property.test.ts` in that folder — read them first)
- Build a state with a scene containing at least one revealed and one UNrevealed Threat (unrevealed one with a distinctive `notes` string, name, rating, attack, challenge). Run the real `runCommand`/`decide` path (as the existing tests do) for `EditScene` (updating and removing both the revealed and the unrevealed Threat) and `EndRound` (both `book` and `simplified` reinforcement modes, with the unrevealed Threat at rating > 0 and at rating <= 0). For each, take the `shared`-destination payload and assert: it contains NO occurrence (search the JSON string) of the unrevealed Threat's id, name, `notes`, or its stat values as a Threat delta; the revealed Threat's data IS still present; the `gm`-destination copy still contains everything; and `reduce` on the full event yields exactly the same state as before your change (compare against a snapshot computed via the pre-change semantics by asserting specific fields, e.g. the unrevealed Threat's post-state rating/attack/status).
- A generic guard: for a sequence of real commands covering scene load, edit, begin action, roll, allocate, end round (reuse an existing lifecycle helper if one exists), assert that the JSON of EVERY `shared`-destination envelope payload never contains an unrevealed Threat's id/name/notes (use `findLeakedSecrets`/`collectStrings` from `@digitable/testing` if they fit, otherwise plain string search).
- Existing template tests must still pass unmodified.

## Done criteria (run from the repository root of YOUR worktree; report the tail of each output)
1. `npx vitest run templates/eat-the-reich`
2. `npx vitest run packages apps/functions/test` (must not regress)
3. `npx tsc --noEmit -p templates/eat-the-reich/tsconfig.json`
4. `npx eslint templates/eat-the-reich/src/engine.ts templates/eat-the-reich/test/sharedEventRedaction.test.ts`
5. `npx prettier --check templates/eat-the-reich/src/engine.ts templates/eat-the-reich/test/sharedEventRedaction.test.ts`
All must pass with zero warnings. Finish with a short summary: what leaked, what you changed, the exact command results, and the REPORT-ONLY findings. Do not commit.
