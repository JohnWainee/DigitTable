# DigiTable architecture specification

- **Status:** Proposed for review
- **Date:** 2026-09-12
- **Deciders:** JohnWainee, implementation reviewer, security reviewer
- **Initial template:** *Eat the Reich*
- **Reference product:** Signal Bleed

## 1. Executive summary

DigiTable is a template-driven, mobile-first digital play surface for narrative tabletop RPGs—not a generic virtual tabletop. The platform supplies rooms, identity, synchronization, events, maps, encounters, journals, accessibility, safety controls, and presentation capabilities. A game template owns rules, terminology, content schemas, theme, and resolution choreography.

The first playable milestone is one opposed action completed by two players and one GM on separate devices. The action is submitted as an idempotent command, validated by trusted server code, stored as ordered events, projected to each authorized client, and rendered as accessible interface state plus optional synchronized theatre.

The proposed stack is an npm/TypeScript monorepo, React/Vite client, Firebase Anonymous Authentication, Realtime Database, and Firebase Functions. SVG is the map format. DOM/CSS is the primary UI. PixiJS is reserved for 2D presentation; React Three Fiber is deferred until the core flow is proven.

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
| Accepted command | Reflected under 750 ms p95 on a warm regional path |
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
  platform/            session/map/encounter/journal interfaces
  presentation/        semantic theatre model and render adapters
  testing/             fixtures, contract tests, emulator helpers
templates/
  eat-the-reich/       manifest, rules, theme, placeholder content
```

| Alternative | Benefit | Why not selected |
|---|---|---|
| Static self-contained HTML | Minimal deploy complexity | Poor multi-template modularity and testability |
| Next.js | Integrated server/runtime | More hosting coupling than this realtime app needs |
| SvelteKit | Strong client ergonomics | No decisive advantage over the assumed React ecosystem |

### ADR-002: Trusted command authority

**Decision:** Clients do not directly mutate authoritative game state. They send versioned, idempotent commands to a Firebase Function. The function authenticates the actor, reads the current revision, invokes the shared pure engine, and atomically commits command receipt, accepted events, revision, and projections.

Firebase rules can protect paths and shapes, but should not implement game rules, allocation invariants, hidden-state decisions, or multipath transitions.

| Option | Complexity | Correctness | Decision |
|---|---:|---:|---|
| Direct RTDB writes | Low | Weak trust boundary | Reject for game state |
| Functions + RTDB | Medium | Strong for v1 | Choose |
| Firestore transactions | Medium | Strong | Revisit if query needs dominate |
| Durable Object per room | Medium-high | Strong ordering | Revisit if contention/latency justifies it |

**Consequence:** Multiplayer writes require connectivity and may see cold starts. Cached reads remain available. Client retries reuse the same command ID.

### ADR-003: Events plus materialized projections

**Decision:** Store immutable accepted events for audit/reconnect and materialized viewer projections for fast reads. This is pragmatic event sourcing, not permanent replay-from-genesis.

- Events use a server-assigned room sequence.
- Shared, GM, and player projections update atomically with acceptance.
- Periodic snapshots bound replay and permit compaction.
- Corrections are new events; accepted events are not edited by clients.

### ADR-004: Compile-time templates for v1

**Decision:** Templates are trusted TypeScript packages shipped with a release. Content is runtime-validated data; arbitrary remote JavaScript is prohibited.

A generic JSON rules DSL would be premature before two games establish common semantics. Adding a template therefore requires a release in v1.

### ADR-005: Semantic presentation

**Decision:** Authoritative state and decisions live in accessible DOM. Resolution Theatre consumes semantic scenes derived from accepted events. CSS/DOM is sufficient; PixiJS and later 3D progressively enhance it.

Animations can be reduced, skipped, late, or unavailable without blocking resolution.

### ADR-006: Firebase-first delivery

**Decision:** Use Firebase Auth, RTDB, Functions, Hosting preview channels, and Emulator Suite initially. Keep Firebase behind adapters so static hosting or storage can change later.

## 5. System context

```text
┌────────────┐       HTTPS command        ┌────────────────────┐
│ Player app │ ─────────────────────────▶ │ Firebase Functions │
└─────┬──────┘                            │ trusted authority  │
      │ authorized realtime reads         └─────────┬──────────┘
┌─────▼────────────┐                                │ atomic update
│ Firebase Auth + │ ◀──────────────────────────────┘
│ Realtime DB     │
└─────▲────────────┘
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
| `/room/:code/player` | Player | Character, actions, private inbox, map, dossier |
| `/room/:code/gm` | GM | Director console, encounter control, hidden state |
| `/room/:code/table` | Shared display | Map, feed, reveals, theatre |
| `/library/:templateId` | Everyone | Authorized reference content outside sessions |

