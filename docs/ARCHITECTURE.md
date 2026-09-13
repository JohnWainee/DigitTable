# DigiTable architecture specification

- **Status:** Approved direction; second-pass findings resolved
- **Date:** 2026-09-12
- **Deciders:** JohnWainee, implementation reviewer, security reviewer
- **Initial template:** *Eat the Reich*
- **Reference product:** Signal Bleed

## 1. Executive summary

DigiTable is a template-driven, mobile-first digital play surface for narrative tabletop RPGs—not a generic virtual tabletop. The platform supplies rooms, identity, synchronization, events, maps, encounters, journals, accessibility, safety controls, and presentation capabilities. A game template owns rules, terminology, content schemas, theme, and resolution choreography.

The first playable milestone is one opposed action completed by two players and one GM on separate devices. The action is submitted as an idempotent command, validated by trusted server code, stored as ordered events, projected to each authorized client, and rendered as accessible interface state plus optional synchronized theatre.

The proposed stack is an npm/TypeScript monorepo, React/Vite client, Firebase Anonymous Authentication, Firestore for authoritative room data, Realtime Database for presence, and Firebase Functions. SVG is the map format. DOM/CSS is the primary UI. PixiJS is reserved for later 2D presentation; React Three Fiber is deferred until the core flow is proven.

## 2. Requirements and constraints

### Product goals

- Keep calculation quiet but explanations and overrides available.
- Give players a simple phone surface and the GM a director console.
- Keep maps, lore, dossiers, and campaign history useful outside sessions.
- Support distinct games without a generic rules DSL or shared aesthetic.
- Recover cleanly from refreshes, retries, and ordinary network loss.
- Make every consequential interaction keyboard and screen-reader accessible.

### Non-goals for v1

- Tactical grid, measurement, line of sight, or initiative engine.
- Voice/video, marketplace, public content sharing, or native apps.
- Downloaded executable rules plugins.
- Full offline multiplayer resolution.
- Competitive anti-cheat or cryptographic dice fairness.

### Assumptions

- A room has 3–8 clients, one GM, and optionally one shared display.
- Multiplayer writes may wait for connectivity; cached state remains readable.
- Only content with documented distribution rights is stored. Tests use original placeholders.
- Signal Bleed is a behavioral reference; its no-build architecture is not inherited.

## 3. Quality targets

| Attribute | Initial target |
|---|---|
| UI response | Local feedback under 100 ms |
| Accepted command | Reflected under 750 ms p95 on a warm regional path; cold-path target measured before preview |
| Reconnect | No duplicate accepted action after refresh or retry |
| Accessibility | WCAG 2.2 AA target; equivalent non-animated path |
| Security | Hidden data never delivered to unauthorized clients |
| Compatibility | Platform/template/schema versions on persisted records |
| Performance | Useful shell under 3 seconds on a midrange phone |

Instrument these before promising production SLOs.

## 4. Architecture decisions

### ADR-001: Modular TypeScript monorepo

**Decision:** Use npm workspaces, TypeScript, React, and Vite. Keep the engine framework-independent.

```text
apps/
  web/                 React routes and UI
  functions/           trusted commands/admin operations
packages/
  contracts/           wire schemas, IDs, errors, versions
  engine/              authorization, decisions, reducers, projections
  testing/             fixtures and contract tests; emulator helpers arrive with realtime work
templates/
  eat-the-reich/       manifest, rules, theme, placeholder content
```

| Alternative | Benefit | Why not selected |
|---|---|---|
| Static self-contained HTML | Minimal deploy complexity | Poor multi-template modularity and testability |
| Next.js | Integrated server/runtime | More hosting coupling than this realtime app needs |
| SvelteKit | Strong client ergonomics | No decisive advantage over the assumed React ecosystem |

### ADR-002: Trusted command authority

**Decision:** Clients do not directly mutate authoritative game state. They send versioned, idempotent commands to a callable Firebase Function. The function authenticates the actor, performs platform authorization, and runs one Firestore transaction that reads the room authority document, checks/creates the actor-private receipt, invokes the shared pure engine, and atomically commits accepted events, revision, and viewer projections. RTDB is used only for ephemeral presence.

Firebase rules can protect paths and shapes, but should not implement game rules, allocation invariants, hidden-state decisions, or multipath transitions.

