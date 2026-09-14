# Phase 2 PR 2 independent review: Firestore data model and security rules

- **Reviewed branch:** `worktree-phase2-pr2` at `a40e7dc` ("Phase 2: enforce room data rules", on top of `bdc48b1` "docs: record Phase 2 admission and retention decisions")
- **Against:** `main` at `2b66088` (Phase 1A–1C, Phase 2 preflight, and Phase 2 PR 1 merged)
- **Scope authority:** `docs/PHASE_2_PLAN.md` PR 2; `docs/ARCHITECTURE.md` sections 8, 11, and 13; `AGENTS.md`
- **Review branch:** `claude/phase2-pr2-security-review-lexa32` (this record plus the two narrow remediations below, stacked on `a40e7dc`)
- **Date:** 2026-09-14
- **Result:** **Approved for merge with the remediations in this pass applied.** No blocking finding against the security boundary as written. Two narrow fixes were made on the review branch (S1 test-matrix gaps, S2 reserved-viewer hardening); four non-blocking findings are recorded for follow-on PRs; one process finding (S5, two competing PR 2 candidates) needs John's decision before either branch merges.

## What was reviewed

The full diff `origin/main...a40e7dc` (11 files): `firestore.rules`, `database.rules.json`, `packages/contracts/src/authority.ts` and its test, `packages/testing/src/builders.ts`, `packages/testing/test-emulator/roomRules.test.ts`, `templates/eat-the-reich/test/fixtures.ts`, `apps/web/src/repository/InMemoryRoomRepository.ts`, `docs/PHASE_2_DECISION_BRIEF.md`, `CLAUDE_HANDOFF.md`, `package-lock.json`. Every allow rule was read against the section 8 path contract and the section 11/13 role matrix, then probed adversarially against the emulator (a throwaway probe suite, not committed) before the findings below were written.

## Verification

All four gate commands were run on the unmodified `a40e7dc` first, then again on the review branch after the remediations.

| Command | On `a40e7dc` | On review branch |
|---|---|---|
| `npm run check` (format, lint, typecheck, default tests) | pass; 157/157 tests, 28 files | pass; 157/157 tests, 28 files |
| `npm run build` | pass (`vite build`) | pass |
| `npm run test:emulator` | pass; 10/10 (5 harness + 5 rules) | pass; 16/16 (5 harness + 11 rules) |
| `git diff --check origin/main...HEAD` | clean | clean |

Environment notes, none of which changed any repository file:

- This Linux sandbox has no `/opt/homebrew`; OpenJDK 21 was already on `PATH`, so the documented macOS `PATH=/opt/homebrew/opt/openjdk/bin:$PATH` prefix was not needed.
- The first `npm run test:emulator` attempt failed before any test ran: `firebase-tools` routed its own loopback call to the RTDB emulator (the rules upload) through the sandbox's egress proxy, which refused it, surfacing as `database.rules.json: Unable to parse JSON: ... "request bl..."`. The emulator jars had already been downloaded by then, so the suite was rerun with `HTTPS_PROXY`/`https_proxy`/`HTTP_PROXY`/`http_proxy` unset for that one invocation only (`env -u ...`). TLS verification was not disabled. This is the same `firebase-tools` `NO_PROXY` limitation the competing PR #10 documented independently; it is a sandbox artifact, not a rules defect.

## Security-boundary checks requested

