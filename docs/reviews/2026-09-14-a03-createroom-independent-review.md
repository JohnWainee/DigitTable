# A03 (`createRoom`) independent review and resolution

- **Reviewed PR:** [#18](https://github.com/JohnWainee/DigitTable/pull/18) ("A03: secure createRoom") at `8a2d277` — board task A03 on GitHub issue #14.
- **Against:** `worktree-phase2-pr3-admission` (PR #13) with `sonnet-a/a02` (PR #15) merged in.
- **Reviewer:** a fresh subagent session, independent of the author, given only the branch/PR and the architecture invariants. Two attempts: the first was cut off partway by an infrastructure rate limit (not a finding) and produced no report; the second ran to completion.
- **Date:** 2026-09-14.
- **Result:** one process-blocking finding (fixed) and three substantive findings (two Medium, one Low; all fixed). No finding touched the atomicity, collision-safety, secret-handling, privilege, throttle, or rules-enforcement guarantees A03 was required to deliver — those were independently verified PASS with concrete test evidence for every item the review was asked to check.

## What was verified to hold (PASS, with evidence)

1. **Atomicity and idempotency.** Every write (receipt, room-code index, secrets, authority, meta, GM's binding/uidBinding/member/recovery, GM's projection) happens inside the one transaction; `decideCreateRoom` is consulted before any provisioning write. The 8-concurrent-request test proves exactly one room/member results.
2. **Collision safety.** `reserveRoomCode` checks `roomCodes/{code}` transactionally, bounded retry, `ROOM_CREATION_FAILED` on exhaustion (a mapped stable code, never an unmapped error or infinite loop).
3. **Secrets never leak.** Passphrase/table code/recovery code are PBKDF2-hashed before the transaction; plaintext never appears in a response, log, or document; exactly one of N concurrent identical requests receives the real (non-null) secrets.
4. **Privilege/injection safety.** The parser extracts only the four declared fields; capability is hardcoded `"gm"`; the member ID is always server-minted. A spoofed-payload test confirms no client-asserted field survives.
5. **Rate limiting.** The UID/IP throttle runs before the transaction and before any slow hashing.
6. **Firestore rules.** Both new service-only collections are denied to every role on every operation, with direct test coverage.
7. **`initialState`'s empty-`memberIds` change.** Backward-compatible; every existing caller still passes a non-empty array and is unaffected; the empty case produces `characters: {}`, never a character wrongly assigned to the GM.
8. **Judgment call: `SessionOwnershipRecord.recoveryCode` in localStorage.** The reviewer judged this an acceptable, disclosed interim design for A03 (the server-side "shown once" invariant is fully honored; what the client does with its own copy of its own seat's own recovery code is a distinct, already-somewhat-accepted trust boundary), and recommended board task A06 explicitly scope the code's client-storage lifetime and consider rotating it on first reconnect use. **Disposition: recorded as an A06 follow-up item, not an A03 defect.** No code change in this branch.

## Findings and dispositions

### Finding 1 (blocking, process). `npm run check` failed at the format step

`apps/functions/test-emulator/createRoom.test.ts` was written after the last `npx prettier --write` pass on a specific file list and was never re-run through the formatter before commit; `npm run check`'s `format && lint && typecheck && test` chain therefore failed at the first step and never reached lint/typecheck/test, contradicting the PR's "npm run check: pass" claim. (The review's report also flagged `packages/contracts/src/room.ts` as failing prettier; that was this session's own uncommitted A04-preparation edits being present in the same shared worktree the review was reading live, not anything in commit `8a2d277` — confirmed by resetting the worktree to `8a2d277` and re-running `npm run check`, which showed only the `createRoom.test.ts` violation. A04's work has since been moved to its own dedicated worktree so this does not recur.)

**Fix:** `npx prettier --write apps/functions/test-emulator/createRoom.test.ts`; `npm run check` now genuinely passes end to end (see Verification below).

### Finding 2 (Medium, fixed). `createRoomReceipts/{requestId}` idempotency was not scoped to the calling UID

`decideCreateRoom` only checked receipt *existence*; nothing compared the replaying caller's UID to the original creator's. A different identity that reused (or guessed) another identity's `requestId` would receive that identity's create outcome — never a secret, but the room's existence, its `roomId`/`roomCode`, and its GM's `memberId`, none of which that caller was otherwise entitled to yet. This is a real deviation from admission's own idempotency model, which is inherently UID-scoped via `uidBindings/{uid}`.

**Fix:** `CreateRoomReceiptDocument` gains a `uid` field (`packages/contracts/src/session.ts`), validated by its parser. `createRoomAuthority.ts` now denies `ROLE_FORBIDDEN` — "This request has already been used by a different identity" — whenever an existing receipt's `uid` does not match the calling UID, before `decideCreateRoom` is even consulted. New emulator test: a second identity reusing the first's `requestId` is denied, and the original room/roster is untouched. This also exposed that the PR's own "N concurrent identical requests" test had been exercising *different* UIDs sharing one `requestId` — an unrealistic scenario (a real retry always comes from the same authenticated identity) that the fix now correctly denies. The test was corrected to use one identity across all concurrent attempts, matching what an actual double-click/network retry looks like; its assertions (exactly one room, one member, exactly one attempt sees the real secrets) are unchanged.

### Finding 3 (Medium, fixed). `sessionName` was validated but never persisted

`parseCreateRoomInput` requires and bounds-checks `sessionName`, but nothing in `createRoomAuthority.ts` read it, and `RoomMetaDocument` had no field to hold it — so a creator's session name was accepted, validated, and silently discarded, with no downstream way to ever display it.

**Fix:** `RoomMetaDocument` gains a `sessionName: string` field (`packages/contracts/src/room.ts`); `createRoomAuthority.ts` writes `input.sessionName` into it. No `firestore.rules` change needed (`meta/current` was already member-readable). New emulator assertion confirms the persisted value.

### Finding 4 (Low, fixed). A replay always reported `roomRevision: 0`

Harmless today (no game command exists yet to advance `roomRevision` — that is board task A04), but a hardcoded `0` would go stale the moment A04 lands and a late `createRoom` retry arrives after other commands have already run against the same room.

**Fix:** a replay now reads the room's live `authority/current.roomRevision` inside the same transaction (fail-closed on a malformed/missing value) instead of hardcoding `0`. New emulator test: a replay after the authority document's `roomRevision` is advanced (simulating a future A04 command) returns the live value, not `0`.

## Verification after the fixes

All commands run on the fixed branch (`sonnet-a/a03`, worktree reset to a clean tree before re-verifying).

| Command | Result |
|---|---|
| `npm run check` (format, lint, typecheck, default tests) | pass; **306/306 tests across 43 files** |
| `npm run build` | pass (`apps/functions` esbuild bundle 70.7kb; `apps/web` vite build) |
| `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` | pass; **72/72** (16 `packages/testing` + 56 `apps/functions`, up from 70 before this fix pass: +2 new tests for findings 2 and 4, +1 existing test corrected) |
| `npm audit` | 13 moderate, unchanged from A01's baseline |
| `git diff --check` | clean |

## Disposition

**A03 is ready for John's merge decision** (after PR #13 and #15, which it stacks on). The one process-blocking finding and both Medium findings are fixed on the branch with tests; the Low finding is fixed; the judgment call is recorded as an explicit A06 follow-up rather than left as an implicit assumption. This review does not merge the PR; merge authority remains John's.