| Option | Complexity | Correctness | Decision |
|---|---:|---:|---|
| Direct RTDB writes | Low | Weak trust boundary | Reject for game state |
| Functions + RTDB authority | Medium | Cannot conditionally update separated paths | Reject |
| Functions + Firestore authority, RTDB presence | Medium | Conditional multi-document atomicity | Choose |
| Durable Object per room | Medium-high | Strong ordering | Revisit if contention/latency justifies it |

**Consequence:** Multiplayer writes require connectivity and may see cold starts. Cached reads remain available when Firestore web persistence is explicitly enabled with the multi-tab persistent cache manager. Client retries reuse the same command ID. Functions require a billing-enabled project; Firestore itself is available on the Spark plan, subject to its quotas. Staging and production may set one warm command-function instance if measured cold-path latency warrants the fixed cost.

The receipt check is inside the transaction. Each Function invocation generates one seed with `crypto.randomBytes` before entering the transaction and constructs a deterministic generator from it inside `DecisionContext`. The engine draws as many values as the transaction-read state requires. Firestore retries reuse the seed and therefore repeat the same internal draws. Concurrent invocations with the same command ID may generate different seeds, but only the transaction winner commits; each loser observes and returns the winner's stored result without exposing its seed or candidate values. Tests inject a fixed seed.

### ADR-003: Events plus materialized projections

**Decision:** Store immutable accepted events for audit/reconnect and materialized viewer projections for fast reads. This is pragmatic event sourcing, not permanent replay-from-genesis.

- Events use a server-assigned room sequence allocated in the same transaction as their receipt and projections.
- `roomRevision` counts accepted commands; `sequence` orders individual events, so one revision may contain several consecutive sequences.
- One complete projection document per viewer updates atomically with acceptance; shared content is an input to projection rather than a separately observed document.
- Periodic snapshots are archival copies of authority state that bound recovery and permit compaction; command execution never reconstructs current state from snapshots and event tails.
- Corrections are new events; accepted events are not edited by clients.

### ADR-004: Compile-time templates for v1

**Decision:** Templates are trusted TypeScript packages shipped with a release. Content is runtime-validated data; arbitrary remote JavaScript is prohibited.

A generic JSON rules DSL would be premature before two games establish common semantics. Adding a template therefore requires a release in v1.

### ADR-005: Semantic presentation

**Decision:** Authoritative state and decisions live in accessible DOM. Resolution Theatre consumes semantic scenes derived from accepted events. CSS/DOM is sufficient; PixiJS and later 3D progressively enhance it.

Animations can be reduced, skipped, late, or unavailable without blocking resolution.

### ADR-006: Firebase-first delivery

**Decision:** Use Firebase Auth, Firestore, RTDB presence, Functions, Hosting preview channels, and Emulator Suite initially. Keep Firebase behind adapters so static hosting or storage can change later.

## 5. System context

```text
┌────────────┐       HTTPS command        ┌────────────────────┐
│ Player app │ ─────────────────────────▶ │ Firebase Functions │
└─────┬──────┘                            │ trusted authority  │
      │ authorized realtime reads         └─────────┬──────────┘
┌─────▼────────────┐                                │ atomic update
│ Firebase Auth + │ ◀──────────────────────────────┘
│ Firestore       │
└─────▲────────────┘       RTDB: ephemeral presence only
      │ authorized realtime reads
┌─────┴──────────┐
│ GM and shared │
│ table views   │
└────────────────┘
```

No analytics SDK ships until a privacy-reviewed event inventory exists.

## 6. Client architecture

| Route | Audience | Purpose |
|---|---|---|
| `/` | Everyone | Lore landing and join/create entry |
| `/room/:roomId/player` | Player | Character, actions, private inbox, map, dossier |
| `/room/:roomId/gm` | GM | Director console, encounter control, hidden state |
| `/room/:roomId/table` | Shared display | Map, feed, reveals, theatre |
| `/library/:templateId` | Everyone | Authorized reference content outside sessions |

The role in the URL is presentation intent, not authorization.

### State layers

- Server cache: authorized projection and event tail; projections are authoritative.
- Domain state: normalized viewer projection, never reconstructed from partial events or mutated by views.
- Ephemeral UI: panels, draft choices, theatre/focus state.
- Durable preferences: motion, audio, theme, accessibility.
- Outbox: unsent commands with UUID, optional revision guard, and status. Pending UI may be optimistic; domain state is not.

Start with React context/hooks and an explicit external-store adapter. Add a broader state framework only when evidence warrants it.