| Check | Outcome |
|---|---|
| UID-binding authorization cannot expose another player's projection, receipt, or member event partition | **Holds.** `isOwnMember` compares `uidBindings/{auth.uid}.memberId` to the path (`projections/{viewerId}`, `events/member-{memberId}`) or to `resource.data.memberId` (receipts). Cross-player, GM→player, table→player, non-member, and unauthenticated reads are all denied, for single-document `get` and for collection `list` queries. Now covered by tests (S1). |
| GM/table reserved projections and GM events require exactly the right capability | **Holds after S2.** `hasCapability` compares `.capability` to the literal `"gm"`/`"table"` (matching `Capability` in `packages/contracts/src/template.ts`). The pre-fix rule additionally let the own-member branch reach `projections/gm` or `projections/table` if a binding's `memberId` were literally `gm`/`table` (probe-confirmed); S2 closes that. |
| `authority`, bindings, UID bindings, snapshots, room codes, and all direct Firestore writes denied to clients | **Holds.** Each is `allow read, write: if false`; every other path has `allow write: if false`; no `{document=**}` allow exists, so unmatched paths (including the `rooms/{roomId}` document itself and PR 1's `smoke/` collection) fall to Firestore's default deny. Now tested for player, GM, and table, for `get`, `list`, `set`, `update`, and `delete`. |
| RTDB presence writes limited to the authenticated UID; documented authenticated-read residual preserved | **Holds.** Write is allowed only at `presence/{roomId}/{uid}/{connectionId}` with `auth.uid === $uid`; unauthenticated, other-UID, and GM-on-player writes are denied. Read at `presence/{roomId}` is `auth != null`, exactly the section 8 residual, and the `presence` root and `/` stay unreadable so room IDs cannot be enumerated. The residual is now demonstrated with a signed-in non-member, not only a member (S1). |
| `AuthorityRecord`'s `roomStatus`/`gmMemberId` consistently represented | **Holds.** All five construction sites carry both fields (`packages/contracts/test/authority.test.ts`, `packages/testing/src/builders.ts`, `templates/eat-the-reich/test/fixtures.ts`, `apps/web/.../InMemoryRoomRepository.ts`; `packages/engine/src/runCommand.ts` spreads `...input.authority`, so the fields survive every accepted command). `RoomStatus` is exported via `export * from "./authority.js"`. The budget tests (`checkAuthorityBudget` in contracts; the template's representative fixture) run against records that include the new fields, so the persisted shape is what is measured. |
| Emulator tests form a meaningful allow/deny matrix without relying on rules-disabled contexts for authorization | **Holds after S1.** `withSecurityRulesDisabled` is used only to seed fixtures in `beforeAll`; every assertion runs through `authenticatedContext(uid)` or `unauthenticatedContext()`. The original five tests were correct but thin (S1). |
| No Phase 3+ scope, real project configuration, credentials, Functions, admission flow, or client reconnect/outbox | **Holds.** `.firebaserc`/`firebase.json` are unchanged (`demo-digitable`); no Functions, auth, or client repository code was added; `packages/engine` and `templates/eat-the-reich` sources are untouched. The decision brief now records the staging project identifier and regions John selected (see S7); that is a decision record, not configuration, and no code or config references it. |

## Findings

Severity is against the PR's stated scope (the client-facing security boundary), not against later PRs.

### S1 (Medium, remediated here). The allow/deny matrix omitted P0 proofs that the plan assigns to PR 2

