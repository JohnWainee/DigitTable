# Phase 1C implementation plan — GM and shared views

- **Status:** Planning only. Implementation blocked on Phase 1B (see "Dependency status").
- **Scope authority:** `docs/IMPLEMENTATION_ROADMAP.md` Phase 1C; `docs/ARCHITECTURE.md` section 17, PR 3.
- **Date:** 2026-09-12

## Dependency status

Phase 1C is a stacked follow-on to Phase 1B, not an independent slice. Phase 1B
(`worktree-phase1b-player`, branch `codex/phase-1a-scaffold-engine`'s successor)
was inspected on 2026-09-12 and is **not yet a usable foundation**:

- `apps/web` exists only as workspace scaffolding: `package.json`, `tsconfig.json`,
  `vite.config.ts`, `vitest.config.ts`, `index.html`. No React source, no
  in-memory repository, no player states (compose/explain/roll/wait/allocate/confirm)
  are implemented yet.
- The root `package.json` and `vitest.workspace.ts` changes that wire `apps/*`
  into the workspace are uncommitted (working-tree changes in that worktree).
- Nothing from Phase 1B has been pushed or opened as a PR yet, so there is no
  commit to branch from without inheriting unreviewed, unfinished work.

**Decision:** per this task's instructions, do not implement Phase 1C UI code
against a foundation that does not exist yet. This document is the concrete
plan and acceptance/test matrix. Implementation starts only after Phase 1B
lands a reviewable, mergeable in-memory repository and player-surface
component structure that Phase 1C can cleanly branch from (see "Next action").
Re-inspect `worktree-phase1b-player` (or its PR once opened) before starting
implementation, since its concrete shape determines the exact integration
points below (repository interface location, component/module layout,
state-management primitives).

## What Phase 1C must not duplicate from Phase 1B

Phase 1B is expected to establish, and Phase 1C must reuse rather than
re-implement:

- The in-memory repository that wraps `runCommand`/`projectViewer` from
  `@digitable/engine` around one `AuthorityRecord<EatTheReichState>`.
- The `apps/web` Vite/React app skeleton, build tooling, and Vitest/axe wiring.
- Any shared UI primitives (buttons, live-region announcer, pool explanation
  display, dice-face rendering) built for the player compose/roll/allocate flow.
- The phone-width, reduced-motion, and axe check harness/config Phase 1B adds.

Phase 1C's job is additive: a second and third viewer role (`gm`, `table`) on
top of the same repository, plus the multi-role local simulation that lets a
single browser tab (or test harness) drive all three roles against one shared
in-memory room to prove the full opposed-action loop.

## Objective (roadmap exit criterion)

> One encounter resolves end to end with simulated roles.

Concretely: a local, in-memory session with one player seat, one GM seat, and
one read-only table seat resolves the existing `BeginAction → ActionRolled →
SubmitOpposition → OppositionRolled → AllocateResults → ActionResolved` flow
(already implemented and tested in `templates/eat-the-reich`), with each seat
observing only its own authorized `ViewerProjection` throughout, and the GM
issuing the opposition command from a director-style console rather than the
player surface.

## In scope

### 1. GM opposition controls

- A GM route/surface (`/room/:roomId/gm` per `docs/ARCHITECTURE.md` section 6,
  simulated locally — no real routing/auth in this phase) that renders the
  GM's own `ViewerProjection<EatTheReichView>`: full threat list including
  `ThreatGmSummary` (hidden difficulty modifier, hidden intel), the active
  roll's GM-only fields (`hiddenDifficultyModifier`, un-redacted
  `playerFaces`), and pending-opposition state.
- A control that submits `SubmitOpposition` with a `pushDice` input, calling
  the shared repository's command path exactly the way the player surface
  calls `BeginAction`/`AllocateResults` — no parallel command-dispatch code
  path.
- A "waiting for GM" / "opposition pending" indicator only appears once the
  player has an unresolved roll in `rolling-player`/`waiting-on-gm` status
  (`docs/UX_RESOLUTION_THEATRE.md` state machine); the GM view must reflect
  the same `activeRoll.status` the engine produces, not a locally invented GM
  state machine.
- Only `SubmitOpposition` is implemented as a GM command in this phase — this
  matches the template's existing `EatTheReichCommand` union. Encounter
  loading, difficulty presets, overrides-with-reason, and safety controls
  described in `docs/EAT_THE_REICH_BUILD_GUIDE.md`'s GM flow are **not**
  modeled in the current template contract and are out of scope (see
  "Explicit exclusions").

### 2. Shared-table projection (read-only)

- A table route/surface (`/room/:roomId/table`) that renders the `table`
  viewer's projection: public character summaries, public threat summaries
  (no hidden fields — `project()` already returns `ThreatPublicSummary` for
  any non-`gm` capability, confirmed in `templates/eat-the-reich/src/engine.ts`),
  and the active roll without GM-only fields, with `self` always `null`
  (no character binds to the reserved `table` viewer ID).
