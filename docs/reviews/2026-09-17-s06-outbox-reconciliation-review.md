# S06 outbox and reconciliation independent review

- **Date:** 2026-09-17
- **Reviewer:** independent Sonnet agent
- **Branch:** `codex/s06-outbox-reconciliation`
- **Verdict:** request changes before declaring Phase 2 PR 7 complete

## Verified implementation

- Browser-local command persistence is scoped by project, Firebase UID, room, member seat, and command ID.
- Dispatch persists before transport and reuses the exact command ID and payload after an ambiguous failure.
- Reconnect checks the actor-private receipt before retrying; accepted and rejected receipts settle the original pending promise without re-deciding the command.
- A replacement anonymous identity cannot replay another identity's saved commands.
- Firestore permits a member to probe only its own missing UUID receipt and retains existing receipt isolation.
- UI surfaces reconnect and pending-command state without treating event data as authoritative domain state.

The review found and fixed a recovered-result defect: resolved rolls are absent from the current projection, so a recovered `ActionResolved` cannot be matched through `ownRoll`. The UI now matches the server-authored `characterId`; regression coverage also prevents cross-character display and repeated display after dismissal.

## Remaining findings

### High — event-tail replay and presentation deduplication are absent

`docs/PHASE_2_PLAN.md` acceptance row 8 requires refresh not to re-fire theatre for an already-presented event. The implementation fetches at most the receipt-linked shared event and stores no bounded event-tail cursor or presented-event IDs. Implement authorized event-tail replay for presentation/timeline only and durable deduplication before completing PR 7.

### Medium — recovered results can overwrite one another

`useRoomProjection` exposes a single `recoveredResult` and overwrites it while iterating reconciled results. A later pending command, including `Pause`, can hide an earlier recovered `ActionResolved`. Replace this with an ordered, deduplicated presentation queue rather than command-type priority logic.

### Low — recovered summary loses the attack-success explanation

An ordinary resolved roll is no longer present in the projection, so the recovered summary falls back to zero attack successes and may omit its defend-only explanatory line. Supply this from authorized presentation data without replaying events into domain state.

### Open acceptance evidence

The required three-physical-device emulator and staging rehearsal (acceptance row 22) has not been recorded.

## Verification

- `npm run check` — passed: format, lint, typecheck, 461 tests passed; 11 existing todos.
- `npm run build --workspace @digitable/web` — passed; 125 modules transformed.
- Full `npm run build` — passed from an APFS-cloned `/private/tmp` checkout; Functions bundle 208.8 kB and Vite production build passed.
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — passed from that temporary checkout: 18/18 `packages/testing`, 86/86 `apps/functions`, and 3/3 `apps/web` tests.

The temporary clone is an environment workaround, not a code workaround. On this host, listing `/Users/john/Documents` blocks; an esbuild stack sample showed it waiting in ancestor-directory `open()` before reading repository source.