`docs/PHASE_2_PLAN.md`'s matrix marks rows 5, 6, and 13 as first testable in PR 2, and section 13 requires "explicit allow/deny test matrix for every path and role." The five original tests did not exercise: the GM or table seat reading another member's projection, receipt, or private partition (row 13, "The GM cannot read another member's receipt", is a named required proof); a signed-in non-member or an unauthenticated client on any gated path except `meta/current`; `bindings`, `snapshots`, `roomCodes`, or the `rooms/{roomId}` document; any collection `list` query (the realistic client access pattern for receipts and event tails, and the place where Firestore's "rules are not filters" semantics most often surprise); `update`/`delete` writes; unauthenticated RTDB writes; or the presence root. The rules were correct for every one of these (probe-confirmed before the tests were written), so this is a coverage gap, not a defect, but a rule regression in any of them would have gone unnoticed.

**Remediation (applied):** `packages/testing/test-emulator/roomRules.test.ts` now has 11 tests covering every section 8 path for player, other player, GM, table, signed-in non-member, and unauthenticated roles, for `get`, `list`, `set`, `update`, and `delete`; RTDB presence for own/other/GM/unauthenticated writes and member/non-member/unauthenticated/root reads. 16/16 emulator tests pass.

### S2 (Low, remediated here). Own-member projection branch did not exclude reserved viewer IDs

`projections/{viewerId}` allowed `isOwnMember(roomId, viewerId)` for any `viewerId`, including the reserved `gm`/`table` documents. Member IDs are service-minted and `packages/contracts/src/ids.ts` already declares `RESERVED_VIEWER_IDS`, so a collision requires a service bug, but a `uidBindings` document with `memberId: "table"` and `capability: "player"` read `projections/table` in the probe. The reserved documents should be reachable only through the capability branch.

**Remediation (applied):** `firestore.rules` adds `isReservedViewer(viewerId)` and guards the own-member branch with `!isReservedViewer(viewerId)`. A regression test seeds the colliding binding and asserts it cannot read `projections/table` or `projections/gm` while remaining an ordinary member for shared reads.

### S3 (Medium, non-blocking, deferred to PR 7 with an architecture touch). A member cannot observe their own pending receipt through the rules

`receipts/{receiptId}` authorizes reads by `resource.data.memberId`. For a receipt that does not exist yet, `resource` is null, the expression errors, and the request is denied (probe-confirmed: a member's `get` of `receipts/player-a_command-9` fails). That is safe, and it matches section 8's current wording ("compare `.data.memberId` to the path's `{memberId}`"), but it means a client cannot `get`/`onSnapshot` its own `${memberId}_${commandId}` receipt while the command is still pending, which is exactly the "still-pending" observation matrix row 9 requires of PR 7's outbox reconciliation. PR 7 will need either a path-based own-prefix check combined with the data check (for example `receiptId[0:m.size() + 1] == m + "_" && (resource == null || resource.data.memberId == m)`, which also requires stating that member IDs never contain `_`), or a reconciliation channel that does not read the receipt document before it exists. Record the choice in `docs/ARCHITECTURE.md` section 8 when PR 7 lands; do not change the rule silently.

### S4 (Low, non-blocking, PR 5). RTDB presence has no `.validate` and accepts non-member writes under the writer's own UID

Any authenticated UID can create `presence/{anyRoomId}/{ownUid}/{connectionId}` with arbitrary nested data. This is consistent with section 8 ("RTDB cannot verify a Firestore binding"; clients map UIDs to members through authorized Firestore data, so a non-member node is simply never displayed), so it is the same accepted residual, stated for the write side. PR 5 should add a `.validate` bounding the connection payload's shape and size, and decide whether the write grant belongs at `{uid}` (one write clears all connections; the competing PR #10's choice) or at `{connectionId}` (this PR's choice, which forces per-connection `onDisconnect` removal). Either is acceptable for the boundary; the matrix should pin whichever PR 5 keeps.

### S5 (Process, needs John). Two divergent PR 2 candidates exist

`worktree-phase2-pr2` (`a40e7dc`, reviewed here; no PR opened) and the open draft PR #10 from `claude/phase-2-pr-2-firestore-159rmr` (`92be020`) implement the same plan item independently. PR #10 is broader: it adds typed contract shapes for every section 8 document (`packages/contracts/src/room.ts`), a 46-test matrix, a `{document=**}` catch-all deny, a `{uid}`-level RTDB write grant, and its own review-request record. Only one can merge; the other must be closed or rebased onto the winner. This review approves `a40e7dc` plus the review-branch remediations on its own merits. If PR #10 is chosen instead, it needs its own independent pass (its review request lists the adversarial checks it wants), and S2/S3 above apply to it verbatim (its own-member branch has the same reserved-ID gap; its receipt rule has the same pending-receipt behavior).

### S6 (Low, non-blocking, before PR 3/4). The rules depend on `uidBindings` field names that no contract type declares

`firestore.rules` reads `uidBindings/{uid}.memberId` and `.capability`, and `receipts/{receiptId}.memberId`; these shapes exist only in the emulator seed. `docs/PHASE_2_PLAN.md` PR 2 says "implement the data model exactly as resolved in section 8," and the handoff describes this PR as the data model, but only `AuthorityRecord` gained typed fields; `meta/current`, `members`, `bindings`, `uidBindings`, `receipts`, `snapshots`, and `roomCodes` have no TypeScript shape a Function could be checked against. When the PR 3 seat-creation transaction and PR 4 command Function write these documents, the field names the rules rely on must come from a contract type, not be re-typed by hand. PR #10's `room.ts` is one ready candidate; landing an equivalent before PR 3 is the recommendation.

### S7 (Informational). The decision brief records a real staging project identifier

`docs/PHASE_2_DECISION_BRIEF.md` (commit `bdc48b1`) records the join policy (code + passphrase), retention values (90-day archive prompt, no automatic deletion), and that staging lives in a named Firebase project with Firestore in `us-west1` and RTDB in `us-central1`. No repository configuration, environment file, or code references that project; `.firebaserc` still pins `demo-digitable`, and no credential appears anywhere. Recording the identifier as a decision is within `AGENTS.md`'s boundary (project IDs are not secrets). PR 3 must keep it in environment-specific configuration, never in a client bundle default or in `.firebaserc`'s `default`.

### S8 (Informational). Handoff accuracy

`CLAUDE_HANDOFF.md`'s PR 2 section is accurate for `a40e7dc` (157/157 default tests, 10/10 emulator tests). Its claim that the PR implements "the data model" overstates slightly per S6; the review branch's handoff update notes this. The documented emulator command's Homebrew `PATH` prefix is macOS-specific; the requirement is simply a JDK on `PATH`.

## What this review did not re-litigate

- The `uidBindings` reverse-index design (third-pass review R1) and `roomStatus`/`gmMemberId` placement on `authority/current` (R2): approved architecture decisions this PR implements.
- The join-policy and retention decisions recorded in the decision brief: John's product decisions, recorded as made.
- Anything gated on PR 3 onward (real project provisioning, admission, GM claim, Functions, recovery, presence wiring, reconnect/outbox), except where a PR 2 rule shape would force a later rule change (S3, S4).