### Stable errors

`AUTH_REQUIRED`, `ROLE_FORBIDDEN`, `REVISION_CONFLICT`, `ROLL_ALREADY_RESOLVED`, `TEMPLATE_VERSION_MISMATCH`, `ROOM_ARCHIVED`, and `RATE_LIMITED` map to actionable client states. Never expose stack traces or hidden payload details.

## 7. Contracts

```ts
interface DecisionContext<TState> {
  state: TState;
  // The same trusted, server-verified membership context passed to
  // authorizeGameAction. authorizeGameAction never receives `state`, so an
  // entity-scoped ownership check (e.g. "this roll belongs to this actor")
  // has nowhere else to live; `decide` needs both `state` and `actor`
  // together to make that check.
  actor: AuthorizedMemberContext;
  random: RandomSource;
}

interface GameTemplate<TState, TCommand, TEvent, TView> {
  manifest: TemplateManifest;
  schemas: TemplateSchemas<TState, TCommand, TEvent, TView>;
  initialState(input: InitialCampaignInput): TState;
  authorizeGameAction(ctx: AuthorizedMemberContext, command: TCommand): AuthorizationResult;
  decide(ctx: DecisionContext<TState>, command: TCommand): Decision<TEvent>;
  reduce(state: TState, event: TEvent): TState;
  // Returns the raw, viewer-scoped view, not the wire envelope: `TState`
  // alone carries no room revision or version metadata (those live one level
  // up, on the authority record), so a template cannot construct a complete
  // ViewerProjection from `state` alone. The platform's `projectViewer(...)`
  // wraps this into the full envelope below — the same split `decide` already
  // has, returning raw events that the platform wraps into EventEnvelopes.
  project(state: TState, viewer: ViewerContext): TView;
  explainPool(projection: ViewerProjection<TView>, input: PoolInput): PoolExplanation;
  validAllocations(projection: ViewerProjection<TView>, roll: VisibleRoll): AllocationOption[];
  theatre(event: TEvent, prefs: PresentationPreferences): TheatreScene | null;
  migrate(record: VersionedTemplateRecord): MigrationResult<TState>;
}

// Wraps a template's raw `project` output into the full wire envelope,
// pulling room revision and version metadata from the live authority record.
function projectViewer<TState, TView>(
  template: GameTemplate<TState, unknown, unknown, TView>,
  authority: AuthorityRecord<TState>,
  viewer: ViewerContext,
): ViewerProjection<TView>;
```

Platform code first checks room membership, seat capability, room status, payload bounds, and command-family guards; a template cannot weaken those checks. `authorizeGameAction`, `decide`, `reduce`, `project`, `explainPool`, and `validAllocations` are pure. Trusted handlers generate one cryptographic seed per invocation before entering the transaction and inject a deterministic generator into `DecisionContext`; emitted events capture only the committed faces, never the seed. Tests inject a fixed seed.

`Decision` assigns every emitted event a destination of `shared`, `gm`, or one or more member IDs. An event copied to more than one physical visibility partition retains one logical event ID, so storage document paths—not `eventId` alone—are unique. `project` returns one full projection for each viewer, including all shared content that viewer may see; each projection must remain below 64 KiB. This avoids cross-document revision tearing. At eight participants plus GM and table, a worst-case command rewrites under 640 KiB of projection data, within the Firestore commit limit. A 200-command session at the projection bound transfers roughly 13 MB to each continuously connected viewer. Revisit patches if measured bandwidth, latency, or cost exceeds the quality targets.

Neither addition above changes the wire format or the security model: `DecisionContext.actor` is the same trusted context `authorizeGameAction` already receives, just also passed to `decide`, and `projectViewer`'s wrapping step is exactly what building `ViewerProjection`'s `roomRevision`/version fields always required — this section originally left both implicit. They were identified while implementing the local vertical slice (PR 1) and are recorded as findings in `CLAUDE_HANDOFF.md`.

`explainPool` operates on a viewer projection and therefore cannot include hidden GM modifiers. `ActionRolled` carries the server-authoritative pool derivation, with hidden inputs redacted appropriately, so the receiving player can understand any difference from the pre-roll explanation.

