# A05 (live client repository) independent review and resolution

- **Reviewed PR:** [#27](https://github.com/JohnWainee/DigitTable/pull/27) ("A05: live client repository") at `d51c5ea` — board task A05 on GitHub issue #14.
- **Against:** `sonnet-a/a04` (PR #23, itself stacked on #18/#15/#13, all previously reviewed with no blocking findings).
- **Reviewer:** a fresh subagent session, independent of the author, given only the branch/PR and the architecture invariants. The worktree was kept read-only for the review's whole duration.
- **Date:** 2026-09-14.
- **Result:** no hard-blocking finding; one Medium finding whose reasoning was factually wrong (the client-side `roomRevision` approximation), fixed here with a small, well-scoped server-side change rather than left as a documented limitation. Two Low findings (duplicated error-mapping helper, missing `onSnapshot` error handling), both fixed.

## What was verified to hold (PASS, with evidence)

1. **Client reads only its authorized projection.** `FirebaseRoomRepository` only ever reads `rooms/{roomId}/projections/{viewerId}`; never `authority/current` or `events/**`. `parseViewerProjection` fails safely (throws, never delivers unvalidated data as if valid).
2. **No secret in a URL, log, or unintended network call.** `httpsCallable` posts JSON bodies; no `console.*`/logging call anywhere in the new client modules; no `SessionOwnershipRecord`/local-storage path is touched by this PR at all.
3. **`AdmissionAccepted.roomId` is server-resolved, never client-echoed.** All three construction sites in `admissionAuthority.ts` build it from the server's own resolved room context; `AdmitMemberInput`/`ClaimSeatInput` have no `roomId` field for a client to inject.
4. **Single-`FirebaseApp` scoping is real and the fix is correctly threaded.** The old `anonymousAuth.ts` shape genuinely resolved to the process-wide default app; `FirebaseSessionClient.ensureSignedIn()` now consistently uses `this.app`.
5. **`stableErrorFromThrown` can't be tricked by a malformed `FunctionsError.details` shape.**
6. **Test-only emulator seeding cannot leak into production.** Confirmed via `npm run build` and a direct grep of the built bundle for `withSecurityRulesDisabled`/`rules-unit-testing`/`seedPlaceholderCharacter` — zero matches.
7. **Eslint carve-out precision.** Exact file (`FirebaseRoomRepository.ts`), not a directory glob — the sibling `InMemoryRoomRepository.ts` stays banned from importing Firebase.
8. **`packages/testing`'s newly-public emulator harness doesn't leak Firebase into engine/contracts/templates.** Only re-exports from the pre-existing `./emulator.js`; every consumer of the new export is a test file.

## Findings and dispositions

### Finding 1 (Medium, fixed — not left as a residual). The client-side `roomRevision` approximation was unsound

`toRoomAdmissionAccepted` read the joining member's own (not-yet-written) projection and defaulted `roomRevision` to `0` when absent, reasoning that "no game command has run in this room since it was created." That premise is false: `gameCommandAuthority.ts` writes a projection only for viewers present in the `bindings` collection *at the time a command is committed* — a member who joins **after** an earlier command has already been accepted would still see `0`, silently understating the room's true revision. Nothing in the admission flow prevents a GM from issuing a command before every player has joined.

**Fix:** the real fix the review suggested — have `admitMember`/`claimSeat` return the true `authority.roomRevision` directly, the same pattern already used for `roomId`.

- `AuthorityAdmissionFields` (`packages/contracts/src/room.ts`) gains `roomRevision: number`; `parseAuthorityAdmissionFields` validates it fail-closed (a malformed/missing value denies `ROOM_DATA_INVALID`, never defaults to `0`).
- `AdmissionAccepted` (`packages/contracts/src/admission.ts`) gains `roomRevision: number`.
- `admissionAuthority.ts`'s `createSeat` and both reclaim branches (in `admitMember` and `claimSeat`) now echo `context.authority.roomRevision` — a value already in scope from the transaction's own read, not a new read.
- `FirebaseSessionClient.toRoomAdmissionAccepted` now uses `accepted.roomRevision` directly; the Firestore round-trip (and the `getRoomFirestore`/`doc`/`getDoc` imports it needed) is gone entirely — this is both more correct and simpler than what it replaced.

New/updated tests: `packages/contracts/test/room.test.ts` gains fail-closed cases for missing/negative/fractional/string `roomRevision`; `apps/functions/test-emulator/admission.test.ts`'s `seedRoom` fixture (used by ~20 existing tests) now seeds `roomRevision`, which the new required-field validation exposed as missing — every affected test was already asserting a *different* denial code and continues to pass with the fixture corrected, not adjusted to tolerate the new field.

### Finding 2 (Low, fixed). `stableErrorFromThrown` was duplicated verbatim

Extracted to `apps/web/src/firebase/functionsError.ts`, imported by both `FirebaseSessionClient` and `FirebaseRoomRepository`.

### Finding 3 (Low, fixed). `subscribeToProjection`'s `onSnapshot` had no error callback

A dead listener (permission-denied after a rules change, a sustained network partition) previously went completely silent. `onSnapshot` now takes an error callback that relays the failure through `subscribeToErrors` (`ROOM_DATA_INVALID`, a clear message) — the same broadcast channel `dispatch` rejections already use; there is no second, projection-specific error channel in the `RoomRepository` interface to add.

## Verification after the fixes

| Command | Result |
|---|---|
| `npm run check` (format, lint, typecheck, default tests) | pass; **325/325 tests across 43 files** (up from 321: +4 new `roomRevision` fail-closed cases) |
| `npm run build` | pass (`apps/functions` esbuild bundle 92.1kb) |
| `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` | pass; **92/92** (16 `packages/testing` + 73 `apps/functions` + 3 `apps/web`) |
| `npm audit` | 13 moderate, unchanged from baseline |
| `git diff --check` | clean |

## Disposition

**A05 is ready for John's merge decision** (after PR #13, #15, #18, #23, which it stacks on). The Medium finding is fully closed with a server-side fix rather than deferred; both Low findings are fixed. This review does not merge the PR; merge authority remains John's.