- The table surface issues **no commands**. This is enforced at two levels:
  the UI renders no actionable controls, and the local simulation harness's
  platform-authorization layer (already enforced in `@digitable/engine`,
  `Capability = "player" | "gm" | "table"`) rejects any command attributed to
  a `table` capability actor — add a regression test proving this rather than
  relying on the UI omission alone.
- Table view does not receive or render Pause/Fade/Veil/Skip controls
  (`docs/UX_RESOLUTION_THEATRE.md`: "The read-only table surface cannot
  invoke them"). Since safety commands do not exist yet in the current
  template/engine surface, this is enforced as "table renders no safety
  controls" rather than a command-rejection test; revisit when safety
  commands are implemented.

### 3. Local in-memory command path (multi-role simulation)

- One shared, in-process `AuthorityRecord<EatTheReichState>` instance per
  simulated room, held by the same in-memory repository Phase 1B introduces
  (not a second implementation). If Phase 1B's repository is scoped
  per-viewer or per-tab in a way that cannot be shared across three
  simultaneously rendered roles in one process, that is a blocking
  integration gap to resolve during Phase 1C's kickoff, not something to work
  around with a parallel store.
- A thin local "simulation harness" (test-only and/or a dev-only route, not
  shipped as a multi-tenant feature) that instantiates three viewer contexts
  (`player`, `gm`, `table`) against the one shared repository and exposes each
  as an independently rendered surface, so a single developer/test can drive
  the whole encounter without real networking, auth, or persistence.
- Every command still flows through `runCommand` → `reduce` → `projectViewer`
  exactly as Phase 1A/1B established; Phase 1C adds no new command-execution
  code path, only additional callers (GM surface) and additional projected
  viewers (`gm`, `table`) of the existing path.

### 4. Projection isolation (extended)

- Extend the existing `@digitable/testing` projection-isolation property
  (`findLeakedSecrets`/`collectStrings`, already exercised for player
  projections in Phase 1A) to run across all three concurrently-live
  projections (`player`, `gm`, `table`) for every step of the opposed-action
  flow, not just GM-vs-player as today. Concretely: after each accepted
  command, assert:
  - `table`'s projection contains no hidden threat fields, no other member's
    private fields (none currently exist, but assert the shape rather than
    assume it), and no un-redacted `playerFaces`/`hiddenDifficultyModifier`.
  - `player`'s projection is unchanged in its isolation guarantees now that a
    GM and table viewer are also live (i.e., adding viewers must not weaken
    existing player-vs-GM isolation).
  - `gm`'s projection is the only one carrying `hiddenDifficultyModifier`,
    `hiddenIntel`, and un-redacted `playerFaces` when a hidden adjustment
    applied.
- This is a property test (fixed-seed, run across the existing scenario
  matrix in `templates/eat-the-reich`), not just an assertion in one
  hand-written scenario.

### 5. Multi-role local simulation & desktop-width tests

- Component/integration tests that render all three surfaces against one
  shared in-memory room and drive the full flow (`BeginAction` from the
  player surface → `SubmitOpposition` from the GM surface → `AllocateResults`
  from the player surface) asserting each surface's rendered DOM only ever
  shows what its own projection contains at each step.
- Desktop-width viewport tests (per roadmap: "desktop-width tests" for Phase
  1C, complementing Phase 1B's phone-width tests) for the GM console layout,
  since a director console is expected to use more available width than the
  phone-first player surface (`docs/EAT_THE_REICH_BUILD_GUIDE.md` GM flow:
  "persistent director console").
- Reuse Phase 1B's reduced-motion and axe-check harness against the new GM
  and table surfaces; do not stand up a second accessibility-check
  configuration.

### 6. Responsive accessibility

- GM and table surfaces meet the same bar Phase 1B establishes for the
  player surface: keyboard operability for every control (no drag-only
  interaction — the GM's opposition input is a numeric/stepper control, not a
  drag target), accessible names/roles, a polite live region for ordinary
  status changes (`waiting-on-gm` announced once per
  `docs/UX_RESOLUTION_THEATRE.md`), and a working non-animated/reduced-motion
  path.
- Table surface in particular is meant for a shared/large display
  (`docs/ARCHITECTURE.md` section 6); verify its layout and text sizing don't
  assume a mouse-and-keyboard desk setup the way the GM console can.
- Automated axe checks on GM and table surfaces at both the phone-width
  breakpoint (table/GM could still be opened on a phone in practice) and the
  desktop-width breakpoint this phase adds.

## Explicit exclusions

Restated from `AGENTS.md` scope discipline and `docs/ARCHITECTURE.md` section
17 — do not pull these into Phase 1C:

- No Firebase, Firestore, RTDB, Functions, anonymous auth, App Check, or any
  networking. The shared room is one in-process object; there is no realtime
  sync, reconnect, or multi-device concern in this phase.
- No real room codes, seat claiming/recovery, or membership/admission flow.
  Role assignment in the local simulation harness is a fixed, hardcoded
  mapping for the purpose of exercising the three viewer types.
- No encounter loading/authoring, difficulty presets, override-with-reason
  logging, private GM messages, sound/FX control, or safety interrupts
  (Pause/Fade/Veil/Skip) — none of these exist in the current
  `EatTheReichCommand`/`EatTheReichEvent` surface, and adding them would pull
  forward Phase 3 campaign-tooling and safety work ahead of its place in the
  roadmap.
- No Resolution Theatre/PixiJS presentation layer — `docs/ARCHITECTURE.md`
  section 17 defers presentation renderers to a later step; Phase 1C's DOM
  must be sufficient and accessible on its own per ADR-005.
- No second template. `templates/eat-the-reich`'s existing single opposed
  action remains the only content exercised.
- No changes to `packages/contracts` or `packages/engine`'s public contracts.
  If the GM/table surfaces reveal a genuine contract gap (for example, if
  Phase 1B's repository shape can't actually host three concurrent viewers),
  record it as a finding and resolve it deliberately rather than patching the
  engine silently mid-UI-work.
- No changes to `templates/eat-the-reich`'s pure functions unless a genuine
  bug in GM/table projection is found (e.g., a hidden field leaking to
  `table`). Any such fix is a template-layer bug fix with its own unit test,
  not a Phase 1C feature.

## Implementation plan (once unblocked)

1. Re-sync with the merged/reviewable state of Phase 1B. Identify the exact
   in-memory repository module and its public interface (command dispatch +
   projection subscription per viewer).
2. Add `gm` and `table` role wiring to the local simulation harness:
   construct `ViewerContext`s for `{ viewerId: "gm", capability: "gm" }` and
   `{ viewerId: "table", capability: "table" }` alongside the existing player
   viewer(s), all reading from the one shared `AuthorityRecord`.
3. Build the GM surface component tree reusing Phase 1B's shared UI
   primitives: threat panel (with hidden fields), active-roll panel, and the
   `SubmitOpposition` control (push-dice stepper/input + submit button wired
   to the shared command-dispatch function).
4. Build the table surface component tree: a stripped-down, read-only render
   of the shared view (location/objective/threats/characters/active roll),
   no controls.
5. Add the cross-viewer projection-isolation property test extension in
   `packages/testing`/`templates/eat-the-reich` covering all three roles.
6. Add the multi-role integration test that drives the full flow across all
   three surfaces in one test and asserts per-surface rendered content at
   each step.
7. Add desktop-width viewport tests for the GM console; extend the existing
   axe/reduced-motion checks to the new surfaces at both breakpoints.
8. Run format/lint/typecheck/tests; update `CLAUDE_HANDOFF.md`; request
   independent review before merge, per `AGENTS.md`.

## Acceptance criteria

- [ ] A local simulation resolves one full opposed action
      (`BeginAction`→`ActionRolled`→`SubmitOpposition`→`OppositionRolled`→
      `AllocateResults`→`ActionResolved`) with the player, GM, and table
      surfaces all rendering from the same shared in-memory room.
- [ ] GM surface renders `hiddenDifficultyModifier`/`hiddenIntel` and
      un-redacted `playerFaces`; player and table surfaces never render them,
      proven by an automated property test, not spot-checked manually.
- [ ] Table surface renders no actionable controls and cannot submit any
      command; a command attributed to the `table` capability is rejected by
      platform authorization (existing engine behavior — add a regression
      test exercising it through the local harness).
- [ ] GM's `SubmitOpposition` control uses the same command-dispatch path as
      the player's `BeginAction`/`AllocateResults` controls — no parallel
      dispatch implementation.
- [ ] Keyboard-only operation completes the full GM and table interaction
      surface (table has no interaction surface beyond focus/reading order).
- [ ] Automated axe checks pass on GM and table surfaces at phone-width and
      desktop-width breakpoints.
- [ ] Reduced-motion path verified equivalent (no information conveyed by
      motion alone) on GM and table surfaces.
- [ ] `waiting-on-gm` and result announcements use a polite live region,
      announced once, matching `docs/UX_RESOLUTION_THEATRE.md`.
- [ ] No changes to `packages/contracts`, `packages/engine`, or
      `templates/eat-the-reich`'s pure functions beyond a documented,
      independently reviewed bug fix if one is found.
- [ ] `npm run format`, `npm run lint`, `npm run typecheck`, and
      `npx vitest run` all pass with the new surfaces included.

## Test matrix

| Area | Test | Type | Priority |
|---|---|---|---|
| GM controls | GM surface renders hidden threat fields and un-redacted roll faces | Component | P0 |
| GM controls | `SubmitOpposition` control submits via shared dispatch path and produces `OppositionRolled` | Integration | P0 |
| GM controls | GM push-dice input is keyboard-operable (tab to focus, arrow/type to set value, enter/click to submit) | Accessibility/Component | P0 |
| GM controls | GM surface reflects `activeRoll.status` from the engine, not a locally invented state | Component | P1 |
| Shared-table | Table surface renders public threat/character summaries only, `self` is null | Component | P0 |
| Shared-table | Table surface renders no interactive controls (no buttons/inputs beyond passive display) | Component | P0 |
| Shared-table | A command attributed to `table` capability is rejected by platform authorization | Unit/Integration | P0 |
| Shared-table | Table surface never renders Pause/Fade/Veil/Skip (not yet implemented anywhere, but assert absence explicitly) | Component | P2 |
| Local command path | GM, player, and table surfaces read from one shared `AuthorityRecord` instance in-process | Integration | P0 |
| Local command path | No parallel/duplicate command-execution code path exists outside the shared repository call | Code review / static check | P0 |
| Projection isolation | Property test: after every accepted command, `table` projection contains no hidden fields | Property | P0 |
| Projection isolation | Property test: `gm` projection is the only one with `hiddenDifficultyModifier`/`hiddenIntel`/un-redacted faces | Property | P0 |
| Projection isolation | Adding GM/table viewers does not regress existing player-vs-GM isolation from Phase 1A | Regression/Property | P0 |
| Projection isolation | Each viewer's projection stays within the 64 KiB ceiling (`checkProjectionBudget`) with all three viewers live | Unit | P1 |
| Multi-role simulation | Full encounter (one opposed action) resolves end to end across all three surfaces in one test | E2E-style/Integration | P0 |
| Multi-role simulation | Late-rendered table/GM surface (mounted mid-flow) reflects current state correctly, not stale initial state | Integration | P1 |
| Responsive/accessibility | Axe checks pass on GM surface at phone-width and desktop-width | Accessibility | P0 |
| Responsive/accessibility | Axe checks pass on table surface at phone-width and desktop-width | Accessibility | P0 |
| Responsive/accessibility | Reduced-motion setting removes non-essential motion on GM/table without losing information | Accessibility/Component | P1 |
| Responsive/accessibility | `waiting-on-gm` announced once via polite live region on player and GM surfaces | Accessibility/Component | P1 |
| Responsive/accessibility | Desktop-width GM console layout does not clip/overflow at minimum supported width | Visual/Component | P2 |
| Exclusions guard | No new dependency on Firebase/PixiJS/Three.js/react-router-style networking introduced | Static check (dependency grep, matches Phase 1A's approach) | P0 |
| Exclusions guard | No second template package added | Static check | P2 |

## Risks / open questions

- **Repository sharing across roles.** It is not yet known whether Phase
  1B's in-memory repository is designed to be instantiated once and observed
  by multiple concurrently-rendered viewer contexts (needed for GM+player+
  table in one process), or whether it assumes a single-viewer-per-instance
  shape that would need a small, deliberate extension. Resolve this by
  reading Phase 1B's actual repository code once available, not by
  guessing here.
- **GM "override" and difficulty-preset UI** described in
  `docs/EAT_THE_REICH_BUILD_GUIDE.md` has no backing command/event yet. If
  John wants any of that pulled into 1C, it needs a contract change first
  (new command/event, `decide`/`reduce`/`project` updates, tests) — that is
  bigger than "GM and shared views" as scoped by the roadmap and should be a
  separate, explicit scope decision, not something inferred from the build
  guide during 1C implementation.
- **Desktop-width breakpoint value.** Neither `docs/ARCHITECTURE.md` nor
  `docs/UX_RESOLUTION_THEATRE.md` names a specific desktop breakpoint. Phase
  1B's phone-width tests will have picked a concrete phone width; Phase 1C
  should pick a concrete desktop width consistently with whatever viewport
  testing utility Phase 1B introduces, rather than inventing a second
  convention.

## Next action

1. Do not start Phase 1C implementation yet. Watch for Phase 1B to reach a
   reviewable, committed/pushed state (PR opened against `main` or merged).
2. When Phase 1B is available, re-read its actual repository and component
   code (not just this plan's assumptions), confirm or correct the
   integration points in "Implementation plan" above, then implement per this
   plan.
3. Run `npm run format`, `npm run lint`, `npm run typecheck`, and
   `npx vitest run` before calling any implementation slice done, and record
   results in `CLAUDE_HANDOFF.md` per `AGENTS.md`.
4. Request independent review before merge, per `AGENTS.md` and the
   precedent in `docs/reviews/`.