```ts
interface CommandEnvelope<T> {
  commandId: string;
  roomId: string;
  templateId: string;
  templateVersion: string;
  expectedRevision?: number;
  issuedAtClient: string;
  payload: T;
}

type EventActor =
  | { kind: "member"; memberId: string }
  | { kind: "anonymous" }
  | { kind: "system" };

interface EventEnvelope<T> {
  eventId: string;
  commandId: string;
  sequence: number;
  roomRevision: number;
  templateId: string;
  templateVersion: string;
  schemaVersion: number;
  actor: EventActor;
  occurredAtServer: string;
  payload: T;
}
```

Actor identity and server time come from trusted context. Safety events always use `{ kind: "anonymous" }`. Events are stored physically under their authorized visibility path; a visibility string alone is not security.

Only scene transitions, encounter loads, GM-seat administration, and other explicitly enumerated room-wide transitions require `expectedRevision`. Entity-scoped actions use entity preconditions such as “roll remains unresolved.” Safety interrupts are never revision-gated.

## 8. Data model

```text
rooms/{roomId}/
  meta/current                template, status, gmMemberId, timestamps; denormalized, client-readable mirror
  authority/current           full TState, roomRevision, nextSequence, roomStatus, gmMemberId, versions; service-only
  members/{memberId}          capabilities, display name, join/last-seen times
  bindings/{memberId}         uid binding; service-only and client-unreadable
  uidBindings/{uid}           { memberId, capability } reverse index; service-only and client-unreadable
  projections/{viewerId}      one full document for memberId, gm, or table
  receipts/{receiptId}        memberId, commandId, status, accepted sequence, stable result
  snapshots/{sequence}        archival authority copy, checksum, versions; service-only
  events/shared/items/{sequence}
  events/gm/items/{sequence}
  events/member-{memberId}/items/{sequence}
roomCodes/{code}               roomId; service-only, rotatable

RTDB:
presence/{roomId}/{uid}/{connectionId}/
```

Firestore paths alternate collections and documents. `viewerId` is a stable member ID or the reserved `gm`/`table` identifier. `receiptId` is `${memberId}_${commandId}`, with `commandId` validated as a UUID before use; no hashing is required, and the document repeats both values for validation. Event visibility is a physical collection path, and each event document stores numeric `sequence` for ordering.

Every accepted-command transaction reads `authority/current`, the actor's `bindings/{memberId}`, and the actor-private receipt if present. It writes the updated authority document, receipt, emitted event documents, and affected complete viewer projections. `authority/current` is the sole live source of full `TState`; snapshots are copies for archive and recovery. Keep authority below a 256 KiB working budget and enforce both that budget and Firestore's 1 MiB document ceiling with representative campaign fixtures.

`authority/current` also carries `roomStatus` and `gmMemberId` directly, because it is already the transaction's serialization point: a command transaction that read only `meta/current` for these fields could miss a concurrent archive or GM-seat transfer committed by a different transaction (third-pass review R2). `meta/current` remains a denormalized, cheaply-readable mirror of the same two fields for clients that only need to display room status without subscribing to `authority/current` (which is service-only); the transaction that changes `roomStatus`/`gmMemberId` writes both documents atomically. This adds no read to the command transaction's existing read set (authority + binding + receipt).

Firestore rules cannot establish "is this UID a member of this room" from `bindings/{memberId}` alone, because bindings are keyed by member ID and rules cannot query a collection to find the matching one (third-pass review R1). `rooms/{roomId}/uidBindings/{uid}` is a service-only reverse index, `{ memberId, capability }`, written in the same transaction as `bindings/{memberId}` on join, rebind, and kick. Rules use one `get()` of `uidBindings/$(request.auth.uid)` for every membership-shaped check: room membership is `exists(...)`, a member's own projection/receipt/event-partition reads compare `.data.memberId` to the path's `{memberId}`, and `gm`/`table` projection and event-partition reads compare `.data.capability` to `'gm'`/`'table'`. `bindings/{memberId}` remains the service-only, member-keyed record Functions use to resolve a member's UID (for example, to validate `uidBindings` stays in sync). Functions use privileged service access but still execute platform authorization before template code.

RTDB rules enforce `$uid === auth.uid` for presence writes. RTDB cannot verify a Firestore binding, so room presence is deliberately limited to opaque room IDs plus online/offline connection state and is readable to an authenticated user who knows the room ID. Clients map UIDs to displayable members through authorized Firestore data. If that residual disclosure becomes unacceptable, replace presence tokens with short-lived signed room claims rather than duplicating authorization state across databases.

