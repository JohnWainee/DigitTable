# Claude implementation handoff

- **Status:** Phase 1A/1B/1C, the Phase 2 preflight, Phase 2 PR 1, and **Phase 2 PR 2 (Firestore data model and rules) are merged to `main`.** PR 2 was independently reviewed and approved with two narrow remediations (see `docs/reviews/2026-09-14-phase-2-pr2-independent-review.md`); John chose this candidate over the competing draft PR #10 (`claude/phase-2-pr-2-firestore-159rmr`), which should now be closed or rebased (review finding S5). The Phase 2 decision brief records John's code-plus-passphrase admission policy and 90-day manual-retention policy.
- **Branch:** `main` (PR 2 landed via `worktree-phase2-pr2`, which carried the review branch `claude/phase2-pr2-security-review-lexa32` merged through PR #11)
- **PR:** PR #11 (review into `worktree-phase2-pr2`) and the PR 2 merge into `main` are both merged on John's instruction.
- **Last updated:** 2026-09-14 by Claude (independent review pass, then merge)

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
- **Phase 1B (player surface) is merged to `main`** (PR #7), scoped exactly to `docs/IMPLEMENTATION_ROADMAP.md`'s Phase 1B and `docs/ARCHITECTURE.md` section 17's PR 2. See "Second implementation PR: player surface (Phase 1B)" below for the full description, design decisions, and verification commands. Its independent review is recorded in [`docs/reviews/2026-09-13-phase-1b-implementation-review.md`](docs/reviews/2026-09-13-phase-1b-implementation-review.md): approved for merge, no blocking findings, with four non-blocking Phase 1C follow-ups (all addressed below).
- **Phase 1C (GM and shared views) is merged to `main`** (PR #5), scoped exactly to `docs/IMPLEMENTATION_ROADMAP.md`'s Phase 1C and `docs/ARCHITECTURE.md` section 17's PR 3, per `docs/PHASE_1C_PLAN.md`. See "Third implementation PR: GM and shared views (Phase 1C)" below for the full description, design decisions, and verification commands. Its independent review is recorded in [`docs/reviews/2026-09-13-phase-1c-implementation-review.md`](docs/reviews/2026-09-13-phase-1c-implementation-review.md): approved for merge, no blocking or non-blocking code findings.
- **Phase 2 preflight is complete on `main`** (merged from `worktree-phase2-preflight`), per `docs/ARCHITECTURE.md` section 17 step 4. See "Phase 2 preflight: contract re-evaluation before persistence" below.
- **Phase 2 PR 1 (repository interface + Firebase emulator harness) is complete on this branch** (`worktree-phase2-pr1`), scoped exactly to `docs/PHASE_2_PLAN.md`'s PR 1. See "Fourth implementation PR: repository interface and Firebase emulator harness (Phase 2 PR 1)" below.
- **Phase 2 PR 2 (Firestore data model and rules) is implemented on `worktree-phase2-pr2` and independently reviewed on this branch** (`claude/phase2-pr2-security-review-lexa32`). It adds the authority lifecycle fields, client-read security rules, and emulator allow/deny matrix described below; it does not add Functions, admission, or client reconnect/outbox behavior. The review approved it and applied two narrow remediations here (reserved-viewer hardening in `firestore.rules`; a fuller emulator matrix).

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

## Second implementation PR: player surface (Phase 1B) — DONE (merged to `main`)

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

## Third implementation PR: GM and shared views (Phase 1C) — DONE (this branch)

Scope was exactly `docs/IMPLEMENTATION_ROADMAP.md`'s Phase 1C and `docs/ARCHITECTURE.md` section 17's PR 3, per `docs/PHASE_1C_PLAN.md`: GM opposition controls (replacing Phase 1B's timed local GM stand-in with real human GM commands), a read-only shared-table capability, multi-role local simulation, and desktop-width tests, completing one opposed roll/allocation flow across all three views. No Firebase/realtime, encounter authoring, safety controls, GM overrides, 3D, licensed content, or second template were introduced.

1. ✅ **Replaced the local GM stand-in with real GM opposition controls.** `apps/web/src/repository/InMemoryRoomRepository.ts`'s `simulateOpposition` (a fixed-value, timer-triggered stand-in) and `localGmPolicy.ts` are gone. A new `submitOpposition(rollId, pushDice)` method dispatches `SubmitOpposition` as the GM member through the exact same `dispatch`/`runCommand` path every other command uses. `apps/web/src/gm/GmScreen.tsx` (a new `/room/:roomId/gm`-equivalent surface, simulated locally per `docs/ARCHITECTURE.md` section 6) renders the GM's own `ViewerProjection<EatTheReichView>` — full threat list including `ThreatGmSummary`'s hidden fields, the active roll's un-redacted `playerFaces`/`hiddenDifficultyModifier` — and a push-dice control (the existing `AllocationStepper`, moved to `apps/web/src/shared/` and reused as-is, bounded by a newly-exported `MAX_PUSH_DICE` from `templates/eat-the-reich/src/engine.ts` instead of a duplicated magic number) wired to `submitOpposition`. `apps/web/src/gm/useGmFlow.ts` owns the GM's projection subscription and dispatch-result handling.
2. ✅ **Read-only shared-table surface.** `apps/web/src/table/TableScreen.tsx` (a new `/room/:roomId/table`-equivalent surface) renders the `table` capability's projection — public character/threat summaries, the active roll without GM-only fields, `self` always null — via `apps/web/src/table/useTableProjection.ts`. It renders no buttons, inputs, or other controls anywhere, and no Pause/Fade/Veil/Skip (not yet implemented anywhere in the current command surface). `InMemoryRoomRepository.getGmProjection()`/`getTableProjection()` build the `{ viewerId: "gm" | "table", capability: "gm" | "table" }` viewer contexts directly (matching `templates/eat-the-reich/test/fixtures.ts`'s `GM_VIEWER`/`TABLE_VIEWER` pattern), distinct from the GM's own dispatch-time member ID.
3. ✅ **Multi-role local simulation.** One `InMemoryRoomRepository` instance is shared by all three surfaces: `apps/web/src/App.tsx` is now a local tab switcher (Player/GM/Table) over one repository instance, standing in for real per-role routing until Phase 2. `apps/web/test/multiRole/MultiRoleFlow.test.tsx` renders `PlayerScreen`, `GmScreen`, and `TableScreen` concurrently against one shared repository and drives the full `BeginAction` (player) → `SubmitOpposition` (GM) → `AllocateResults` (player) flow, asserting each surface's DOM only ever shows what its own projection contains at each step. A dedicated regression test (`attemptCommandAsTable`, a test-support-only repository method mapping a fixed member to the `table` capability) proves a table-attributed command is rejected by platform authorization through the same dispatch path, not merely omitted from the table UI.
4. ✅ **Projection isolation (extended).** `templates/eat-the-reich/test/multiRoleProjectionIsolation.property.test.ts` is a new property test that runs the actual `BeginAction`/`SubmitOpposition`/`AllocateResults` command sequence through `runCommand` with randomized hidden threat data and push-dice values (50 runs), asserting after every accepted command that `table` never carries hidden fields, `gm` is the only viewer that does, player-vs-GM isolation is unweakened by the added viewers, and all three projections stay within the 64 KiB ceiling (`checkProjectionBudget`). This is additive to, not a replacement for, the existing single-scenario `projectionIsolation.property.test.ts`.
5. ✅ **Responsive accessibility.** `GmScreen`/`TableScreen` reuse Phase 1B's `LiveRegion` and `usePrefersReducedMotion`/reduced-motion CSS harness (no second accessibility configuration). `apps/web/test/gm/GmScreen.test.tsx` and `apps/web/test/table/TableScreen.test.tsx` add `jest-axe` checks at both the existing 375px phone-width breakpoint and a new 1280px desktop-width breakpoint (chosen because none is named in `docs/ARCHITECTURE.md`/`docs/UX_RESOLUTION_THEATRE.md`; `docs/PHASE_1C_PLAN.md` flagged this as an open pick), plus keyboard-only operability of the GM's push-dice control and a polite live region announced once per `docs/UX_RESOLUTION_THEATRE.md`.
6. ✅ **Phase 1B independent review follow-ups, all addressed:**
   - "Replace the timed local GM stand-in with human opposition controls" — done (item 1 above); `usePlayerActionFlow.ts` no longer runs a `setTimeout`-based delay at all, since `waiting-on-gm` is now a genuine wait on another surface's action reflected live through `repository.subscribe`.
   - "Surface opposition-dispatch failures in the player UI" — `InMemoryRoomRepository` gained `subscribeToErrors`, broadcasting every rejected dispatch (from any role) to subscribers; `usePlayerActionFlow` shows the GM's dispatch failures as the same top-level alert used for the player's own failures (`apps/web/test/player/PlayerFlow.a11y.test.tsx`, "surfaces an opposition-dispatch failure instead of waiting silently forever").
   - "Consider explicit coverage for runtime reduced-motion preference changes" — added: `apps/web/test/accessibility/usePrefersReducedMotion.test.ts` drives a controllable `matchMedia` mock through a runtime `change` event (jsdom's own mock in `test/setup.ts` can't flip `matches`, so this test installs its own and restores it afterward).
   - "Preserve the existing engine-level idempotency guarantees when Phase 2 adds reconnect/outbox behavior" — unaffected by this PR; no change to command-ID minting.
7. ✅ **Contract refinements folded into `docs/ARCHITECTURE.md`.** Section 7's `GameTemplate` pseudocode now shows `DecisionContext<TState>`'s `actor` field and `project`'s raw-`TView`-plus-`projectViewer`-wrapper split explicitly, both flagged as outstanding since Phase 1A. No change to the wire format or security model — see the note appended to that section.

### Required checks — all pass locally

- `npm run format` (Prettier check) — clean.
- `npm run lint` (ESLint 9) — clean, zero warnings, across all workspaces.
- `npm run typecheck` (`tsc --noEmit` in all 5 workspaces) — clean.
- `npx vitest run` — **161/161 tests pass** across 28 test files (127 carried over from Phase 1A/1B plus 1 new in `templates/eat-the-reich` and 33 new in `apps/web`): the new template test is the multi-role projection-isolation property test (item 4 above); the new `apps/web` tests cover `GmScreen`/`useGmFlow` (hidden-field rendering, keyboard-operable opposition dispatch, engine-driven status, dispatch-failure surfacing, phone/desktop axe), `TableScreen` (public-only rendering, no controls, no safety controls, live status, stale-mount regression, phone/desktop axe), the multi-role integration flow, the reduced-motion runtime-change hook test, and updated repository/player-flow tests reflecting the real GM dispatch path.
- `npm run build` — clean; `apps/web` builds via `vite build` (verified the built `dist/` serves correctly under `vite preview`, HTTP 200).
- `npm audit` — 0 vulnerabilities.
- `git diff --check` — clean.
- No Firebase, Three.js, encounter authoring, safety controls, GM overrides, 3D, licensed content, or second template were introduced. `packages/contracts`, `packages/engine`, and `templates/eat-the-reich`'s pure functions are unchanged except the additive `MAX_PUSH_DICE` export noted above.
- Not independently verified in a real browser this session (no browser tool available); the automated suite above exercises the full rendered DOM (via `@testing-library/react` + `jsdom`) for every surface and the full multi-role flow, including `jest-axe` checks, so this substitutes for but does not replace a manual pass before merge.

## Phase 2 preflight: contract re-evaluation before persistence — DONE (this branch)

Scope was exactly `docs/ARCHITECTURE.md` section 17 step 4 ("Independently review and adjust contracts before persistence"), run before any Phase 2 implementation per its precondition. No Firebase package, credential, project, or persistence code was touched; this is a documentation-only branch.

1. ✅ **Independent contract re-evaluation:** [`docs/reviews/2026-09-13-phase-2-preflight-review.md`](docs/reviews/2026-09-13-phase-2-preflight-review.md) re-reads the actual merged Phase 1A–1C code (not just the architecture pseudocode) against repository boundaries, command receipts/idempotency, member-seat binding, projection atomics, recovery, authorization, failure semantics, and the emulator-test seam. It dispositions the architecture third-pass review's six still-open findings (R1–R6, all now folded into `docs/ARCHITECTURE.md` by this same branch) and records nine new findings (P1–P9) found only by reading the shipped code: most substantively, that command IDs are currently minted server-side inside `InMemoryRoomRepository.dispatch()` rather than by the caller (P1), which means the engine's already-correct idempotent-retry path (`runCommand`'s `priorReceipt` short-circuit) is currently unreachable from any UI code path and must be fixed by making `commandId` a caller-supplied outbox concern before `FirebaseRoomRepository` exists; and that no repository interface is yet an explicit contract, only one concrete synchronous implementation (P8). No blocking defect was found in the merged code.
2. ✅ **Documentation-only architecture corrections**, folding in the architecture third-pass review's R1–R6 (recorded there as "ride the next documentation edit"): `docs/ARCHITECTURE.md` section 8 now specifies the `uidBindings/{uid}` reverse index Firestore rules need to establish room membership from a UID alone (R1), states that `authority/current` carries `roomStatus`/`gmMemberId` directly as the transaction's serialization point with `meta/current` as a synced mirror (R2), fixes the `receiptId` scheme to `${memberId}_${commandId}` (R6), and states the GM-lockout, GM-code-theft, and old-UID-presence-recreation residuals explicitly (R3–R5). These are documentation corrections only — the corresponding `packages/contracts` shape changes (e.g. `AuthorityRecord` gaining `roomStatus`/`gmMemberId`) are deliberately deferred to Phase 2 PR 2, not made here.
3. ✅ **Phase 2 implementation plan:** [`docs/PHASE_2_PLAN.md`](docs/PHASE_2_PLAN.md) splits `docs/ARCHITECTURE.md` section 17 steps 5–6 into seven reviewable PRs (repository interface + emulator harness; Firestore data model + rules; anonymous auth + admission + GM claim; the transactional command-authority Function; RTDB presence; recovery-code redemption; client reconnect/outbox), each scoped like the Phase 1A–1C PRs (own tests, own review, land before the next starts). It includes a 22-row acceptance/failure-injection matrix combining `docs/ARCHITECTURE.md` sections 11/13's required proofs with concrete failure injections (duplicate command, concurrent invocation, disconnect-after-submit, stale revision, recovery lockout, kick), each mapped to the PR that first makes it testable.
4. ✅ **Decision brief for John:** [`docs/PHASE_2_DECISION_BRIEF.md`](docs/PHASE_2_DECISION_BRIEF.md) covers the three "before realtime implementation" decisions from `docs/ARCHITECTURE.md` section 16 — Firebase region/project separation, room join policy, and retention/export/deletion values — with options, tradeoffs, and a recommendation for each, plus the specific open questions only John can answer (e.g. what happens after a 90-day archive prompt goes unanswered).
5. ✅ **First safe implementation slice identified:** `docs/PHASE_2_PLAN.md`'s PR 1 (repository interface + Firebase emulator harness) and PR 2 (Firestore data model + security rules) need none of the three decisions above and can start in the Emulator Suite immediately — both run entirely against local emulators with a placeholder project ID. PR 3 onward (real project creation, the actual join/admission flow) waits on the decision brief.

### Required checks — all pass locally

- `npm install` (this worktree had no `node_modules` before this session; a clean install is required and is unaffected by the documentation-only changes here).
- `npm run format` (Prettier check) — clean.
- `npm run lint` (ESLint 9) — clean, zero warnings.
- `npm run typecheck` (`tsc --noEmit` in all 5 workspaces) — clean.
- `npx vitest run` — **161/161 tests pass** across 28 test files, unchanged from the Phase 1C merge (no source files were touched).
- `npm run build` — clean.
- `npm audit` — 0 vulnerabilities.
- `git diff --check` — clean.
- No Firebase, Three.js, or persistence-layer code was introduced; `packages/contracts`, `packages/engine`, `apps/web`, and `templates/eat-the-reich` are byte-for-byte unchanged from `main`. Only `docs/ARCHITECTURE.md`, `CLAUDE_HANDOFF.md`, and three new `docs/` files changed.

## Fourth implementation PR: repository interface and Firebase emulator harness (Phase 2 PR 1) — DONE (this branch)

Scope was exactly `docs/PHASE_2_PLAN.md`'s PR 1: extract an explicit, async `RoomRepository` contract closing preflight findings P1 (commandId minted server-side, making idempotent retry unreachable) and P8 (no repository interface, only one implicit concrete class); retrofit `InMemoryRoomRepository` and the player/GM hooks onto it without regressing any Phase 1 flow; add a minimal Firebase Emulator Suite harness using only the `demo-digitable` placeholder project ID. No Firestore data model, security rules (beyond a placeholder default-deny rule set so the emulators can boot), Functions, auth/admission, presence, recovery, or client reconnect/outbox implementation — all explicitly excluded per `docs/PHASE_2_PLAN.md`'s PR boundaries.

1. ✅ **`RoomRepository` contract** (`packages/contracts/src/repository.ts`): `dispatch(memberId, { commandId, payload, expectedRevision? })` returns `Promise<RoomCommandResult<TEvent>>` (`{ status: "accepted", commandId, roomRevision, sharedEvents }` or `{ status: "rejected", commandId, code, message }`); `getProjection`/`subscribeToProjection` are the async, per-viewer read/listen primitives a real backend needs. `commandId` is a required, caller-supplied field on the request — the exact contract-shape fix P1 called for: "the interface decision should be made when the shared repository interface is extracted (PR 1)." `RoomDispatchFailure` (used by `subscribeToErrors`) moved here from `apps/web` for the same reason: a `FirebaseRoomRepository` needs the identical broadcast shape.
2. ✅ **`InMemoryRoomRepository` retrofit** (`apps/web/src/repository/InMemoryRoomRepository.ts`): the class now `implements RoomRepository<EatTheReichCommand, EatTheReichEvent, EatTheReichView>` (a structural, compiler-checked conformance proof). Its own `dispatch()` is the sole command-execution path; the existing `beginAction`/`submitOpposition`/`allocateResults`/`attemptCommandAsTable` convenience methods now take a caller-supplied `commandId: CommandId` first parameter and return `Promise<RoomCommandResult<EatTheReichEvent>>` instead of minting a UUID internally and returning synchronously. The receipt-key separator changed from `:` to `_` (`${memberId}_${commandId}`), matching the `receiptId` scheme the Phase 2 preflight review's R6/P2 findings fixed in `docs/ARCHITECTURE.md` section 8, so a future `FirebaseRoomRepository`'s receipt lookup is written against the same key shape from the start. `getPlayerProjection`/`getGmProjection`/`getTableProjection` stay as synchronous convenience getters (not part of the interface) so no UI call site needed to change shape for projection reads — only command dispatch needed the async/caller-ID fix.
3. ✅ **Where `commandId` is minted**: at the point a member commits to an action, inside `usePlayerActionFlow`/`useGmFlow` (a `newCommandId()` helper calling `crypto.randomUUID()` via `asCommandId`), immediately before calling the repository — not inside the repository. This is deliberately *only* the contract seam, not a full outbox: nothing here yet persists a commandId client-side or resubmits it on retry (that's Phase 2 PR 7, "client reconnect and outbox," per the plan). What this PR proves is that the seam is real: `apps/web/test/repository/InMemoryRoomRepository.test.ts`'s "commandId is a caller-supplied outbox concern" tests resubmit the exact same `commandId` twice and assert the retry reaches `runCommand`'s `priorReceipt` short-circuit (packages/engine/src/runCommand.ts) — no second decision, no further randomness drawn, room revision unchanged. (One nuance recorded in that test: `AcceptedCommandReceipt` stores only accepted sequence numbers, not event payloads, so a retry's `sharedEvents` comes back empty rather than duplicating the original — reconstructing a retry's events from stored history is PR 7's job, not this one's.)
4. ✅ **Hooks stay `void`-returning at the UI boundary.** `usePlayerActionFlow`/`useGmFlow`'s exposed callbacks (`beginAction`, `allocate`, `submitOpposition`) keep their existing synchronous `(...) => void` signatures — no screen component (`PlayerScreen`, `GmScreen`, `ComposeStep`, `ActiveRollPanel`) changed at all. Internally each callback mints a `commandId`, calls the now-async repository method, and updates `errorMessage`/`resolvedSummary` state from the resolved `RoomCommandResult` via `.then()` (explicitly `void`-prefixed, satisfying `@typescript-eslint/no-floating-promises`). This kept the blast radius to the repository, the two flow hooks, and their tests — no component/JSX changes were needed to add the async seam.
5. ✅ **Firebase Emulator Suite harness** (`packages/testing/src/emulator.ts`, `firebase.json`, `.firebaserc`, `firestore.rules`, `database.rules.json`): `.firebaserc` pins the project to `demo-digitable` — the Emulator Suite's documented `demo-` prefix convention, which the emulators treat as an offline fake project regardless of whether a real project by that name exists, so no real Firebase project, credential, or production resource is ever created or contacted. `firestore.rules`/`database.rules.json` are explicit, clearly-labeled **placeholders** (default-deny) that exist only so the emulators can boot for this PR's connectivity proof — the real room data model and security rules are Phase 2 PR 2's job, not reinterpreted or pulled forward here. `createEmulatorTestEnvironment()` wraps `@firebase/rules-unit-testing`'s `initializeTestEnvironment`; `isAuthEmulatorReachable()` does a plain `fetch` against the Auth emulator's documented config endpoint (no Auth-specific test environment exists in `@firebase/rules-unit-testing`, and admission/auth flows are Phase 2 PR 3's job, correctly out of scope here).
6. ✅ **Emulator smoke test** (`packages/testing/test-emulator/emulatorHarness.smoke.test.ts`, run via `npm run test:emulator` → `firebase emulators:exec --project demo-digitable "npm run test:emulator --workspace @digitable/testing"`): proves the Auth emulator is reachable, that the placeholder Firestore/RTDB rules actually take effect (`assertFails` on an unauthenticated write to each), and that a trusted (`withSecurityRulesDisabled`) context round-trips a read/write against each — "a trivial read/write round-trips against the emulator," exactly as `docs/PHASE_2_PLAN.md` specifies for this PR. This suite has its own Vitest project (`packages/testing/vitest.emulator.config.ts`) deliberately **not** listed in the root `vitest.config.ts`'s `test.projects` — it requires the Firestore/RTDB emulators (and therefore a JVM) running, unlike every other suite in the repo, so it must never run as part of the default `npm run test`.
7. ✅ **ESLint's Firebase guard, tightened and scoped.** The prior `no-restricted-imports` rule only blocked the bare `"firebase"` specifier (a gap: `@firebase/*`-scoped imports like `@firebase/rules-unit-testing` weren't covered at all). It now also blocks `firebase-admin` and every `firebase/*`/`@firebase/*` subpath via a `patterns` restriction, repo-wide, with one explicit carve-out: `packages/testing/src/emulator.ts` and `packages/testing/test-emulator/**` are the only files allowed to import Firebase packages. `packages/contracts`, `packages/engine`, `templates/*`, and the rest of `apps/web` remain fully Firebase-free, matching `AGENTS.md`'s framework-independence boundary.

### Required checks — all pass locally

- `npm install` (fresh worktree; also added root devDependency `firebase-tools`, and `packages/testing` devDependencies `firebase`/`@firebase/rules-unit-testing`/`vitest`).
- `npm run format` (Prettier check) — clean.
- `npm run lint` (ESLint 9) — clean, zero warnings, across all workspaces.
- `npm run typecheck` (`tsc --noEmit` in all 5 workspaces, including `packages/testing`'s new `test-emulator/` and `vitest.emulator.config.ts`) — clean.
- `npx vitest run` — **157/157 tests pass** across 28 test files (unchanged file count from Phase 1C; 2 new tests added to `InMemoryRoomRepository.test.ts`'s idempotent-retry coverage plus 2 new `RoomRepository` contract-conformance tests, offset by no removals).
- `npm run build` — clean; `apps/web` builds via `vite build`.
- **`npm run test:emulator`** (`firebase emulators:exec --project demo-digitable ...`) — **5/5 tests pass**: Auth emulator reachable; Firestore and RTDB placeholder rules both reject an unauthenticated write; a trusted context round-trips a read/write against both. Required a JDK in this sandbox (installed via `brew install openjdk` with John's explicit approval, since the Firestore/RTDB emulators are Java-based and none was present) — the Auth emulator itself is Node-based and needs no JVM.
- `npm audit` — **not clean**: 9 moderate-severity advisories, all transitive dependencies of `firebase-tools` itself (`@opentelemetry/core`, `csv-parse`, `qs` (via `express`), `stream-json`, `uuid` (via `gaxios`) — none reachable from this project's own code or from `apps/web`'s production bundle, which remains dependency-clean per `vite build`'s output). Every advisory's non-breaking fix was already applied (`npm audit fix`); the remainder require downgrading `firebase-tools` to `10.1.1` (a 5-major-version regression, `npm audit fix --force`), which was **not** applied — that would trade a real capability regression (this PR's whole purpose) for advisories in dev-only CLI tooling (CSV import, pub/sub, HTTP client internals) this project never exercises. Recommend re-checking on `firebase-tools`' next release rather than downgrading.
- `git diff --check` — clean.
- No Firestore data model, security rules beyond the explicitly-labeled PR 1 placeholder, Cloud Functions, auth/admission, RTDB presence, recovery-code redemption, or client reconnect/outbox implementation were introduced. `packages/engine` and `templates/eat-the-reich`'s pure functions are byte-for-byte unchanged.
- Not independently verified in a real browser this session (no browser tool available); `apps/web`'s existing `jest-axe`/`@testing-library/react` suite (now exercising the async dispatch path throughout) substitutes for, but does not replace, a manual pass.

## Fifth implementation PR: Firestore data model and security rules (Phase 2 PR 2) — IMPLEMENTED AND INDEPENDENTLY REVIEWED (not yet merged)

Scope is exactly `docs/PHASE_2_PLAN.md` PR 2. This change replaces PR 1's default-deny placeholders with the resolved, read-only client access model. It does not introduce a Cloud Function, anonymous-auth admission flow, a real Firebase project, or a Firebase-backed client repository.

1. `AuthorityRecord` now carries `roomStatus` (`active` or `archived`) and `gmMemberId`, making the architecture's transaction serialization requirement compiler-visible. All representative authority fixtures and the local repository's initial record include these fields, so the existing budget tests continue to cover the persisted shape.
2. `firestore.rules` implements the resolved `uidBindings/{uid}` reverse-index check. A signed-in member can read the public room mirror, roster, shared events, and only their own member projection, receipt, and private event partition. GM and table reserved projections/event partitions require their matching capability. `authority`, bindings, reverse bindings, snapshots, room codes, and all direct client writes are denied.
3. `database.rules.json` permits authenticated reads of opaque room-level presence and permits writes only at `presence/{roomId}/{auth.uid}/{connectionId}`. It intentionally does not duplicate Firestore membership data, preserving the documented limited-presence-disclosure residual.
4. `packages/testing/test-emulator/roomRules.test.ts` adds the PR 2 emulator matrix: own-versus-other player projection/receipt/private-event isolation, GM/table capability isolation, authorized shared reads, service-only path denial, universal direct-Firestore-write denial (including a table-attributed command surrogate), and UID-owned RTDB presence writes. Together with the harness smoke suite, this was **10/10** emulator tests at `a40e7dc`; the review branch extends the matrix to **16/16** (see the review outcome below).

### Required checks — all pass locally

- `npm run check` — formatting, lint (zero warnings), typecheck, and **157/157** default tests across 28 files passed.
- `npm run build` — passed (`vite build`).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **10/10** tests passed against the local `demo-digitable` Auth, Firestore, and RTDB emulators.
- `git diff --check origin/main...HEAD` — clean before the handoff update; rerun before commit.
- `npm install` repaired a pre-existing lockfile omission for `packages/testing`'s declared `vitest` devDependency; it did not change requested dependency versions.

### Independent-review requirement

This is a material persistence/security change and is **not complete until a second pass independently reviews it**. The review must inspect the rules against `docs/ARCHITECTURE.md` section 8/13, run the full gate and emulator suite, verify no Firestore path is unintentionally client-writable/readable, and record the outcome under `docs/reviews/` before merge.

### Independent review outcome (2026-09-14)

Recorded in [`docs/reviews/2026-09-14-phase-2-pr2-independent-review.md`](docs/reviews/2026-09-14-phase-2-pr2-independent-review.md). Verdict: approved for merge with the review branch's remediations applied. Every allow rule was checked against section 8's path contract and section 11/13's role matrix, then probed adversarially against the emulator before findings were written.

- **S1 (Medium, fixed here):** the original five-test matrix omitted PR 2's own P0 proofs (GM/table reading another member's receipt, projection, or private partition; non-member and unauthenticated reads; `bindings`/`snapshots`/`roomCodes`/room-document denial; collection `list` queries; `update`/`delete` writes; unauthenticated RTDB writes). The rules already denied all of them; `roomRules.test.ts` now has 11 tests covering every section 8 path × role.
- **S2 (Low, fixed here):** the own-member projection branch did not exclude the reserved `gm`/`table` viewer IDs, so a mis-minted binding with `memberId: "table"` could read `projections/table` (probe-confirmed). `firestore.rules` now guards that branch with `isReservedViewer`, with a regression test.
- **S3 (Medium, deferred to PR 7 with an architecture touch):** the receipt rule reads `resource.data.memberId`, so a member cannot `get`/listen on their own not-yet-written receipt (denied, not "missing"). PR 7's pending-outbox reconciliation must either add a path-prefix own check alongside the data check or reconcile without reading the receipt before it exists; record the choice in section 8.
- **S4 (Low, PR 5):** RTDB presence has no `.validate`, and any authenticated UID can write under its own UID in any room ID (the documented residual, write side). PR 5 should bound the payload and decide the `{uid}`- vs `{connectionId}`-level write grant.
- **S5 (Process, needs John):** two divergent PR 2 candidates exist: `worktree-phase2-pr2` (`a40e7dc`, reviewed here) and open draft PR #10 (`claude/phase-2-pr-2-firestore-159rmr`, `92be020`, broader: typed document contracts in `packages/contracts/src/room.ts`, 46-test matrix). Only one may merge; if PR #10 is chosen it needs its own independent pass, and S2/S3 apply to it verbatim.
- **S6 (Low, before PR 3/4):** the rules depend on `uidBindings.{memberId,capability}` and `receipts.memberId` field names that no contract type declares; this PR types only `AuthorityRecord`, so "implements the data model" overstates it. Land typed document shapes (PR #10's `room.ts` is a candidate) before PR 3 writes these documents.
- **S7/S8 (Informational):** the decision brief records the staging project identifier and regions as a decision; no config, code, or credential references it (`.firebaserc` remains `demo-digitable`). The emulator command's Homebrew `PATH` prefix is macOS-specific; a JDK on `PATH` is the actual requirement.

Review-branch gate (after remediations): `npm run check` — **157/157** tests across 28 files, zero lint warnings, typecheck clean; `npm run build` — passed; `npm run test:emulator` — **16/16** (5 harness + 11 rules); `git diff --check origin/main...HEAD` — clean. In the Linux review sandbox, `firebase-tools` routed its loopback RTDB rules upload through the egress proxy (it ignores `NO_PROXY`), so the emulator suite was run with the `*_PROXY` variables unset for that one invocation only; no repository file was changed for it.

## Definition of first playable

After the later realtime PR, two players and one GM can join a room, load the sample encounter, resolve an opposed action, receive correctly isolated projections, reconnect without duplicating it, invoke anonymous safety controls, and review the timeline.

## Decisions requiring John

- **See [`docs/PHASE_2_DECISION_BRIEF.md`](docs/PHASE_2_DECISION_BRIEF.md) for the full brief, options, and recommendations.** Summary: Firebase region and staging/production project separation; room join policy (open code / code + passphrase / invites); campaign retention/export/deletion values, including what happens if a 90-day archive prompt goes unanswered.
- Game-content distribution rights and approved placeholder fixture.
- Whether 3D dice, durable accounts, or Cloudflare hosting enter the first public milestone.

## Handoff protocol

When pausing or finishing a material unit:

1. Update Current state and Next action in this file.
2. Record branch/PR, commands run, test results, decisions, and blockers.
3. Commit and push the handoff with the work.
4. Do not call a non-trivial change complete until independently reviewed.

## Next action

1. Close draft PR #10 (`claude/phase-2-pr-2-firestore-159rmr`) or rebase it onto `main`; PR 2 has merged from `worktree-phase2-pr2` (review finding S5). Its typed document contracts (`packages/contracts/src/room.ts`) are the natural candidate for the S6 item below.
2. Before PR 3 writes `uidBindings`/`bindings`/`members`/`receipts`, land typed document shapes for the section 8 documents (S6). Carry S3 (pending-receipt read) into PR 7's design and S4 (`.validate`, write-grant level) into PR 5.
3. After PR 2 merges, begin PR 3 (anonymous auth, code-plus-passphrase admission, and GM claim) only from updated `main`. It requires the already-selected join policy plus explicit staging/production project identifiers and a Firebase region; do not invent either identifier or create a real project without them.
4. Keep `packages/testing/vitest.emulator.config.ts` opt-in via `npm run test:emulator`; it must not join the default test project list. The emulator command requires a JDK on `PATH`.
5. Do not pull forward the trusted command Function (PR 4), RTDB client presence wiring (PR 5), recovery (PR 6), reconnect/outbox (PR 7), campaign tooling, safety controls, 3D, or a second template.
