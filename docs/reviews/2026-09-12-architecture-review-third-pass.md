# Third-pass review: verification of second-pass resolution (PR #1 at `4ef83f5`)

- **Reviewed:** `codex/eat-the-reich-platform-plan` at `4ef83f5` ("docs: resolve second-pass architecture findings")
- **Against:** second-pass review at `868c75c` and `docs/reviews/2026-09-12-architecture-second-pass-resolution.md`
- **Date:** 2026-09-12

## Verdict

All twelve second-pass findings are closed in the canonical document, and the closures are substantive. PR #1 is ready to merge. One medium item remains, introduced by the way the new data model splits bindings from members; it belongs before realtime work (step 5) and does not affect the scaffold-and-engine PR. Four low items can be folded whenever the doc is next touched.

## Verification of N1–N12

| Finding | Closed? | Evidence in `4ef83f5` |
|---|---|---|
| N1 authority record | **Yes** | `authority/current` holds full `TState`, `roomRevision`, `nextSequence`; transaction read set is authority + binding + receipt; snapshots are archival only; 256 KiB budget and 1 MiB ceiling test. |
| N2 valid Firestore paths, one layout | **Yes** | Paths alternate collection/document (`events/shared/items/{sequence}` etc.); nested partitions chosen; sync summary now points to the canonical section instead of restating it. Rules sketch is present but incomplete (see R1). |
| N3 projection tearing | **Yes** | One `projections/{viewerId}` document per member, GM, and table; shared content is a projection input. |
| N4 RTDB presence rules | **Yes** | Presence keyed by UID with `$uid === auth.uid`; room-level read disclosure explicitly accepted as residual with a stated escalation path (signed room claims). |
| N5 recovery hardening | **Yes** | 64-bit minimum entropy with example alphabet, slow salted hashes, holder and GM rotation, no codes in URLs, per-room and per-IP throttles, lockout, presence cleanup, seat-only audit event, GM rebind/kick remedies. Two residuals worth stating (R3, R4). |
| N6 retry-stable randomness | **Yes** | One `crypto.randomBytes` seed per invocation, deterministic generator in `DecisionContext`, draws as needed, seed never persisted, fixed seed in tests. |
| N7 safety residuals | **Yes** | Claim narrowed to game data and application logs; infrastructure correlation documented with access and retention controls; GM-cannot-read-receipts and no-GM-copy tests added; no distinctive pending state. |
| N8 UID bindings hidden | **Yes** | `bindings/{memberId}` service-only and client-unreadable; `members/{memberId}` holds display data only. |
| N9 bandwidth stated | **Yes** | 640 KiB worst-case transaction, roughly 13 MB per viewer per 200-command session, revisit trigger tied to quality targets. |
| N10 routes by room ID | **Yes** | `/room/:roomId/...`; codes are join inputs only. |
| N11 factual fixes | **Yes** | Firestore on Spark, Functions need billing; persistence opt-in with multi-tab cache manager; safety controls scoped to player/GM surfaces; `testing` fixture-only until realtime. |
| N12 explanation vs derivation | **Yes** | `explainPool` over viewer projection; `ActionRolled` carries redacted server derivation. |

## Remaining findings

### R1. Rules cannot establish room membership from a UID (Medium, before realtime)

**Where:** §8 rules paragraph ("allow a signed-in client to read `members`, its own projection and receipts, and visibility partitions granted by its client-unreadable binding").

**Problem.** The sketch works where the path already contains a member ID: `projections/{memberId}` and `events/member-{memberId}/items` can `get()` `bindings/{memberId}` and compare `uid`. It does not work for anything gated on "is this UID a member of this room at all", because bindings are keyed by member ID and rules cannot query. That affects:

- `events/shared/items` reads (every member, but only members);
- `members/{memberId}` reads, which as written are open to any signed-in user who knows a room ID, and room IDs now appear in every URL and on the table screen;
- `projections/table`, whose viewer ID is the reserved `table` with no stated binding to check;
- `projections/gm`, which needs `meta/current.gmMemberId` then `bindings/{gmMemberId}`, two `get()` calls (fine, but say so).

**Proposed edit.** Add a service-only reverse index `rooms/{roomId}/uidBindings/{uid}` with `{ memberId, capability }`, written in the same transaction as `bindings/{memberId}` on join, rebind, and kick. Rules then use one `get()` for everything: membership is `exists(uidBindings/$(request.auth.uid))`, own-projection is `get(uidBindings/$(request.auth.uid)).data.memberId == viewerId`, and GM/table access is `get(...).data.capability == 'gm'` or `'table'`. Keep `bindings/{memberId}` for service code. Add `tableMemberId` to `meta/current` or rely on the capability field; either works, pick one.

### R2. Room status is checked outside the transaction (Low)

`meta/current` holds `status` and `gmMemberId`; the command transaction reads `authority/current`, the binding, and the receipt. A room archived or a GM seat transferred concurrently is not seen by an in-flight command. Either read `meta/current` inside the transaction or move `status` and `gmMemberId` into `authority/current`, which is already the serialisation point.

### R3. GM lockout residual should be stated (Low)

The GM code can be rotated only by the bound GM. A GM who loses both browser identity and code has no recovery; the doc should say so explicitly under residual risks, and note the v2 option (player-majority reclaim after prolonged GM absence, or a designated backup GM seat) so it is not rediscovered later.

### R4. GM-code theft is a permanent takeover (Low)

Redemption invalidates the code and the remedy commands belong to whoever holds the GM seat. A stolen GM code therefore transfers the campaign with no legitimate-holder remedy. State it as residual; the practical mitigation is the rotation already specified plus advising GMs to rotate after any out-of-band share.

### R5. Old UID can re-create presence (Low)

On redemption the service deletes the old UID's presence node, but the old client is still authenticated and its `$uid === auth.uid` write rule still passes, so typical presence code will re-create the node on the next `.info/connected` tick until that session ends. Harmless for presence, but "deletes the old UID's presence" should read "deletes it and tolerates re-creation until the old session expires", or the recovery flow should also revoke the old anonymous user's refresh tokens.

### R6. Pick one `receiptId` scheme (Nit)

"A collision-free encoding or hash" leaves the client guessing how to compute it for receipt lookup on reconnect. `${memberId}_${commandId}` with the command ID validated as a UUID is enough and needs no hashing.

## Recommendation

Merge PR #1. Fold R1 before realtime work begins; it changes the rules design and the join transaction's write set, neither of which the scaffold-and-engine PR touches. R2–R6 ride the next documentation edit.
