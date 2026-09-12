# Claude implementation handoff

- **Status:** Phase 1A (scaffold and pure engine) implemented and passing all required checks locally; awaiting PR review and merge
- **Branch:** `codex/phase-1a-scaffold-engine`
- **PR:** opened against `main`; see repository PR list (this session cannot self-merge)
- **Last updated:** 2026-09-12 by Claude

## Mission

Build DigiTable as a reusable narrative-RPG play surface, with *Eat the Reich* as the first template and Signal Bleed as a behavioral reference.

Signal Bleed's useful patterns are room codes, GM-seat ownership, shared/GM/private state separation, lore outside sessions, local resilience, broadcasts, safety-minded play, and deliberate deploy controls. Do not port its self-contained HTML/no-build architecture.

## Current state

- Repository is initialized and connected to GitHub.
- Architecture work (PR #1, PR #2) is merged to `main`.
- **Phase 1A (scaffold and pure engine) is implemented** on branch `codex/phase-1a-scaffold-engine`, scoped exactly to `docs/IMPLEMENTATION_ROADMAP.md`'s Phase 1A and `docs/ARCHITECTURE.md` section 17's PR 1:
  - `AGENTS.md` added at the repo root.
  - npm workspace monorepo scaffolded: TypeScript (strict), ESLint 9 flat config with `typescript-eslint` type-checked rules plus `no-restricted-imports` guards against `react`/`firebase`/`three`, Prettier, and per-package Vitest configs wired through a root `vitest.workspace.ts`.
  - `packages/contracts`: branded IDs, stable error codes, `CommandEnvelope`/`EventEnvelope`, the bounded `AuthorityRecord<TState>` shape (256 KiB working budget / 1 MiB Firestore ceiling checks), the atomic per-viewer `ViewerProjection<TView>` shape (64 KiB ceiling check), the `RandomSource` interface, and the full `GameTemplate<TState, TCommand, TEvent, TView>` contract (`authorizeGameAction`, `decide`, `reduce`, `project`, `explainPool`, `validAllocations`, `theatre`, `migrate`).
  - `packages/engine`: platform authorization (membership/capability/room-status/payload-bounds/command-family guards, independent of any template), a seeded deterministic `RandomSource` (mulberry32 keyed by an FNV-1a-folded seed), `runCommand` (the pure command-run harness: authorization → `decide` → sequencing/envelope assignment → folding `reduce`), and `projectViewer` (wraps a template's raw `project` output into the full `ViewerProjection` envelope using `AuthorityRecord` version/revision metadata).
  - `packages/testing`: fixture builders, a template-agnostic `counterTemplate` fixture used to test the engine harness without any game content, and `findLeakedSecrets`/`collectStrings` — a reusable projection-isolation checker any template's tests can reuse.
  - `templates/eat-the-reich`: original placeholder content (character "Rook", location "Abandoned Métro Platform", objective "Silence the alarm...", threat "The Enforcer" — names match the already-approved placeholder art pack, no licensed text/mechanics), and a full pure implementation of one opposed action end to end: `BeginAction` → `ActionRolled` → `SubmitOpposition` → `OppositionRolled` → `AllocateResults` → `ActionResolved`. The threat carries a GM-only hidden difficulty modifier and hidden intel string that are folded into resolution but redacted from every non-GM event copy and projection (docs/ARCHITECTURE.md, N12).
  - **Contract refinements made during implementation** (not yet reflected in `docs/ARCHITECTURE.md`'s section 7 pseudocode, which was illustrative): `DecisionContext<TState>` also carries `actor: AuthorizedMemberContext`, because `authorizeGameAction` has no `state` and so cannot check entity ownership (e.g. "this roll belongs to this actor") — that check has to live in `decide`, which needs to know who is acting. `project` returns the raw `TView`, not a full `ViewerProjection<TView>`, because `TState` alone carries no `roomRevision`/version metadata; `@digitable/engine`'s `projectViewer` wraps it, mirroring how `decide` returns raw events that `runCommand` wraps into `EventEnvelope`s. Recommend folding both into `docs/ARCHITECTURE.md` section 7 on the next doc pass.
  - No application scaffold beyond the above exists yet: no React/Vite client, no Firebase project, dependencies, or production credentials, and no licensed game text, art, or audio.
- The revised architecture selects trusted Firebase Functions as command authority, Firestore as transactional event/projection storage, and RTDB for ephemeral presence — all still deferred to Phase 2 per scope.

## Read in this order

1. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — canonical technical proposal and ADRs.
2. [`docs/EAT_THE_REICH_BUILD_GUIDE.md`](docs/EAT_THE_REICH_BUILD_GUIDE.md) — product experience and scope.
3. [`docs/UX_RESOLUTION_THEATRE.md`](docs/UX_RESOLUTION_THEATRE.md) — presentation and accessibility.
4. [`docs/TEMPLATE_ARCHITECTURE.md`](docs/TEMPLATE_ARCHITECTURE.md) — concise template boundary.
5. [`docs/DATA_AND_SYNC_MODEL.md`](docs/DATA_AND_SYNC_MODEL.md) — concise sync summary.
6. [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md) — milestone view.

Also inspect `JohnWainee/signal-bleed` `AGENTS.md`, `README.md`, and `HANDOFF.md` for reference behavior. Its repository instructions apply only inside that repository.

## First review and resolution

Claude's independent review is recorded by commit `4324ecb` on branch `claude/codex-handoff-review-bc3ucm`. Every finding is dispositioned in [`docs/reviews/2026-09-12-architecture-review-resolution.md`](docs/reviews/2026-09-12-architecture-review-resolution.md). The principal changes are:

- Firestore is authoritative and transactional; RTDB is presence-only.
- Stable member seats decouple private data and GM ownership from anonymous UIDs.
- Safety actors and receipts are anonymous/private by construction.
- Viewer projections are authoritative; event tails do not reconstruct client state.
- Platform authorization and template mechanics are separate contracts.
- Accessibility verification and presentation semantics are explicit.
- The original vertical-slice PR is split into three reviewable PRs.

## Second architecture review and resolution

Claude's second pass is commit `868c75c` on PR #2. It approved the direction and identified N1–N12: the undefined authority record, projection tearing, invalid/inconsistent Firestore paths, RTDB presence authorization, recovery hardening, retry-stable randomness, and smaller safety, privacy, routing, bandwidth, factual, and pool-explanation issues. John approved the updated plan on 2026-09-12. Their dispositions are recorded in [`docs/reviews/2026-09-12-architecture-second-pass-resolution.md`](docs/reviews/2026-09-12-architecture-second-pass-resolution.md) and folded into the canonical architecture.

Implementation may begin after these documentation changes pass review and merge.

## First implementation PR after approval: scaffold and engine — DONE (this branch)

Scope was a local-only vertical slice:

1. ✅ Add `AGENTS.md` with architecture/handoff and independent-review expectations.
2. ✅ Scaffold npm workspaces, TypeScript, Vitest, ESLint, and formatting without React or Firebase.
3. ✅ Create `contracts`, `engine`, `testing`, and the initial-template package.
4. ✅ Use original placeholder data for one character, location, objective, and threat.
5. ✅ Implement pure `decide`, `reduce`, `project`, `explainPool`, and `validAllocations` for one opposed action with a fixed-seed deterministic generator.
6. ✅ Include bounded authority-record and atomic per-viewer projection fixtures in the contracts.

### Required checks — all pass locally

- `npm run format` (Prettier check) — clean.
- `npm run lint` (ESLint 9, `typescript-eslint` type-checked rules) — clean, zero warnings.
- `npm run typecheck` (`tsc --noEmit` in all 4 workspaces) — clean.
- `npx vitest run` — **105/105 tests pass** across 19 test files:
  - `packages/contracts`: 11 tests (authority/projection budget checks, dice-draw ordering, decision/authorization helpers).
  - `packages/engine`: 18 tests (seeded-RNG determinism/retry-stability/range, platform authorization's 7 denial branches + 2 allow branches, `runCommand` sequencing/reduction/per-destination redaction).
  - `templates/eat-the-reich`: 76 tests — `authorizeGameAction` (7), `decide` for all three commands including every rejection branch (21), `reduce` (4), `project` including per-viewer redaction (6), `explainPool` (5), `validAllocations`/allocation invariants (10), dice interpretation (7), schemas/migrate/theatre (8), one full opposed-action lifecycle integration test plus a duplicate-begin rejection test (2), size-budget fixtures (4), and a **fast-check property test** (200 runs) proving a player's or table's projection never contains the threat's hidden intel string or hidden difficulty modifier, in both idle and active-roll states.
- No React, Firebase, Three.js, licensed source assets, marketplace, tactical grid, or generic rules DSL were introduced (verified by dependency grep across every `package.json`).
- No production credentials of any kind exist in this repository.

### Contract refinements made during implementation

`docs/ARCHITECTURE.md` section 7's `GameTemplate` pseudocode was illustrative, not exhaustive, and needed two concrete additions to actually implement:

- `DecisionContext<TState>` gained `actor: AuthorizedMemberContext`. `authorizeGameAction` never receives `state`, so it cannot check entity-scoped ownership (e.g. "AllocateResults may only be submitted by the roll's own actor"); `decide` has `state` but the doc's original `DecisionContext` had no actor identity to check it against. Without this, "player cannot allocate another player's roll" (docs/ARCHITECTURE.md section 13's required proof) had no function capable of enforcing it.
- `project(state, viewer)` now returns the raw `TView`, not a full `ViewerProjection<TView>`. `TState` alone carries no `roomRevision` or version metadata (those live one level up, on `AuthorityRecord`), so a template literally cannot construct a complete `ViewerProjection` from `state` alone. `@digitable/engine`'s new `projectViewer(template, authority, viewer)` wraps the raw view into the full envelope — the same split `decide`/`runCommand` already use for events (`decide` returns raw `TEvent`s; `runCommand` wraps them into `EventEnvelope`s with sequence/revision).

Recommend folding both into `docs/ARCHITECTURE.md` section 7 on the next documentation pass; nothing about the wire format, security model, or data model changed.

## Definition of first playable

After the later realtime PR, two players and one GM can join a room, load the sample encounter, resolve an opposed action, receive correctly isolated projections, reconnect without duplicating it, invoke anonymous safety controls, and review the timeline.

## Decisions requiring John

- Game-content distribution rights and approved placeholder fixture.
- Room join policy and campaign retention/export/deletion policy.
- Firebase staging/production projects and region before realtime work.
- Whether 3D dice, durable accounts, or Cloudflare hosting enter the first public milestone.

## Handoff protocol

When pausing or finishing a material unit:

1. Update Current state and Next action in this file.
2. Record branch/PR, commands run, test results, decisions, and blockers.
3. Commit and push the handoff with the work.
4. Do not call a non-trivial change complete until independently reviewed.

## Next action

1. Independently review this PR (branch `codex/phase-1a-scaffold-engine`) — do not treat this session's own report as the required independent review.
2. After merge, start **Phase 1B — player surface** (`docs/IMPLEMENTATION_ROADMAP.md`): add React/Vite and an in-memory repository implementing the same `runCommand`/`projectViewer` shape this PR already established in `packages/engine`, then build the compose/explain/roll/wait/allocate/confirm player states against `templates/eat-the-reich`'s existing `authorizeGameAction`/`decide`/`reduce`/`project`/`explainPool`/`validAllocations`. Add phone-width keyboard, reduced-motion, and axe checks. Exit criterion: the player flow resolves the one implemented opposed action locally and accessibly.
3. Concretely for Phase 1B: the in-memory repository only needs to hold one `AuthorityRecord<EatTheReichState>` and call `runCommand`/`projectViewer` per player action — no Firebase, no persistence beyond memory, per docs/DATA_AND_SYNC_MODEL.md ("The local vertical slice implements the same repository interface in memory/local storage").
4. Fold this PR's two contract refinements (actor in `DecisionContext`, raw-view `project` + `projectViewer`) into `docs/ARCHITECTURE.md` section 7 on the next documentation pass — flagged above under "Contract refinements made during implementation".
5. Do not pull forward GM console, shared-table view, realtime sync, or a second template — those remain Phase 1C and later per the roadmap.
