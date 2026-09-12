# Second-pass review: DigiTable architecture after resolution (PR #1 at `f956e59`)

- **Reviewed:** `codex/eat-the-reich-platform-plan` at `f956e59` ("docs: resolve architecture review findings")
- **Against:** first-pass review at `4324ecb` and `docs/reviews/2026-09-12-architecture-review-resolution.md`
- **Date:** 2026-09-12

## Verdict

The revision is a real fix, not a paper one. Every first-pass finding is addressed in the canonical document, and the big three (F1 atomicity, F2 safety anonymity, F3 UID-keyed state) are closed by design changes rather than caveats. The Firestore-authority decision is the right one and the transactional story is now implementable.

The move to Firestore introduces new gaps that the resolution's own checklist anticipated but the document does not yet close. One is significant enough to settle before PR 1, because it changes the engine contract:

- **N1.** There is no authoritative current-state document. The transaction is described as reading "the room authority document," but the data model contains only `meta`, per-viewer projections, events, receipts, and periodic snapshots. `decide` and `reduce` need full `TState`; nothing in the model stores it.

Three more should be settled before realtime work (step 5), and the rest are small.

Disposition of the resolution checklist is at the end.

Severity key as before: **High** = a stated guarantee is unmet or a contract must change; **Medium** = costs a rewrite if not fixed before the affected PR; **Low** = clarity or cheap hardening.

---

## High

### N1. No authoritative current-state document; transaction read set is undefined

**Where:** ADR-002 ("runs one Firestore transaction that reads the room authority document"), §8 data model, ADR-003 ("Periodic snapshots bound replay").

**Problem.** The engine contract needs `TState` to run `decide` and `reduce`. The data model stores projections (per viewer, lossy), events (append-only), and snapshots (periodic, service-only). Reconstructing `TState` inside every transaction from the latest snapshot plus events since it means an unbounded query inside the transaction, and Firestore server transactions lock every document they read. That is the exact performance and contention profile the doc is trying to avoid.

**Proposed edit.** Add `rooms/{roomId}/authority` (one document, service-only): full `TState`, `roomRevision`, `nextSequence`, and version fields. Every command transaction reads exactly three things: `authority`, the actor's receipt, and the actor's `members` binding; it writes `authority`, the receipt, the emitted events, and the projections. Snapshots become periodic copies of `authority` for archive and compaction, not a reconstruction source. State a size bound for `authority` (Firestore caps a document at 1 MiB; a campaign with dossiers, map discovery, and eight characters should be budgeted, e.g. 256 KiB, with a test that the placeholder campaign stays under it). This is a contract change: PR 1's engine fixtures should include an `authority` record shape, so settle it first.

---

## Medium

### N2. The Firestore layout is written as an RTDB tree, and the two documents disagree again

**Where:** §8 (`rooms/{roomId}/projections/players/{memberId}/{...}`, `events/shared/{sequence}/{event}`), `DATA_AND_SYNC_MODEL.md` (`projections/{shared|gm|player-memberId}`, `events/{visibility-sequence}`, `receipts/{memberId-commandId}`).

**Problem.** Firestore paths alternate collection and document; `events/shared/{sequence}/{event}` is not a valid path without naming the intermediate collection. The summary doc solves this by flattening into composite document IDs, the canonical doc does not, and the two choices have different consequences for rules and indexes:

- Flat `events/{visibility-sequence}` with a `visibility` field needs a `list` rule over `resource.data.visibility` plus a composite index for `where visibility in [...] orderBy sequence`.
- Nested `events/shared/items/{sequence}` gives path-based rules with no field checks and no composite index, at the cost of one listener per visibility.

This is the same class of inconsistency as F9, reintroduced. The resolution's checklist item 8 asks the reviewer to confirm consistency; it currently fails.

**Proposed edit.** Pick the nested form (path-based rules are easier to test in the emulator and match "visibility is a physical partition"), write the exact collection/document paths in §8, and delete the layout block from `DATA_AND_SYNC_MODEL.md` in favour of a pointer. Add a six-line rules sketch showing the `get()` on the member binding so the rule budget (10 `get()` calls per single-document request, 20 for queries) is visibly respected.

