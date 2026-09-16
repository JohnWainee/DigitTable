# A06 (partial) — `recoverSeat` seat recovery — independent review

- **PR:** #30 (`sonnet-a/a06`, based on `sonnet-a/a05` / PR #27, stacked on #23/#18/#15/#13)
- **Reviewed commit:** `78a2d94`
- **Reviewer:** separate subagent (general-purpose, model sonnet), dedicated read-only worktree `.claude/worktrees/sonnet-a-a06`, no access to or knowledge of the implementation session
- **Scope:** the `recoverSeat` callable and its supporting contracts/rules/throttle, per `docs/ARCHITECTURE.md` section 8 ("Redemption")

## Verdict

**No blocking findings.** One Low-severity gap identified and fixed below; one Low-severity documentation nuance noted (no code change required).

## Findings and resolutions

1. **No client-asserted `memberId`** — PASS. `RecoverSeatInput` carries only `roomCode`/`recoveryCode`; the seat is found purely by scanning `bindings/` and checking each seat's `recovery/{memberId}` hash.
2. **No early-exit on match (timing-side-channel judgment)** — PASS. `findRecoverableSeat`'s loop never short-circuits; every seated member's hash is checked regardless of where a match occurs. The scan is bounded (`MAX_PARTICIPANT_SEATS + 1`), so this is a deliberate, cheap defense.
3. **Old-UID revocation atomic with rebind** — PASS. The delete-old/set-new/update-binding sequence all happens inside one Firestore transaction; the same-UID (self re-rotate) case is idempotent and covered by a dedicated test.
4. **Spent code invalidated, replacement is genuinely fresh** — PASS. A new code is minted via `generateRecoveryCode()`/`hashSecret()` before the transaction and `set` (not merged) onto `recovery/{memberId}`, so the previous hash can never verify again.
5. **GM-visible audit entry leaks nothing** — PASS. `SeatRecoveredAuditDocument` carries only `type`/`memberId`/`occurredAtServer` — no UID, no secret material. Rules scope reads to `hasCapability(roomId, "gm")` and deny all client writes.
6. **Throttle effectiveness vs. recovery-code entropy** — PASS, judgment recorded. `RECOVERY_THROTTLE_LIMITS = { roomIp: 10, ip: 30 }` per 60s bounds *automated velocity* from one source; the 13-character, 31-symbol recovery code (~64.4 bits entropy) is the real defense against exhaustive search, consistent with how the admission throttle is already reasoned about.
7. **Firestore rules scoping for the two new collections, and a rules-matrix test gap** — PASS on the rules themselves; **GAP confirmed** in the test suite. `packages/testing/test-emulator/roomRules.test.ts` had no `assertSucceeds`/`assertFails` coverage for `rooms/{roomId}/audit/{auditId}` (GM-only read, no client write) or `recoveryThrottle/{document=**}` (fully service-only), unlike every sibling service-only/GM-scoped tree.
   - **Fixed in this pass** (after the review, before closing A06): added a dedicated test, `"board task A06: restricts the seat-recovery audit trail to the GM seat only"`, asserting GM read succeeds, player/table/outsider/unauthenticated reads fail, a GM-scoped collection query succeeds while a player's fails, and no client (including the GM) can write or delete an audit entry directly. Extended the existing `"keeps service-only paths unreadable for every capability"` test to include `recoveryThrottle/room-abc/byIp/def` across all three capabilities, and the existing write-denial test to assert a player can neither overwrite nor delete a `recoveryThrottle` counter. New fixture documents (`rooms/{room}/audit/audit-1`, `recoveryThrottle/room-abc/byIp/def`) added to the shared `beforeAll` seed.
   - Re-verified: `packages/testing` emulator suite went from 16 to 17 passing tests; full `test:emulator` run now **106/106** (17 + 86 + 3), up from the review's confirmed 105/105.
8. **`RecoverSeatAccepted.roomId` server-resolved** — PASS. Resolved from `roomCodes/{code}` server-side, never echoed from client input.
9. **Deferred-scope honesty** — PASS. Grep confirmed no outbox, rotation-as-a-distinct-command, kick, or RTDB presence code exists anywhere; the PR's stated deferred list is accurate.

## Additional note (no code change)

`docs/ARCHITECTURE.md`'s redemption paragraph says recovery "deletes the old UID's presence"; the implementation deletes the old UID's Firestore `uidBindings` entry (membership revocation) — RTDB presence deletion is out of scope since presence isn't implemented yet (tracked under the existing R5 residual). Worth a one-line doc clarification in a future pass; not a defect.

## Verification (re-run after the rules-matrix fix)

- `npm run check`: PASS — 325/325 unit tests, 43 files.
- `npm run build`: PASS — functions bundle 100.0kb; web build succeeded (79 modules).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator`: PASS — **106/106** (17 `packages/testing` + 86 `apps/functions` + 3 `apps/web`).