- Clients read only authorized projection/event/receipt paths. Firestore rules compare the service-only seat binding with `auth.uid`.
- Game commands go through Functions; direct client writes are limited to presence and explicitly safe preferences/drafts.
- Only service code writes roles, GM claims, accepted events, receipts, and projections.
- GM claim is transactional and member-seat-bound; transfer/release/recovery is an audited command.
- Human room codes are locators, not secrets.
- Player and GM data survive UID replacement because private data is keyed by stable room-scoped member ID.
- A `table` seat has shared-read capability and cannot issue game or safety commands. The GM admits it using a separate table code. It must receive a user gesture through an “Enable audio” control before sound playback.
- Draft choices remain local-only in v1.
- One authenticated identity holds one participant seat/capability per room in v1. Local development provides multi-role simulation rather than weakening this constraint.

When a seat is claimed, the service generates a recovery code with at least 64 bits of entropy—for example, 13 characters from a 32-symbol unambiguous alphabet. Codes are shown once, never placed in a URL, and only salted slow hashes are stored on a service-only path. An authenticated seat holder may rotate their own code; the GM may rotate a player's code for out-of-band handoff. The GM recovery code remains separately protected and can be rotated only by the bound GM.

Redemption is rate-limited per room and source IP and locks the room's recovery endpoint briefly after a small number of failures. Successful redemption transactionally rebinds the seat, invalidates the code, deletes the old UID's presence, and emits a GM-visible audit event naming only the seat. The old UID remains authenticated after redemption, so its still-valid `$uid === auth.uid` RTDB write rule can re-create a presence node on its next `.info/connected` tick until that session ends; this is harmless for presence display but is a known, accepted residual rather than a hard revocation (third-pass review R5). A stronger fix — revoking the old anonymous user's refresh tokens on redemption — is deferred until residual re-connection is observed to cause real confusion. The GM receives commands to rebind the seat back or kick the replacement. Neither audit records nor errors contain the code or either UID. Durable account linking may replace this mechanism later without rekeying campaign data.

Two recovery residuals are accepted rather than solved in v1 (third-pass review R3, R4): a GM who loses both their browser identity and their recovery code has no self-service recovery path, since only the bound GM may rotate the GM code; a v2 option is a player-majority reclaim after prolonged GM absence, or a designated backup GM seat. Symmetrically, a stolen GM code is a permanent campaign takeover, since redemption invalidates the code and every remedy command belongs to whoever holds the GM seat afterward; the only mitigation is the rotation already specified, plus advising GMs to rotate immediately after any out-of-band share.

### Proposed retention for review

- Active campaign events remain for campaign lifetime.
- Archived campaigns remain readable for 90 days, then prompt export/delete/retention.
- Presence expires on disconnect/TTL.
- Diagnostic logs omit content and use the shortest practical retention.

Do not automate deletion until product approves values and recovery behavior.
Because anonymous users have no contact channel, retention prompts are in-app on the next visit. A hard-delete policy and any additional grace period require product approval before automation.

## 9. Critical flows

### Join and GM claim

1. Obtain anonymous Firebase identity.
2. Submit room code and requested capability.
3. Function resolves the service-only code index, enforces App Check, validates room/template status, capacity, and admission policy, and applies IP/room throttles.
4. Create a stable member seat or transactionally claim the empty/same-member GM seat; show its initial rotatable recovery code once.
5. Subscribe only to authorized paths.

### Opposed action

1. Player composes an action; engine explains the pool.
2. `BeginAction` is validated against its relevant entity preconditions.
3. Server injects random dice and emits `ActionRolled`.
4. GM submits opposition pool inputs; the server validates them, generates the opposition faces, and emits `OppositionRolled`.
5. Player submits `AllocateResults` against that unresolved roll.
6. Server verifies actor, faces, targets, totals, and state.
7. One atomic acceptance emits consequences and updates projections.
8. Clients announce the result; theatre may animate it.

### Reconnect and idempotency

1. Restore identity and cached projection.
2. Subscribe from the last sequence/revision.
3. Read the authorized event tail for timeline and theatre only; per-path sequence gaps are expected.
4. Query the actor-private receipt for every outbox command ID.
5. Remove accepted commands; retry pending safe commands unchanged.
6. Surface stale choices that require rebuilding.

### Safety interrupt