### N3. Separate shared and private projection documents can tear on the client

**Where:** §8 projections, §6 state layers ("projections are authoritative").

**Problem.** A player listens to `projections/shared` and `projections/players/{memberId}`. Firestore delivers document snapshots independently; there is no cross-document snapshot consistency for separate listeners. After one command the client can briefly hold shared state at revision N+1 and private state at revision N, which is exactly the "player sees a resolved roll but still has allocation controls" class of bug.

**Proposed edit (preferred).** Store one projection document per viewer: `projections/{memberId}` contains everything that member may see, shared content included; `projections/gm` and `projections/table` likewise. "Shared" becomes an input to `project`, not a stored document. Benefits: one listener and one rule per viewer, atomic per-viewer reads, and the 64 KiB bound already assumed per projection still holds. Cost: shared content is duplicated up to ten times per command, which at the stated bound is under 640 KiB per transaction, well inside Firestore's 10 MiB commit limit (the old 500-write limit no longer applies).

**Alternative.** Keep the split but stamp `roomRevision` on every projection document and have the client render only when all its projections agree. This is more client code and still leaves a visible stall.

### N4. RTDB presence rules cannot verify a Firestore member binding

**Where:** §8 (`RTDB: presence/{roomId}/{memberId}/{connectionId}`), §11 ("RTDB rules isolate presence writes and reads").

**Problem.** RTDB security rules cannot read Firestore. A rule at `presence/{roomId}/{memberId}` can check `auth.uid` but cannot check that this UID is bound to `memberId`, nor that the UID is a member of the room at all. As written, any authenticated user can write presence under any member ID in any room, and read every room's presence.

**Proposed edit.** Two workable options, both to be stated:

- **Custom claims.** The join Function sets `rooms: { [roomId]: memberId }` as a custom claim (1000-byte cap on claims, so also cap rooms per identity or prune on leave) and the client forces a token refresh after join. RTDB rules then check `auth.token.rooms[$roomId] === $memberId`. Consequence: a rebinding on recovery leaves the old UID's token valid until refresh, up to an hour, so the recovery flow must also delete the old presence node and Firestore rules must not rely on claims (keep `get()` on the binding there for immediate revocation).
- **Key presence by UID.** `presence/{roomId}/{uid}/{connectionId}` with `$uid === auth.uid`; clients map UID to member through the Firestore `members` collection they can already read. Simpler, but room-level read access is still unverifiable in RTDB, so presence is readable to anyone who knows a room ID. Since room IDs are opaque and presence is only online/offline, that may be acceptable; say so if chosen.

### N5. Recovery codes need reissue, entropy, and takeover semantics

**Where:** §8 recovery paragraph, §9 join step 4.

**Problems.**

- The code is shown once at seat claim. On a phone it will be lost. If the GM loses both the code and the browser identity, the campaign is locked, which is the F3 failure with one more step.
- No entropy, rate limit, or lockout is specified for redemption. Salted hashes are the right storage, but a short human-typed code with unbounded attempts is guessable through the Function.
- Redemption "revokes the prior binding." A leaked code is therefore a seat takeover that also evicts the legitimate holder. The audit event helps only if the GM sees it and has a remedy.

**Proposed edits.**

- Allow an authenticated seat holder to reissue their own code at any time (rotating the old one), and allow the GM to reissue any player's code from the console for out-of-band handoff. GM-assisted reissue covers the common "lost phone" case without the player having stored anything.
- Specify: at least 64 bits of entropy (for example 13 characters from a 32-symbol alphabet), redemption rate-limited per room and per IP, lockout after a small number of failures per room, and codes never placed in URLs.
- On redemption: delete the old UID's presence, emit an audit event visible to the GM naming the seat (not the code, not either UID), and give the GM a one-command "rebind back / kick" remedy.

---

## Low