The role in the URL is presentation intent, not authorization.

### State layers

- Server cache: authorized projection and event tail.
- Domain state: normalized engine projection, never mutated by views.
- Ephemeral UI: panels, draft choices, theatre/focus state.
- Durable preferences: motion, audio, theme, accessibility.
- Outbox: unsent commands with UUID, revision, and status.

Start with React context/hooks and an explicit external-store adapter. Add a broader state framework only when evidence warrants it.

### Stable errors

`AUTH_REQUIRED`, `ROLE_FORBIDDEN`, `REVISION_CONFLICT`, `ROLL_ALREADY_RESOLVED`, `TEMPLATE_VERSION_MISMATCH`, `ROOM_ARCHIVED`, and `RATE_LIMITED` map to actionable client states. Never expose stack traces or hidden payload details.

## 7. Contracts

```ts
interface GameTemplate<TState, TCommand, TEvent> {
  manifest: TemplateManifest;
  schemas: TemplateSchemas<TState, TCommand, TEvent>;
  initialState(input: InitialCampaignInput): TState;
  authorize(ctx: CommandContext, command: TCommand): AuthorizationResult;
  decide(ctx: DecisionContext<TState>, command: TCommand): Decision<TEvent>;
  reduce(state: TState, event: TEvent): TState;
  project(state: TState, viewer: ViewerContext): ViewerProjection;
  theatre(event: TEvent, prefs: PresentationPreferences): TheatreScene | null;
  migrate(record: VersionedTemplateRecord): MigrationResult<TState>;
}
```

`decide` and `reduce` are pure. Trusted handlers inject random values into `DecisionContext`; emitted events capture the generated faces. Tests inject deterministic values without requiring seeded live play.

```ts
interface CommandEnvelope<T> {
  commandId: string;
  roomId: string;
  templateId: string;
  templateVersion: string;
  expectedRevision: number;
  issuedAtClient: string;
  payload: T;
}

interface EventEnvelope<T> {
  eventId: string;
  commandId: string;
  sequence: number;
  roomRevision: number;
  templateId: string;
  templateVersion: string;
  schemaVersion: number;
  actorId: string;
  occurredAtServer: string;
  payload: T;
}
```

Actor identity and server time come from trusted context. Events are stored physically under their authorized visibility path; a visibility string alone is not security.

## 8. Data model

```text
rooms/{roomId}/
  meta/                       template, status, revision, gmUid, timestamps
  members/{uid}/              role, display name, join/last-seen times
  projections/
    shared/{...}
    gm/{...}
    players/{uid}/{...}
  events/
    shared/{sequence}/{event}
    gm/{sequence}/{event}
    players/{uid}/{sequence}/{event}
  commands/{commandId}/       status, accepted sequence, error, received time
  snapshots/{sequence}/       shared state, checksums, versions
  presence/{uid}/{connectionId}/
```

- Clients read only authorized projection/event paths.
- Game commands go through Functions; direct client writes are limited to presence and explicitly safe preferences/drafts.
- Only service code writes roles, GM claims, accepted events, receipts, and projections.
- GM claim is transactional and UID-bound; transfer/release is an audited command.
- Human room codes are locators, not secrets.

### Proposed retention for review

- Active campaign events remain for campaign lifetime.
- Archived campaigns remain readable for 90 days, then prompt export/delete/retention.
- Presence expires on disconnect/TTL.
- Diagnostic logs omit content and use the shortest practical retention.

Do not automate deletion until product approves values and recovery behavior.

## 9. Critical flows

### Join and GM claim

1. Obtain anonymous Firebase identity.
2. Submit room code and requested role.
3. Function validates room/template status.
4. Create player membership or transactionally claim the empty/same-UID GM seat.
5. Subscribe only to authorized paths.

### Opposed action

1. Player composes an action; engine explains the pool.
2. `BeginAction` is validated at the current revision.
3. Server injects random dice and emits `ActionRolled`.
4. GM accepts/submits opposition; server emits `OppositionRolled`.
5. Player submits `AllocateResults` against that unresolved roll.
6. Server verifies actor, faces, targets, totals, and state.
7. One atomic acceptance emits consequences and updates projections.
8. Clients announce the result; theatre may animate it.

### Reconnect and idempotency

1. Restore identity and cached projection.
2. Subscribe from the last sequence/revision.
3. Apply missing events in order.
4. Query receipt for every outbox command ID.
5. Remove accepted commands; retry pending safe commands unchanged.
6. Surface stale choices that require rebuilding.

### Safety interrupt

