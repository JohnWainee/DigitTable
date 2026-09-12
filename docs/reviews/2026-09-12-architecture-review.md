# Independent review: DigiTable architecture proposal (PR #1)

- **Reviewed:** `codex/eat-the-reich-platform-plan` at `81993ef` (PR JohnWainee/DigitTable#1)
- **Scope:** `docs/ARCHITECTURE.md` as the canonical proposal, cross-checked against `CLAUDE_HANDOFF.md`, `README.md`, and the five supporting docs in `docs/`
- **Date:** 2026-09-12
- **Not reviewed:** `JohnWainee/signal-bleed` (outside this session's repository access). Claims about Signal Bleed behaviour are taken from the docs as written.

## Verdict

The proposal is well organised and most of its big calls are right: a pure engine with server-injected randomness, idempotent commands, materialised per-viewer projections stored on physically separate paths, compile-time templates, DOM as the source of truth for presentation, and a hard "no licensed content" rule. Those should stand.

It should **not** be approved as-is. Three findings are severe enough that implementing the doc literally would produce a system that either cannot deliver the guarantees it promises or violates them:

1. The atomic "read revision, run engine, commit everything" step in ADR-002/ADR-003 is not implementable on Realtime Database as described. RTDB has no conditional multi-path write, so the design's central correctness claim has no mechanism behind it (F1).
2. Safety interrupts are specified as participant-anonymous, but the event envelope makes `actorId` mandatory and safety events land on the shared path. As written, every client learns who pressed Pause (F2).
3. All private state is keyed by the anonymous Firebase UID, which is the one identifier the platform cannot recover. Combined with an unrecoverable GM seat, a cleared browser or a week of Safari inactivity can lock a whole campaign (F3).

Below: findings by severity with concrete edits, then answers to the seven questions the handoff asked, then a proposed re-scoping of the first implementation PR.

Severity key: **Critical** = the design cannot meet a stated guarantee; **High** = a stated guarantee is violated or a likely lockout/leak; **Medium** = will cost a rewrite if not fixed before code; **Low** = clarity, consistency, or cheap hardening.

---

## Critical

### F1. Atomic revision-checked commit is not available on RTDB as designed

**Where:** ADR-002 ("reads the current revision, invokes the shared pure engine, and atomically commits command receipt, accepted events, revision, and projections"), ADR-003 ("Shared, GM, and player projections update atomically with acceptance"), §12 ("Atomically update event, receipt, revision, and projections"), §8 data model.

**Problem.** The data model spreads the things that must change together across many sibling paths (`meta/revision`, `commands/{id}`, `events/{visibility}/{seq}`, `projections/{viewer}`). RTDB offers two write primitives:

- Multi-path `update()`: atomic across paths, but **unconditional**. There is no "only if `meta/revision` still equals N".
- `transaction()`: conditional with optimistic retry, but on **one location only**.

Cloud Functions scale horizontally, so two commands for the same room can execute concurrently on two instances. Both read revision N, both run the engine, both issue a multi-path update. The second silently overwrites the first's projections and can write a second event at the same sequence, or the two interleave. Nothing in the doc prevents this. The same race defeats idempotency: a mobile client retrying a command while the first attempt is still in flight yields two executions, each with **different server-generated dice**, and both may commit. "Duplicate command does not reroll" (§13) is a required vertical-slice proof, and the design as written fails it.

The alternatives table in ADR-002 misframes Firestore as "revisit if query needs dominate." The reason to consider Firestore here is that its transactions do read-then-conditional-write across multiple documents, which is exactly the primitive this design needs. Queries are irrelevant.

**Proposed edit (pick one and write it into ADR-002, with the failure mode above stated explicitly):**

- **Option A, stay on RTDB, one transactional node.** Define `rooms/{roomId}/state` as the single transactional unit. It holds `revision`, `nextSequence`, a bounded `receipts` map (commandId to sequence/error), and all viewer projections. Every command runs as one `transaction()` on that node: the callback checks the receipt map (return unchanged if present), checks `expectedRevision`, runs `decide`/`reduce`/`project`, and returns the new node value. RTDB retries the callback on contention, so per-room serialisation is guaranteed. Events and snapshots live outside the node, are append-only, keyed by sequence, and written **after** the transaction commits; because they are derivable from the committed receipt and deterministic given the stored faces, a crash between the two writes is repairable by a "backfill missing events for sequences below `nextSequence`" step on the next command or a scheduled sweep. Visibility rules apply per child of `state/projections/...`, so client reads are still isolated. Cost: the whole node is fetched per command, so bound projection size (tens of KB is fine at 3–8 clients).
- **Option B, Firestore for authority, RTDB for presence only.** Room doc + per-viewer projection docs + event docs written in one Firestore transaction with the room doc's revision as the guard. Keep RTDB solely for `presence` and `onDisconnect`. This is the smallest conceptual change and gets real multi-document CAS, at the price of two databases and Firestore's per-document read billing on listeners.
- **Option C, per-room single writer (Durable Object or equivalent).** The table rates this "medium-high" complexity, but it is the only option where per-room ordering is free rather than emulated. It replaces RTDB fan-out with WebSockets from the object, so it is a different stack, and Cloudflare hosting is already an open decision in §16.

Recommendation: Option A if the team wants to keep the Firebase-only footprint, Option B if it wants the simplest correct transactional story. Either way, the receipt check must be **inside** the transaction, not a read before it.

### F2. Safety interrupts leak the actor

**Where:** §7 `EventEnvelope` (mandatory `actorId`, `commandId`), §9 "Safety interrupt" ("participant-anonymous safety state... Actor identity is never shown"), §8 events stored under visibility paths, §13 has no proof for this.

**Problem.** A Pause/Veil/Skip must reach every client, so it is a shared-path event. Every shared-path event carries `actorId` and `commandId`. `commands/{commandId}` is also client-readable for receipt lookup. Any client can therefore read who pressed Pause, directly from the envelope or by joining the command ID. This is a privacy failure in the one feature whose entire value is anonymity.

**Proposed edits:**

- Make `actorId` optional in `EventEnvelope`, or add `actor: { kind: "member", id } | { kind: "anonymous" } | { kind: "system" }`, and state that safety events are emitted with `anonymous`.
- Do not write a client-readable receipt for safety commands, or store receipts under the actor's private path (see F7) so only the actor can see their own.
- Server logs for safety commands must not include the UID (extend §15).
- Add to §13 required proofs: "No client-readable path contains the identity of a safety-interrupt actor."
- Remove `expectedRevision` from safety commands (see F6); a Pause must never fail with `REVISION_CONFLICT`.

---

## High

### F3. Anonymous UID is the primary key for everything that must survive

**Where:** §8 (`members/{uid}`, `projections/players/{uid}`, `events/players/{uid}`, `meta/gmUid`), §9 join/GM claim, §16 defers "durable account linking" to after the vertical slice, §18 "add durable accounts when recovery needs outweigh anonymous-play simplicity."

**Problem.** Anonymous Firebase identity lives in browser storage. Clearing site data destroys it. Safari's tracking prevention can purge script-writable storage after seven days without interaction, and the product is explicitly mobile-first with multi-session campaigns. When a player's UID is lost:

- their character binding, private inbox, and private event history are orphaned under the old UID;
- the GM seat, if it was theirs, is held forever by a UID nobody controls. The doc's only exit is "transfer/release is an audited command," which the locked-out GM cannot issue.

Deferring accounts is fine. Deferring the **data-model decision** is not, because rekeying every private path from UID to something else is a migration of live campaigns.

**Proposed edits:**

- Introduce a room-scoped `memberId` (seat) as the key for `members/`, `projections/players/`, `events/players/`, and `meta/gmSeat`. Store the binding `members/{memberId}.uid`. Rules check `root.child(.../members/$memberId/uid).val() === auth.uid`. Recovery then means rebinding a seat to a new UID, which moves no data.
- Define a recovery path now, even if it is crude for v1: a per-room recovery code shown to the GM at creation and stored hashed under a service-only path, or GM presence timeout plus player-majority claim, or both. Say which.
- Add to §13 proofs: "A GM whose identity is lost can recover the seat without service intervention."

### F4. Client-side "rebuild projections from events" and "optimistic result" are not possible under the visibility model

**Where:** `docs/DATA_AND_SYNC_MODEL.md` ("Clients rebuild projections and reconcile optimistic state", "Local projection applies an optimistic result when safe"), ARCHITECTURE §9 Reconnect ("Subscribe from the last sequence/revision. Apply missing events in order."), §6 state layers ("Domain state: normalized engine projection").

**Problem.** `reduce` takes full `TState`; `project` takes full `TState`. A client only ever sees shared plus its own events and can never hold full state, so it cannot run either. Client-visible events are useful for the timeline and theatre, not for reconstructing state. Reconnect must therefore re-read the **projection** and use the event tail only for "what did I miss" presentation. Similarly, `decide` needs randomness and hidden state, so there is almost nothing a client can optimistically apply beyond local UI intent.

**Proposed edits:**

- Rewrite §9 Reconnect: (1) restore identity, (2) re-subscribe to own projections (authoritative), (3) subscribe to event tail from last seen sequence for timeline/theatre only, (4) reconcile outbox by receipt.
- Delete or narrow the optimistic-update claim to "pending command shown as pending; no speculative state changes."
- Fix `DATA_AND_SYNC_MODEL.md` to match, or delete it (see F9).

### F5. Concurrent duplicate submit is the common case, not the edge case

**Where:** ADR-002 "Client retries reuse the same command ID", §9 Reconnect step 4–5, §11 "Retry duplicates consequence: command receipts and atomic idempotent acceptance."

**Problem.** Covered mechanically under F1, but it deserves its own line because the doc treats idempotency as "check receipt, then execute." With horizontally scaled Functions, check-then-execute is a TOCTOU race. A phone that times out at 10 s and retries while the first invocation is at 11 s of cold start is the normal mobile path.

**Proposed edit:** state the invariant explicitly: "the receipt is created inside the same transaction that commits the effects; a second execution observes the receipt inside its own transaction and returns the stored result." Add a §13 resilience test: two concurrent invocations of the same command ID against one room produce exactly one event and identical responses.

---

## Medium

### F6. Command envelope makes `expectedRevision` mandatory but the conflict policy says most commands should not be gated

**Where:** §7 `CommandEnvelope.expectedRevision: number`; `DATA_AND_SYNC_MODEL.md` "GM transitions and encounter loads require the current room revision. Independent private updates merge by entity/field."

**Edit:** make `expectedRevision` optional and list which command families are revision-gated (scene transitions, encounter load, GM claim) and which are guarded by entity state instead (allocation is guarded by "roll is unresolved", not by room revision). Safety commands are never gated.

### F7. Receipts are readable by the wrong people, and errors can carry hidden detail

**Where:** §8 `commands/{commandId}/ status, accepted sequence, error, received time`, §9 "Query receipt for every outbox command ID."

**Problem.** For reconnect the client must read receipts, so they need a read rule. A rule keyed only on room membership lets any member read every other member's command outcomes, including error strings, which for a rejected allocation could describe hidden state.

**Edit:** store receipts under the actor's private partition (`projections/players/{memberId}/receipts/{commandId}` or a sibling), or add `actorMemberId` to the receipt and gate reads on it. Specify that `error` is a stable code only, never a message with payload detail (§6 already says this for responses; extend it to stored receipts).

### F8. The template interface is missing the methods the UI docs rely on, and `authorize` is in the wrong layer

**Where:** §7 `GameTemplate`; `TEMPLATE_ARCHITECTURE.md` ("UI may request a pool explanation or valid allocations, but may not reimplement mechanics"); `CLAUDE_HANDOFF.md` required tests for "dice interpretation and allocation invariants."

**Problems.**

- No `explainPool` / `validAllocations` (or generic `query`) method exists. Without it, the client either reimplements rules (forbidden) or calls a Function for every "Why?" tap (slow, and an odd thing to route through command authority). These are pure functions over the **player's projection**, so they belong on the template and run client-side.
- `Decision<TEvent>` must specify visibility per emitted event (shared / gm / member, possibly a set of members). The doc says events are stored on visibility paths but nothing in the contract says where a decision's events go. Also state whether one logical event visible to two named players is stored twice (it must be, under this layout) and that `eventId` is therefore not unique across paths.
- `authorize` sits entirely on the template. Membership and role checks are platform concerns and security-critical; a second template author should not be able to forget them. Split: platform checks membership/role/room status before the template's `authorize` refines game-specific permission.
- `project(state, viewer)` is called once per viewer per accepted command, so a room of eight writes up to ten projections per command. Say whether `project` returns a full projection or a patch, and bound projection size (this also matters for F1 Option A).

### F9. The supporting docs contradict the canonical doc

**Where:** four places.

| Topic | ARCHITECTURE.md | Other doc |
|---|---|---|
| Package layout | `packages/{contracts,engine,platform,presentation,testing}`, `apps/{web,functions}` | `TEMPLATE_ARCHITECTURE.md`: `packages/{platform,rules-runtime,presentation}`, `apps/web`, no functions |
| Data layout | `rooms/{roomId}/{meta,members,projections/…,events/{vis}/…,commands,snapshots,presence}` | `DATA_AND_SYNC_MODEL.md`: `rooms/{roomCode}/{meta,shared,players,gm,commands,events/{seq},presence}` |
| Command transport | HTTPS call to a Function (§5 diagram) | `DATA_AND_SYNC_MODEL.md` step 1 reads as a client-written command record |
| Stack | R3F deferred, Functions central | `README.md` lists PixiJS and R3F as the stack and omits Functions entirely |

**Edit:** either delete `DATA_AND_SYNC_MODEL.md` and `TEMPLATE_ARCHITECTURE.md` (their content is a subset of ARCHITECTURE.md) or reduce each to a two-line pointer. Fix README's stack list to name Functions and mark R3F as deferred. A reviewer of PR #1 who reads the "concise summaries" first, as the handoff's reading order suggests, will learn the wrong data model.

### F10. Latency target and cold-start consequence contradict each other

**Where:** §3 "Accepted command reflected under 750 ms p95"; ADR-002 consequence "may see cold starts."

**Problem.** A resolve is three sequential Function calls (`BeginAction`, opposition, `AllocateResults`). At the traffic level of a small playtest (a handful of rooms, minutes between commands) most calls hit a cold instance. Node cold starts on Cloud Functions are routinely one to several seconds. Either the target is false or the doc must budget `minInstances` for the command function (Blaze plan, a few dollars a month) and say so.

**Edit:** state the mitigation (`minInstances: 1` for the command function in staging/production) and its cost, or lower the target to "warm-instance p95" and add a separate cold-start target. Also note that Functions require the Blaze plan; the doc never says this.

### F11. Room-code enumeration and abuse are not actually mitigated by "per-UID throttles"

**Where:** §11 threats "Room-code guessing" and "Spam/oversized payload: per-UID/room throttles."

**Problem.** With anonymous auth, a UID costs nothing; per-UID rate limits are meaningless against anyone who wants to bypass them. The standard Firebase mitigation for this exact situation, App Check, is not mentioned. The join Function is also the cheapest place to burn the project's money.

**Edits:** add App Check (reCAPTCHA Enterprise or the web provider) as a requirement before any public preview; rate-limit join by room and by IP at the Function; bound members per room (the doc assumes 3–8 but sets no cap); define kick/ban as GM commands in the first realtime milestone, with the caveat that bans on anonymous identities are trivially evaded and the room code must be rotatable.

### F12. Snapshots contain hidden state but sit on a path with no stated access rule

**Where:** §8 `snapshots/{sequence}/ shared state, checksums, versions`, ADR-003.

**Problem.** A snapshot that lets the server bound replay must be a full `TState`, which includes GM-only and per-player state. If it is client-readable at all, it leaks. If it is only "shared state", it cannot serve its purpose.

**Edit:** snapshots are full state, service-only (no client read rule). Clients never need them because they read projections (F4).

### F13. The "table" display is a role that exists in routes but nowhere else

**Where:** §6 `/room/:code/table`, §2 "optionally one shared display", §8 members roles, §9 join flow.

**Edit:** add `table` to the member roles, say it holds an anonymous identity like any member, is admitted by the GM (or by a separate table code), reads only shared projections and shared events, and cannot issue game commands except safety. Note the audio-autoplay constraint: a display nobody has touched cannot play synchronised sound until someone taps an "enable audio" control on it (§10 says audio requires permission; say where that lands for the table).

### F14. Screen-reader equivalence is asserted but not verifiable by the proposed CI

**Where:** §3 "equivalent non-animated path", §13 "Keyboard/screen-reader/reduced-motion route completes the same action", §14 "Playwright accessibility smoke tests", handoff "Support keyboard, screen reader, and reduced-motion paths."

**Problems.**

- Playwright can verify keyboard operability, accessible names/roles, focus order, and axe rule violations. It cannot verify a screen-reader experience. The doc should say what CI proves and what is a manual VoiceOver (iOS, since mobile-first) and NVDA/JAWS check per milestone.
- The README's promise that shared events "temporarily turn every connected screen into one synchronized presentation" is a focus-stealing hazard for AT users (and a WCAG 3.2 concern). State: cutaways never move focus without a user action; announcements go through a polite live region; only safety interrupts may use an assertive region; every cutaway is dismissible via the same control that appears in the reduced level.
- The UX state machine's `rolling-player` / `rolling-opposition` states are presentation states, not server states. The step where the player waits an indeterminate time for the GM needs a real "waiting on GM" semantic state with a live-region announcement, or the screen-reader user hears nothing until the reveal.

---

## Low

- **L1. Two counters, one meaning.** `sequence` and `roomRevision` both appear on every event. If every accepted command bumps revision and every event bumps sequence, say that; otherwise drop one.
- **L2. Event keys must sort.** If event keys are integers under 2^31 RTDB sorts them numerically; if they ever become strings or exceed that, `orderByKey().startAt()` breaks. Specify zero-padded fixed-width keys.
- **L3. Per-path gaps.** Because one room sequence is spread across visibility paths, a client cannot detect a missed event by contiguity. That is fine once F4 makes projections authoritative; say so to stop someone building gap detection.
- **L4. Randomness source.** Say `crypto.randomInt`, not `Math.random`. It costs nothing, and "not cryptographic fairness" in the non-goals should not be read as permission to use a weak PRNG.
- **L5. "Refresh during theatre does not replay consequences"** (§13) is mis-stated. Consequences are server-side and cannot be replayed by a refresh. The real proofs are "refresh does not re-submit an accepted outbox command" and "theatre for an already-presented event ID does not re-fire."
- **L6. Opposed-action step 4 is ambiguous.** "GM accepts/submits opposition; server emits `OppositionRolled`." Who supplies the opposition dice, and is that a roll or a declared value? The vertical slice will have to decide; the doc should.
- **L7. Retention prompts to nobody.** "Archived campaigns remain readable for 90 days, then prompt export/delete" assumes a contactable owner. Anonymous identities have no contact channel. Either the prompt is in-app on next visit with a hard delete after a further grace period, or retention waits for accounts.
- **L8. Safe client-writable drafts** (§8) have no path in the model. If drafts live under a GM-readable path they leak unsent choices. Put them under the member's private partition or keep them local-only.
- **L9. Room ID versus room code.** Routes use `:code`, the model uses `{roomId}`, the sync doc uses `{roomCode}`. If they are the same string, rotating a room code (F11) is impossible. Use an opaque `roomId` and a `roomCodes/{code} → roomId` index that only the join Function reads.
- **L10. One role per UID per room** blocks a GM from testing as a player on the same device. Acceptable for v1; note it.

---

## Answers to the handoff's seven questions

1. **Functions + RTDB versus direct writes or Firestore.** Rejecting direct client writes for game state is correct. Functions as authority is correct. RTDB as the transactional store is **not** correct as written (F1). Either restructure around one transactional node or move authoritative writes to Firestore and keep RTDB for presence. The doc also does not consider the third transport, RTDB-write-triggered Functions, which gives the client an offline outbox for free at the cost of at-least-once, unordered delivery; worth one line explaining why the HTTPS callable was chosen instead.
2. **Atomic event/receipt/projection updates and sequence allocation.** Not achievable as specified (F1, F5). Sequence allocation needs a transaction on the same node as the receipt and revision, or a Firestore transaction.
3. **Shared, GM-only, per-player path isolation.** The layout is sound. Gaps: receipts (F7), snapshots (F12), drafts (L8), the table role (F13), and safety-actor leakage through the envelope (F2).
4. **Anonymous-auth recovery and room-join threats.** Recovery is unaddressed and the UID-as-key choice makes it expensive later (F3). Join threats are listed but the mitigations do not work against anonymous identities without App Check and per-room/IP limits (F11).
5. **Does the template contract expose too much before a second game?** The *interface* is close to right-sized and is missing methods rather than carrying too many (F8). The *package plan* is premature: `packages/platform` with session/map/encounter/journal interfaces has no second consumer and should not be created in the first PR. `packages/presentation` can start as a folder inside `apps/web`.
6. **DOM/Resolution Theatre accessibility equivalence.** The principle is right; the CI claim overreaches and the synchronized-takeover feature needs explicit focus and live-region rules (F14).
7. **Delivery scope for a small team.** The document is sized for a team with dedicated SRE and security reviewers. Sections 12, 14, and 15 (four environments, budget alerts, bundle budgets, per-PR preview deploys, observability metrics and alerting) are correct eventually and irrelevant to the next three PRs. The handoff's "first implementation PR" is itself several weeks of work in one review unit. See the proposed split below.

## Proposed first-PR re-scope

Replace the handoff's single vertical-slice PR with three, each independently reviewable:

1. **Scaffold and engine.** Workspaces, TypeScript, Vitest, ESLint, formatting. `packages/contracts`, `packages/engine`, `templates/eat-the-reich` with placeholder content. Pure `decide`/`reduce`/`project` plus `explainPool`/`validAllocations` for one opposed action, with deterministic injected dice. Unit tests including the allocation invariants and a property test that a projection for member A never contains member B's private state. No React, no Playwright.
2. **Player surface.** Vite + React app, in-memory repository, the player flow only (compose, explain, roll, wait, allocate, confirm) with keyboard and reduced-motion support and axe checks in Playwright at phone width. No GM or table view.
3. **GM and shared views.** GM console for the same action, table view, multi-role local simulation, desktop-width Playwright.

Keep everything the handoff forbids forbidden (no production Firebase, no licensed assets, no Three.js, no rules DSL). Before PR 1, fold F1, F2, F3, F6, F8, and F9 into `docs/ARCHITECTURE.md`; those change the contracts that PR 1 would otherwise encode.

## What is good and should not be changed

- Server-injected randomness with faces captured in events; deterministic tests.
- Physically separate visibility paths rather than a visibility flag.
- Compile-time TypeScript templates; no remote executable rules.
- Explicit refusal to automate GM judgment or dice allocation.
- Placeholder-only content until rights are documented.
- Versioning fields on every persisted record, template-owned migrations.
- Safety controls reachable at all times and preempting presentation.
- The open-decisions list in §16 is honest and correctly gated.