- **N6. Randomness under retry is under-specified.** ADR-002 pre-generates "candidate random values" before the transaction, but the number of dice needed depends on state read inside it. Replace with: generate one seed per invocation using `crypto.randomBytes`, inject a deterministic generator derived from that seed into `DecisionContext`, and have the engine draw as needed. Retries reuse the seed; tests inject a fixed seed. Faces persisted in events stay the audit record.
- **N7. Safety anonymity residuals.** The claim "operational logs contain no actor UID/member ID" is stronger than the platform can deliver: Cloud Run request logs for the callable carry timestamps and client addresses that correlate with `occurredAtServer` on the shared event. State this as a residual risk with short retention and restricted access rather than claiming absence. Also add two explicit tests: the GM cannot read other members' receipts, and a safety `Decision` emits no GM-partition copy carrying a member actor. Client UI should not render a distinct "sending" state for safety commands that only the actor sees.
- **N8. Member documents expose UID bindings to every room member.** `members/{memberId}` holds display name (needed by all) and the UID binding (needed only by rules and service code). Rules `get()` can read a client-unreadable document, so move the binding to a service-only `bindings/{memberId}` document.
- **N9. Full-projection rewrites have a bandwidth cost worth stating.** Firestore listeners receive the whole document on change, unlike RTDB deltas. With one merged 64 KiB projection per viewer and a 200-command session, each phone downloads roughly 13 MB. Acceptable, but write the number down so the "patch projections need a measured need" trigger has a threshold.
- **N10. Routes use the rotatable room code.** §6 keeps `/room/:code/...`. Once codes rotate for admission control, bookmarks and reconnect URLs break. Use the opaque `roomId` in routes; codes appear only on the join screen.
- **N11. Small factual and consistency items.** Firestore is available on the Spark plan; only Functions require billing (ADR-002 consequence). Firestore offline persistence is opt-in in the web SDK and needs the multi-tab cache manager, which §2's "cached state remains readable" assumes. `UX_RESOLUTION_THEATRE.md` still says safety controls are "reachable at all times" while §8 says the table seat cannot issue them; add "on player and GM surfaces." `packages/testing` in PR 1 should hold fixtures only; emulator helpers arrive with step 5.
- **N12. Client pool explanation can differ from the server's.** `explainPool` runs over the viewer projection, so hidden GM modifiers are invisible to it by design. Say so, and require `ActionRolled` to carry the server's derivation so the player can see why the pool differed from the explanation.

---

## Resolution checklist, verified

| Item | Result |
|---|---|
| 1. Transaction document boundaries and rules exposure | **Not yet.** Read set is undefined until an authority document exists (N1); layout is not a valid Firestore path spec and differs between documents (N2). Write count is fine under either layout. |
| 2. Retries cannot repeat observable randomness | **Yes**, with the seed refinement in N6. |
| 3. Recovery codes do not create a second credential leak | **Partly.** Storage is right; reissue, entropy, rate limits, and takeover remedy are missing (N5). |
| 4. No safety actor identifier via payloads, receipts, logs, timing, correlation | **Mostly.** Payload, receipts, and application logs are clean. Infrastructure request logs remain a correlator; claim should be narrowed (N7). |
| 5. Platform authorization cannot be weakened by a template | **Yes.** `authorizeGameAction` receives an already-authorized member context. |
| 6. Player, GM, table capabilities map to routes and rules | **Yes**, except routes keyed by rotatable code (N10) and one stale line in the UX doc (N11). |
| 7. Three PRs independently testable, no premature packages | **Yes.** `platform` and `presentation` removed; `testing` should be fixtures-only in PR 1 (N11). |
| 8. No remaining RTDB-authority, UID-keyed, client-replay, or broad-PR claims | **One remaining:** the two data layouts disagree (N2). Everything else is clean. |

## Recommendation

Approve the architectural direction. Fold N1, N3, and N6 into `docs/ARCHITECTURE.md` before PR 1 because they shape the engine contract (`authority` record, per-viewer `project` output, seeded `DecisionContext`). Fold N2, N4, and N5 before step 5 (realtime). The Low items can ride either edit.