Any member can submit Pause, Fade/Veil, or Skip. The server emits participant-anonymous safety state. Every client immediately stops presentation; resumption is a separate command. Actor identity is never shown and is retained only if operationally necessary.

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

## 11. Security model

Browser inputs, cache, room codes, roles, timestamps, and calculated pools are untrusted. Auth identity is necessary but insufficient; functions check membership and role. RTDB rules independently prevent bypass and cross-viewer reads.

| Threat | Mitigation |
|---|---|
| Player reads GM/private data | Separate paths, viewer projections, emulator denial tests |
| Client forges dice/result | Server randomness and validation |
| Retry duplicates consequence | Command receipts and atomic idempotent acceptance |
| Room-code guessing | Join policy, optional passphrase/invite, rate limits |
| GM seat race | Trusted transaction |
| Malicious content | No remote executable templates; sanitize rich text; CSP/asset allowlist |
| Spam/oversized payload | Runtime schemas, limits, per-UID/room throttles |
| Hidden data in logs | Structured redaction; no narrative payload logging |

Complete a focused threat model before public release, especially recovery, moderation, deletion, and denial-of-service cost.

## 12. Reliability, scale, and cost

- Co-locate Functions and RTDB where supported.
- Retry only idempotent IDs with exponential backoff and jitter.
- Atomically update event, receipt, revision, and projections.
- Bound payload/event sizes and initial event history.
- Snapshot and archive before compaction.
- Cache the PWA shell and authorized assets; do not assume private caches are share-safe.
- Rate-limit commands, avoid presence hot loops, resize media, and configure budget alerts.

The expected 3–8 clients per room fit Firebase comfortably. Do not optimize for thousands of users in one room.

## 13. Testing and review

- **Unit:** `authorize/decide/reduce/project`, dice/allocation invariants, migrations.
- **Contract:** client/function/stored-fixture schemas and every template.
- **Integration:** Emulator Auth, Rules, Functions, RTDB atomicity/idempotency.
- **Component:** accessible interactions, focus, reduced motion, explanations.
- **E2E:** GM/player/table contexts at phone/tablet/desktop widths.
- **Resilience:** disconnect after submit, duplicate submit, stale revision, late join.
- **Security:** explicit allow/deny test matrix for every path and role.

Required vertical-slice proofs:

- Valid action resolves once and projects consistently.
- Duplicate command does not reroll.
- Player cannot allocate another player's roll or exceed successes.
- Player cannot read GM or another player's projection.
- Refresh during theatre does not replay consequences.
- Keyboard/screen-reader/reduced-motion route completes the same action.

## 14. Environments and CI

| Environment | Purpose | Data |
|---|---|---|
| Local emulator | Default development/test | Disposable fixtures |
| Preview | Per-PR review | Synthetic content only |
| Staging | Multi-device playtest | Explicit test campaigns |
| Production | Approved release | Retention/export enforced |

CI runs formatting/lint/typecheck, unit/contract tests, emulator integration/rules tests, production build/bundle budgets, and Playwright accessibility smoke tests. Preview deploy follows automated checks; production requires manual approval.

No production credentials or licensed source assets are committed. Firebase web configuration is public by design, but environment separation and rules remain mandatory.

## 15. Observability

- Structured server logs: command ID, hashed room ID, event type, latency, result code—never narrative/private payloads.
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

### After the local vertical slice

- [ ] Decide whether physical 3D dice enter v1.
- [ ] Decide whether durable account linking/recovery is needed.
- [ ] Decide whether static hosting moves to Cloudflare.
- [ ] Select a second template to validate the extension boundary.

## 17. Implementation sequence

1. Add governance (`AGENTS.md`, review rule, handoff log) and tooling.
2. Scaffold workspaces and CI without production credentials.
3. Implement contracts and pure in-memory engine with fixtures.
4. Build one local multi-role opposed-action vertical slice.
5. Independently review and adjust contracts before persistence.
6. Add Emulator adapters, Rules, Function authority, and integration tests.
7. Add reconnect/outbox and physical-device playtest.
8. Expand maps, encounters, dossiers, safety, and history.
9. Add presentation renderers and production hardening.

The next implementation PR covers steps 1–4 only. It must not provision production Firebase, ingest licensed content, introduce Three.js, or design a generic rules DSL.

## 18. Revisit triggers

- Move from RTDB if query/index requirements dominate subscriptions.
- Adopt a per-room serialized service only if measured contention/latency warrants it.
- Extract a template SDK only after a second game proves shared contracts.
- Add signed/public content packs only after rights, moderation, and update security are designed.
- Add durable accounts when recovery needs outweigh anonymous-play simplicity.
