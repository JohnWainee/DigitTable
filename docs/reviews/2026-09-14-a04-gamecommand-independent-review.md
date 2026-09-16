# A04 (`submitRoomCommand`) independent review and resolution

- **Reviewed PR:** [#23](https://github.com/JohnWainee/DigitTable/pull/23) ("A04: trusted game-command authority") at `65dbbee` — board task A04 on GitHub issue #14.
- **Against:** `sonnet-a/a03` (PR #18, itself stacked on PR #13 and #15).
- **Reviewer:** a fresh subagent session, independent of the author, given only the branch/PR and the architecture invariants. The worktree was kept read-only and untouched for the review's whole duration (a prior review for a different slice was contaminated when the primary agent kept editing the same worktree mid-review; A05's work was deliberately moved to its own separate worktree this time).
- **Date:** 2026-09-14.
- **Result:** **No blocking finding.** All 10 required verification items passed with direct code-path tracing (not inferred from test result codes alone). One Medium and three Low findings, all fixed here with new regression tests.

## What was verified to hold (PASS, with evidence)

1. Capability resolution reads only `uidBindings/{uid}`, before any other check.
2. Platform authorization runs and can reject (traced control-flow, not just test-result inference) before template authorization or `parseCommand` ever execute.
3. Idempotency holds both directions: an accepted retry short-circuits without re-deciding/re-drawing; a rejected retry replays the identical stored `code`/`message`.
4. Concurrent duplicate `commandId`s produce exactly one event; the loser's seed is drawn but never used.
5. The random seed is generated once, outside the transaction callback, reused across internal Firestore retries, never persisted or logged.
6. Entity-ownership (`AllocateResults` on another actor's roll) and `expectedRevision` are both checked against the transaction's own live reads, never a client-asserted value.
7. Every live viewer's projection is freshly recomputed against post-command state using the reserved `"gm"`/`"table"` viewer-ID convention.
8. `parseAuthorityRecord` fails closed on every malformed field, including delegating `state` to the template's own parser; the transaction wrapper maps `RoomDataError` to `ROOM_DATA_INVALID`, never an unmapped internal error.
9. No log line or client-facing rejection ever carries the payload, template state, or random seed.
10. The PR's own stated scope reductions (no synthetic revision-gated/anonymous-actor fixture tests, no runtime write-count/size budget assertions) were judged genuinely low-risk for the current template's actual command set, not a claim taken at face value.

## Findings and dispositions

### Finding 1 (Medium, fixed). `TEMPLATE_VERSION_MISMATCH` was structurally unreachable

`authorizePlatform` was called with the room's own `authority.templateId`/`templateVersion` as *both* the "room" and the "command" arguments — the equality check was comparing the room's values against themselves, always vacuously true. Neither `WireCommandRequest` nor the canonical `RoomCommandRequest<TCommand>` carried a client-asserted template identity, so a stale/incompatible client build could never be rejected by this guard.

**Fix:** `WireCommandRequest` gains required `templateId`/`templateVersion` fields (the client's own build, e.g. `eatTheReichTemplate.manifest`), validated by `parseWireCommandRequest`. `authorizePlatform` is now called with `wire.templateId`/`wire.templateVersion` as the command's asserted identity, checked against the room's live `authority.templateId`/`authority.templateVersion` — the check now does real work. New emulator test: a request asserting a mismatched `templateVersion` is denied `TEMPLATE_VERSION_MISMATCH`.

### Finding 2 (Low, fixed). Projection assembly hand-duplicated `projectViewer`'s envelope shape

The per-viewer loop manually reconstructed the same seven-field wire envelope `packages/engine/src/projectViewer.ts` already builds, instead of calling it — field-for-field equivalent today, but an unreviewed duplicate that could silently drift if that function's shape ever changed, and a direct contradiction of the design plan's explicit "does not reimplement projection assembly."

**Fix:** the loop now calls `projectViewer(eatTheReichTemplate, decision.authority, viewer)` directly and writes its result. No behavior change (verified by the existing per-viewer-projection assertions in `gameCommand.test.ts` continuing to pass unmodified).

### Finding 3 (Low, fixed). `commandId`/`roomId` were only length-bounded, not character-restricted

`docs/ARCHITECTURE.md` section 8 states `commandId` is "validated as a UUID before use," but the actual check only bounded length, so a value containing `/` could reach `receiptIdFor`'s path construction and `requireRoomId`'s room-path construction unmangled. Traced as not an authorization bypass (a malformed path stays within `rooms/{roomId}`'s own subtree and cannot reach a sibling room or escape the collection), but it would surface as an unhandled exception (`internal`) instead of a clean `INVALID_REQUEST`, and it contradicted the architecture doc's stated invariant.

**Fix:** `commandId` is now validated against a UUID-shaped pattern (matching `crypto.randomUUID()`, the only value a real client sends) in `parseWireCommandRequest`. `roomId` is validated against the same character-safety pattern `packages/contracts/src/admission.ts`'s `ROOM_CODE_PATTERN` already uses for room codes (letters, digits, hyphens) rather than a strict UUID shape — deliberately kept lenient there to stay consistent with every existing emulator test fixture in this codebase (`admission.test.ts`, `createRoom.test.ts`, `roomRules.test.ts`, and this file's own `seedRoom`), none of which use real UUIDs for test room IDs; tightening it to require an exact UUID broke those legitimate fixtures during verification and was reverted to the character-class check. `packages/engine/test/roomCode.test.ts`... (n/a — commandId's UUID-shape test lives in the new regression tests below; roomId's leniency is verified by the full emulator suite continuing to pass with non-UUID fixture room IDs).

### Finding 4 (Low, fixed). Authority/bindings validation could throw before the `AUTH_REQUIRED` check

Capability resolution (`resolveCapability`) ran first, but the `member === null` check was deferred until *after* `authority/current` and the `bindings` collection were both read and parsed — so a corrupted authority document for a room an unauthenticated-for-that-room caller guessed the ID of would surface `ROOM_DATA_INVALID` instead of `AUTH_REQUIRED`, a minor "this room exists and is corrupted" disclosure to a caller with no standing to learn anything about the room at all.

**Fix:** the `member === null` check now runs immediately after `resolveCapability`, before the receipt, authority, or bindings reads. New emulator test: an unauthenticated-for-the-room caller against a room whose `authority/current.roomStatus` was corrupted after seeding still gets `AUTH_REQUIRED`, not `ROOM_DATA_INVALID`.

## Verification after the fixes

| Command | Result |
|---|---|
| `npm run check` (format, lint, typecheck, default tests) | pass; **321/321 tests across 43 files** |
| `npm run build` | pass (`apps/functions` esbuild bundle 91.6kb) |
| `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` | pass; **89/89** (16 `packages/testing` + 73 `apps/functions`, up from 87 before this fix pass: +2 new regression tests) |
| `git diff --check` | clean |

## Disposition

**A04 is ready for John's merge decision** (after PR #13, #15, and #18, which it stacks on). No finding touched a security-relevant guarantee (all 10 required verifications independently passed); the Medium finding closes a real gap in a defense that was previously inert, and the three Low findings close minor hardening/consistency gaps, all with regression tests. This review does not merge the PR; merge authority remains John's.
