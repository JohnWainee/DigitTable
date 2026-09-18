# DeepSeek seat evidence, 2026-09-18 (`today-deepseek` run)

Provenance for the S06 / Phase 2 PR 7 work (event-tail presentation, `contractId: s06-realtime-presentation`,
`runId: today-deepseek-2026-09-18`) that was produced with DeepSeek seats and integrated on
`factory/today-deepseek`.

## What is recorded here

The files in this directory are copied verbatim (byte-exact, excluded from Prettier) from
`/private/tmp/dt-seats/` on the orchestrating Mac:

| Seat      | Model               | Role        | Wall clock | Status      | Task record                                    |
| --------- | ------------------- | ----------- | ---------- | ----------- | ---------------------------------------------- |
| `pro1`    | `deepseek-v4-pro`   | analyst     | 299 s      | `completed` | semantic design review of the event-tail plan  |
| `flash-A` | `deepseek-v4-flash` | implementer | 209 s      | `completed` | `presentationLedger.ts` + tests                |
| `flash-B` | `deepseek-v4-flash` | implementer | 303 s      | `completed` | `eventTail.ts`, both repositories' tail reads  |
| `flash-C` | `deepseek-v4-flash` | implementer | 289 s      | `completed` | `useRoomProjection` presentation queue + UI    |
| `flash-E` | `deepseek-v4-flash` | implementer | 254 s      | `completed` | shared-event redaction fixes in `engine.ts`    |

Each seat made one attempt (`attempts: 1`). Per seat: `<seat>.outcome.json` is the terminal record the harness wrote,
`<seat>.spec.json` is the task contract (path allow/deny lists, budgets), and `<seat>.prompt.md` is the prompt
the seat was given.

## What is not recorded, and why

- **`flash-D` and `flash-F` never ran.** Prompt files were drafted (`/private/tmp/dt-seats/flashD.prompt.md`,
  `flashF.prompt.md`) but no spec, worktree, or outcome exists for either. Nothing in this branch is attributed to
  them.
- **Raw session transcripts and the 196 KB event log** (`/private/tmp/dt-seats/evidence/sessions/`,
  `pilot-events.jsonl`) are not committed. They remain on the Mac's temporary directory and are not durable.
- **Token usage and cost** are not in the outcome records and are not claimed.

## How to read the results honestly

- The "command results" inside each `outcome.json` summary are the **seat's own report** from its own worktree under
  `/private/tmp/dt-seats/wt-*`, run against a snapshot before integration. They are not independent verification.
- Integration was done by the orchestrator, not the seats: `flash-A` and `flash-B` output landed in commit `afd0ced`
  (with orchestrator amendments: pending cap 512, identity check without storage). `flash-C` and `flash-E` output
  landed in the follow-up commit on this branch, together with orchestrator changes (recovered-command baseline
  persisted across a failed head read, with a regression test; corrected runbook). Each flash seat's own
  report states that it made no commit or push.
- The integrated tree was re-verified after integration (`npm run check`, `npm run build`, `npm run test:emulator`);
  see `CLAUDE_HANDOFF.md` and `docs/reviews/2026-09-18-s06-deepseek-factory-review.md` for the numbers.
- `flash-C` reported that `apps/web/src/session/uuid.js` did not exist and left `crypto.randomUUID()` in place
  rather than inventing it. `docs/TWO_DEVICE_RUNBOOK.md` lists this
  among the reasons LAN devices are not supported yet.
- The `pro1` design review gave the verdict **AMEND**, with 11 findings (2 blockers, 2 high). Their dispositions are
  in `docs/reviews/2026-09-18-s06-deepseek-factory-review.md`; several are still open.