Any player or GM can submit Pause, Fade/Veil, or Skip without a revision guard. The server emits a shared event with an anonymous actor and stores any receipt only in the submitting member's private partition. Every client immediately stops presentation; resumption is a separate command. Client-readable game data and application logs contain no actor UID/member ID for the safety action. Infrastructure request metadata can still correlate timestamps and client addresses with an interrupt; treat this as a residual risk, restrict access, and retain those logs for the shortest practical period. The actor sees no distinctive pending animation that other clients could correlate.

## 10. Resolution Theatre

```ts
interface TheatreScene {
  id: string;
  semanticLabel: string;
  priority: "ambient" | "result" | "interrupt";
  durationHintMs: number;
  cues: TheatreCue[];
  fallback: AccessibleScene;
}
```

- Scenes derive from accepted events, never speculative state.
- Clients synchronize by event ID and relative cue time, not exact frames.
- Late clients enter the semantic state or skip expired decoration.
- Safety interrupts preempt all queues.
- Local skip/reduced-motion never blocks game state.
- Asset manifests include license metadata.
- Audio requires user permission and visible controls.
- Cutaways never move focus without a user action and are dismissible through the same semantic control at every presentation level.
- Status and ordinary results use a polite live region; safety interrupts alone may use an assertive live region.
- `waiting-on-gm` is a semantic state announced once, not merely an animation phase.

## 11. Security model

Browser inputs, cache, room codes, roles, timestamps, and calculated pools are untrusted. Auth identity is necessary but insufficient; functions check membership and capability. Firestore rules independently prevent cross-viewer reads; RTDB rules isolate presence writes by UID while accepting the limited read disclosure documented in the data model.

| Threat | Mitigation |
|---|---|
| Player reads GM/private data | Separate paths, viewer projections, emulator denial tests |
| Client forges dice/result | Server randomness and validation |
| Retry duplicates consequence | Receipt check and effects in one Firestore transaction |
| Room-code guessing | Rotatable codes, admission policy, App Check, IP/room throttles |
| GM seat race | Trusted transaction |
| Malicious content | No remote executable templates; sanitize rich text; CSP/asset allowlist |
| Spam/oversized payload | Runtime schemas, room capacity, App Check, IP/room throttles |
| Hidden data in logs | Structured redaction; no narrative payload logging |

Complete a focused threat model before public release, especially recovery, moderation, deletion, and denial-of-service cost.

Before public preview, enable Firebase App Check with the web reCAPTCHA Enterprise provider for callable Functions, Firestore, RTDB, and Authentication after monitoring legitimate traffic. App Check reduces automated abuse but is not user authorization. Cap room membership at eight participant seats plus one table seat. Realtime milestone commands include kick, code rotation, and admission closure; anonymous bans are not durable and therefore do not replace code rotation.

## 12. Reliability, scale, and cost

- Co-locate Functions, Firestore, and RTDB where supported.
- Retry only idempotent IDs with exponential backoff and jitter.
- Atomically update event, actor-private receipt, revision, and projections in Firestore.
- Bound payload/event sizes and initial event history.
- Snapshot and archive before compaction.
- Cache the PWA shell and authorized assets; do not assume private caches are share-safe.
- Rate-limit commands, avoid presence hot loops, resize media, and configure budget alerts.

The expected 3–8 clients per room fit Firebase comfortably. Do not optimize for thousands of users in one room.

## 13. Testing and review

- **Unit:** platform authorization, `authorizeGameAction/decide/reduce/project`, dice/allocation invariants, migrations.
- **Contract:** client/function/stored-fixture schemas and every template.
- **Integration:** Emulator Auth, Rules, Functions, Firestore transaction atomicity/idempotency, and RTDB presence.
- **Component:** accessible interactions, focus, reduced motion, explanations.
- **E2E:** GM/player/table contexts at phone/tablet/desktop widths.
- **Resilience:** disconnect after submit, duplicate submit, stale revision, late join.
- **Security:** explicit allow/deny test matrix for every path and role.

Required vertical-slice proofs:

- Valid action resolves once and projects consistently.
- Duplicate command does not reroll.
- Two concurrent invocations with one command ID produce one event and identical responses.
- Player cannot allocate another player's roll or exceed successes.
- Player cannot read GM or another player's projection.
- Refresh does not resubmit an accepted outbox command or re-fire theatre for an already presented event ID.
- No client-readable path or application log identifies a safety-interrupt actor; infrastructure correlation risk is documented and access-controlled.
- The GM cannot read another member's receipt, and a safety decision emits no GM-partition copy carrying a member actor.
- A lost anonymous identity can recover its GM seat without moving private campaign data.
- Automated checks prove keyboard operation, accessible names/roles, focus behavior, live-region semantics, reduced motion, and axe rules.
- Manual milestone checks cover VoiceOver on iOS and NVDA on Windows for the complete action.

