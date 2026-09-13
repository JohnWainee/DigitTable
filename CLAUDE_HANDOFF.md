# Claude implementation handoff

- **Status:** Phase 1A merged to `main`. Phase 1B (player surface) implemented on this branch and awaiting independent review/merge.
- **Branch:** `worktree-phase1b-player`
- **PR:** opened against `main`; see repository PR list (this session cannot self-merge)
- **Last updated:** 2026-09-12 by Claude

## Mission

Build DigiTable as a reusable narrative-RPG play surface, with *Eat the Reich* as the first template and Signal Bleed as a behavioral reference.

Signal Bleed's useful patterns are room codes, GM-seat ownership, shared/GM/private state separation, lore outside sessions, local resilience, broadcasts, safety-minded play, and deliberate deploy controls. Do not port its self-contained HTML/no-build architecture.

## Current state

- Repository is initialized and connected to GitHub.
- Architecture work (PR #1, PR #2) is merged to `main`.
- **Phase 1A (scaffold and pure engine) is merged to `main`** (PR #3/#4), scoped exactly to `docs/IMPLEMENTATION_ROADMAP.md`'s Phase 1A and `docs/ARCHITECTURE.md` section 17's PR 1:
  - `AGENTS.md` added at the repo root.
  - npm workspace monorepo scaffolded: TypeScript (strict), ESLint 9 flat config with `typescript-eslint` type-checked rules plus `no-restricted-imports` guards against `react`/`firebase`/`three`, Prettier, and per-package Vitest configs wired through the root `vitest.config.ts`.
  - `packages/contracts`: branded IDs, stable error codes, `CommandEnvelope`/`EventEnvelope`, the bounded `AuthorityRecord<TState>` shape (256 KiB working budget / 1 MiB Firestore ceiling checks), the atomic per-viewer `ViewerProjection<TView>` shape (64 KiB ceiling check), the `RandomSource` interface, and the full `GameTemplate<TState, TCommand, TEvent, TView>` contract (`authorizeGameAction`, `decide`, `reduce`, `project`, `explainPool`, `validAllocations`, `theatre`, `migrate`).
  - `packages/engine`: platform authorization (membership/capability/room-status/payload-bounds/command-family guards, independent of any template), a seeded deterministic `RandomSource` (mulberry32 keyed by an FNV-1a-folded seed), `runCommand` (the pure command-run harness: authorization → `decide` → sequencing/envelope assignment → folding `reduce`), and `projectViewer` (wraps a template's raw `project` output into the full `ViewerProjection` envelope using `AuthorityRecord` version/revision metadata).
  - `packages/testing`: fixture builders, a template-agnostic `counterTemplate` fixture used to test the engine harness without any game content, and `findLeakedSecrets`/`collectStrings` — a reusable projection-isolation checker any template's tests can reuse.
  - `templates/eat-the-reich`: original placeholder content (character "Rook", location "Abandoned Métro Platform", objective "Silence the alarm...", threat "The Enforcer" — names match the already-approved placeholder art pack, no licensed text/mechanics), and a full pure implementation of one opposed action end to end: `BeginAction` → `ActionRolled` → `SubmitOpposition` → `OppositionRolled` → `AllocateResults` → `ActionResolved`. The threat carries a GM-only hidden difficulty modifier and hidden intel string that are folded into resolution but redacted from every non-GM event copy and projection (docs/ARCHITECTURE.md, N12).
  - **Contract refinements made during implementation** (not yet reflected in `docs/ARCHITECTURE.md`'s section 7 pseudocode, which was illustrative): `DecisionContext<TState>` also carries `actor: AuthorizedMemberContext`, because `authorizeGameAction` has no `state` and so cannot check entity ownership (e.g. "this roll belongs to this actor") — that check has to live in `decide`, which needs to know who is acting. `project` returns the raw `TView`, not a full `ViewerProjection<TView>`, because `TState` alone carries no `roomRevision`/version metadata; `@digitable/engine`'s `projectViewer` wraps it, mirroring how `decide` returns raw events that `runCommand` wraps into `EventEnvelope`s. Recommend folding both into `docs/ARCHITECTURE.md` section 7 on the next doc pass.
  - No application scaffold existed at merge time: no React/Vite client, no Firebase project, dependencies, or production credentials, and no licensed game text, art, or audio.
- The first independent Phase 1A implementation review is recorded in [`docs/reviews/2026-09-12-phase-1a-implementation-review.md`](docs/reviews/2026-09-12-phase-1a-implementation-review.md). Its six findings were remediated: the pure harness can return stored actor-private receipt results without rerolling, hidden-adjusted face counts are redacted outside the GM view, live rolls survive schema parsing/migration, duplicate allocation IDs are rejected, repeated gear IDs count once, and event/view parsers now validate their complete nested shapes. Regression coverage raised the suite to 111 tests, and the PR merged to `main` clean.
- The revised architecture selects trusted Firebase Functions as command authority, Firestore as transactional event/projection storage, and RTDB for ephemeral presence — all still deferred to Phase 2 per scope.
- **Phase 1B (player surface) is implemented** on this branch, scoped exactly to `docs/IMPLEMENTATION_ROADMAP.md`'s Phase 1B and `docs/ARCHITECTURE.md` section 17's PR 2. See "Second implementation PR: player surface (Phase 1B)" below for the full description, design decisions, and verification commands. This still requires independent review before merge.

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

## First implementation PR after approval: scaffold and engine — DONE (merged to `main`)

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
- `npx vitest run` — **111/111 tests pass** across 19 test files after review remediation:
  - `packages/contracts`: 11 tests (authority/projection budget checks, dice-draw ordering, decision/authorization helpers).
  - `packages/engine`: 19 tests (seeded-RNG determinism/retry-stability/range, platform authorization's denial/allow branches, `runCommand` sequencing/reduction/per-destination redaction, and stored-receipt duplicate suppression without another draw).
  - `templates/eat-the-reich`: 81 tests — including regression coverage for hidden face-count inference, live-roll schema round trips, complete event/view structural validation, duplicate allocation IDs, and repeated gear IDs, plus the existing 200-run projection-isolation property.
- No React, Firebase, Three.js, licensed source assets, marketplace, tactical grid, or generic rules DSL were introduced (verified by dependency grep across every `package.json`).
- No production credentials of any kind exist in this repository.

### Contract refinements made during implementation

`docs/ARCHITECTURE.md` section 7's `GameTemplate` pseudocode was illustrative, not exhaustive, and needed two concrete additions to actually implement:

- `DecisionContext<TState>` gained `actor: AuthorizedMemberContext`. `authorizeGameAction` never receives `state`, so it cannot check entity-scoped ownership (e.g. "AllocateResults may only be submitted by the roll's own actor"); `decide` has `state` but the doc's original `DecisionContext` had no actor identity to check it against. Without this, "player cannot allocate another player's roll" (docs/ARCHITECTURE.md section 13's required proof) had no function capable of enforcing it.
- `project(state, viewer)` now returns the raw `TView`, not a full `ViewerProjection<TView>`. `TState` alone carries no `roomRevision` or version metadata (those live one level up, on `AuthorityRecord`), so a template literally cannot construct a complete `ViewerProjection` from `state` alone. `@digitable/engine`'s new `projectViewer(template, authority, viewer)` wraps the raw view into the full envelope — the same split `decide`/`runCommand` already use for events (`decide` returns raw `TEvent`s; `runCommand` wraps them into `EventEnvelope`s with sequence/revision).

Recommend folding both into `docs/ARCHITECTURE.md` section 7 on the next documentation pass; nothing about the wire format, security model, or data model changed.

## Second implementation PR: player surface (Phase 1B) — DONE (this branch)

Scope was exactly `docs/IMPLEMENTATION_ROADMAP.md`'s Phase 1B and `docs/ARCHITECTURE.md` section 17's PR 2: React/Vite, an in-memory repository behind the same `runCommand`/`projectViewer` contract, the full accessible local player flow, and phone-width keyboard/reduced-motion/axe checks. No GM console, shared-table UI, Firebase/realtime, 3D, licensed content, or second template.

1. ✅ `apps/web`: a new npm workspace (React 18 + Vite 8 + TypeScript, strict) added alongside `packages/*` and `templates/*`. `eslint.config.js`'s `no-restricted-imports` guard against `react` now scopes to `packages/**`/`templates/**` only (Firebase/Three.js stay repo-wide restricted); `apps/web/**` gets `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y`'s recommended rule sets.
2. ✅ `apps/web/src/repository/InMemoryRoomRepository.ts`: holds one `AuthorityRecord<EatTheReichState>` in memory (no persistence, no Firebase) and dispatches every command through the exact same `@digitable/engine` `runCommand`/`projectViewer` pipeline a trusted server will later run, per `docs/DATA_AND_SYNC_MODEL.md`'s "the local vertical slice implements the same repository interface in memory/local storage." Generates one `crypto.getRandomValues` seed per command (browser analogue of ADR-002's `crypto.randomBytes`), keeps a per-member receipt map for idempotent retries, and calls `authorizeGameAction`/`decide`/`reduce` only through `runCommand` — no reimplemented mechanics.
3. ✅ **Local GM stand-in (a deliberate, documented scope decision):** Phase 1B ships no GM console (that's Phase 1C), but the roadmap's player flow requires a real "wait for opposition" state to resolve. `apps/web/src/repository/localGmPolicy.ts` documents a fixed `SubmitOpposition` push-dice value the repository submits on the GM's behalf, through the identical `authorizeGameAction`/`decide` path a real GM command would use — it is a local-only stand-in for a human judgment call, not game content, not a GM UI, and not exposed to the player. `usePlayerActionFlow` owns *when* to trigger it (a short, reduced-motion-aware presentation delay so `waiting-on-gm` is genuinely experienced as its own semantic state per `docs/UX_RESOLUTION_THEATRE.md`, not skipped).
4. ✅ Full player flow (`apps/web/src/player/`): compose (action + gear selection) → explain pool (a native `<details>`/`<summary>` "Why?" disclosure, keyboard-operable with no bespoke ARIA) → roll → wait for opposition → allocate (a custom accessible spinbutton control, `AllocationStepper`, with tap +/- buttons and full Arrow/Home/End keyboard support) → confirm, matching `docs/UX_RESOLUTION_THEATRE.md`'s state machine and `docs/EAT_THE_REICH_BUILD_GUIDE.md`'s player flow.
5. ✅ **Phone-width keyboard behavior:** allocation input is a custom `role="spinbutton"` control (not a native `<input type="number">`) specifically so it never summons the on-screen keyboard on a phone for what's always a small integer count — it's driven by tap or by Arrow/Home/End keys either way. No text entry exists anywhere in the player flow. Verified at a 375px viewport in `apps/web/test/player/PlayerFlow.a11y.test.tsx`.
6. ✅ **Reduced-motion support:** `usePrefersReducedMotion` (a `useSyncExternalStore` over `matchMedia`) shortens (never zeroes) the `waiting-on-gm` presentation delay and the global stylesheet collapses `animation`/`transition` durations under `prefers-reduced-motion: reduce`.
7. ✅ **Automated accessibility checks:** `jest-axe` (`toHaveNoViolations`, wired into Vitest's matcher types via `apps/web/test/vitest-axe.d.ts`) runs against the compose step, the full keyboard-only playthrough, and the resolved step; `@testing-library/user-event` drives every flow test via `.focus()` + `.keyboard()` only, never a click, except in `AllocationStepper.test.tsx`'s dedicated tap-vs-keyboard comparison.

### Required checks — all pass locally

- `npm run format` (Prettier check) — clean.
- `npm run lint` (ESLint 9) — clean, zero warnings, across all workspaces including `apps/web`.
- `npm run typecheck` (`tsc --noEmit` in all 5 workspaces, `apps/web` included) — clean.
- `npm run test` — **127/127 tests pass** across 22 test files (111 carried over from Phase 1A plus 16 new in `apps/web`: 7 repository tests exercising the real `runCommand`/`projectViewer` pipeline end to end including projection-isolation and invalid-allocation rejection, 5 `AllocationStepper` tests covering tap, full keyboard operation, ARIA value exposure, and effective-max clamping, and 4 `PlayerFlow` tests covering axe violations, the "Why?" disclosure, a complete keyboard-only compose→confirm playthrough, and play-again reset).
- `npm run build` — clean; `apps/web` builds via `vite build` (verified the built `dist/` serves correctly under `vite preview`).
- No Firebase, Three.js, GM console, shared-table view, or second template were introduced.

### Vitest configuration after the security rebase

The branch is rebased onto the dependency-security remediation from PR #6. Vitest 5 uses the
root `vitest.config.ts` `test.projects` list, including `apps/web/vitest.config.ts`; the web
project sets its own root and jsdom/setup configuration. Root test scripts can therefore use
plain `vitest run`/`vitest` while retaining all project-specific settings.

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

1. Independently verify the Phase 1B PR on branch `worktree-phase1b-player` (this branch), then merge if clean.
2. After merge, start **Phase 1C — GM and shared views** (`docs/IMPLEMENTATION_ROADMAP.md`): add GM opposition controls (replacing the local GM stand-in described above with a real GM console) and a read-only shared-table capability, add multi-role local simulation and desktop-width tests, and complete one opposed roll/allocation flow across all views. Exit criterion: one encounter resolves end to end with simulated roles.
3. Concretely for Phase 1C: `templates/eat-the-reich`'s `authorizeGameAction` already accepts a `gm` capability for `SubmitOpposition`; a real GM UI needs to surface the visible-to-GM projection (`viewer.capability === "gm"`, already implemented in `project`) and let a human choose push dice, rather than `apps/web/src/repository/localGmPolicy.ts`'s fixed stand-in value. Multi-role local simulation likely means the in-memory repository grows a second tracked viewer the UI can switch between, still with no Firebase.
4. Fold this PR's two contract refinements (actor in `DecisionContext`, raw-view `project` + `projectViewer`) into `docs/ARCHITECTURE.md` section 7 on the next documentation pass — flagged above under "Contract refinements made during implementation". Still outstanding from Phase 1A.
5. Do not pull forward realtime sync or a second template — those remain Phase 2 and later per the roadmap.
6. Keep `apps/web/vitest.config.ts` listed in the root `vitest.config.ts` projects array so its jsdom environment and setup file remain active.