## 14. Environments and CI

| Environment | Purpose | Data |
|---|---|---|
| Local emulator | Default development/test | Disposable fixtures |
| Preview | Per-PR review | Synthetic content only |
| Staging | Multi-device playtest | Explicit test campaigns |
| Production | Approved release | Retention/export enforced |

Early CI runs formatting/lint/typecheck, unit/contract tests, and targeted Playwright accessibility checks. Emulator integration/rules tests enter with realtime work. Preview deploys, bundle budgets, production observability, and production approval gates enter before public preview rather than burdening the local engine PRs.

No production credentials or licensed source assets are committed. Firebase web configuration is public by design, but environment separation and rules remain mandatory.

## 15. Observability

- Structured server logs: command ID, hashed room ID, event type, latency, result code—never narrative/private payloads. Safety commands omit UID/member identity and use a non-correlatable command reference. Infrastructure request logs remain a documented correlation risk with restricted access and short retention.
- Metrics: acceptance/rejection, p50/p95 latency, reconnect success, duplicate suppression, active rooms, bandwidth/function cost.
- Alerts: sustained function failures, permission-denial anomalies, cost spikes, projection transaction failure.
- Sampled client reports include only redacted error codes and app/template versions.

## 16. Review gates and open decisions

### Before content implementation

- [ ] Confirm distribution rights and approved placeholder fixture.

### Before realtime implementation

- [ ] Confirm Firebase region and separate staging/production projects.
- [ ] Select room join policy: open code, code + passphrase, or invites.
- [ ] Approve retention/export/deletion behavior.

### Before public preview

- [ ] Enable and monitor App Check, then enforce it for public clients.
- [ ] Validate warm and cold command latency; choose whether to fund a warm instance.
- [ ] Complete VoiceOver/iOS and NVDA/Windows manual flows.

### After the local vertical slice

- [ ] Decide whether physical 3D dice enter v1.
- [ ] Decide whether durable account linking should replace recovery codes.
- [ ] Decide whether static hosting moves to Cloudflare.
- [ ] Select a second template to validate the extension boundary.

## 17. Implementation sequence

1. **PR 1 — scaffold and engine:** governance, workspaces, contracts, pure engine, initial template fixture, deterministic dice, pool/allocation queries, projection-isolation property tests.
2. **PR 2 — player surface:** React/Vite app, in-memory repository, player flow, phone-width keyboard/reduced-motion/axe checks.
3. **PR 3 — GM and shared views:** GM console, read-only table capability, multi-role local simulation, desktop-width tests.
4. Independently review and adjust contracts before persistence. Done: [`docs/reviews/2026-09-13-phase-2-preflight-review.md`](reviews/2026-09-13-phase-2-preflight-review.md) folds in the third-pass review's R1–R6 (this section and the recovery-code paragraphs above) and records new findings against the merged Phase 1A–1C code. [`docs/PHASE_2_PLAN.md`](PHASE_2_PLAN.md) splits step 5–6 below into reviewable PRs with an acceptance/failure-injection matrix, and [`docs/PHASE_2_DECISION_BRIEF.md`](PHASE_2_DECISION_BRIEF.md) covers the "before realtime implementation" decisions below.
5. Add Emulator adapters, rules, transactional Function authority, recovery, App Check monitoring, and integration tests.
6. Add reconnect/outbox and physical-device playtest.
7. Expand maps, encounters, dossiers, safety, and history.
8. Add presentation renderers and production hardening.

The next implementation PR covers step 1 only. It must not provision production Firebase, ingest licensed content, introduce React/PixiJS/Three.js, or design a generic rules DSL.

## 18. Revisit triggers

- Revisit Firestore authority only if measured cost, contention, or query requirements justify a different serialized store.
- Adopt a per-room serialized service only if measured contention/latency warrants it.
- Extract a template SDK only after a second game proves shared contracts.
- Add signed/public content packs only after rights, moderation, and update security are designed.
- Add durable accounts when they improve recovery and ownership enough to replace recovery codes.
