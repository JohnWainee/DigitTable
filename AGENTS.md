# Agent instructions

This file governs autonomous and semi-autonomous coding agents working in this
repository. It applies repository-wide unless a more specific `AGENTS.md`
exists closer to the files being changed.

## Read before changing anything

1. [`CLAUDE_HANDOFF.md`](CLAUDE_HANDOFF.md) — current status, branch/PR, and the next action.
2. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — canonical technical proposal, ADRs, contracts, and data model.
3. [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md) — phase sequencing and exit criteria.
4. [`docs/TEMPLATE_ARCHITECTURE.md`](docs/TEMPLATE_ARCHITECTURE.md), [`docs/DATA_AND_SYNC_MODEL.md`](docs/DATA_AND_SYNC_MODEL.md), [`docs/UX_RESOLUTION_THEATRE.md`](docs/UX_RESOLUTION_THEATRE.md), [`docs/EAT_THE_REICH_BUILD_GUIDE.md`](docs/EAT_THE_REICH_BUILD_GUIDE.md).
5. `docs/reviews/` — every independent review and its resolution. Findings recorded there are decisions, not suggestions, unless a later resolution document reopens them.

`docs/ARCHITECTURE.md` is canonical. If another document appears to
contradict it, trust the architecture document and flag the discrepancy
rather than silently picking one.

## Non-negotiable boundaries

Unless a later, explicitly approved architecture revision says otherwise:

- No React, Vite client, or any UI framework before Phase 1B.
- No Firebase project, SDK wiring, emulator, or production credentials before
  the realtime milestone (Phase 2). The local engine and player-surface
  phases use an in-memory/local repository behind the same interface.
- No Three.js or other 3D rendering. PixiJS-based theatre is deferred until
  the core flow is proven.
- No licensed game text, art, audio, or terminology. Use original
  placeholder content only, and record its provenance (see
  `assets/generated/*/README.md` for the pattern).
  - **Canonical policy clarification (B01, 2026-09-14, `docs/ETR_RULES_MATRIX.md`
    §5):** ordinary game-mechanical structure and short field labels (the
    seven *Eat the Reich* stat names; Blood; Objective, Threat, Challenge,
    Attack ratings; success/critical thresholds; injury categories; Downed;
    Last Stand; Loot; Flashback) may be implemented in code and shown in the
    UI. Rulebook prose, character sheets, location and enemy entries, tables
    of flavour, and artwork remain licensed and must never be committed.
    Shipped fixtures (roster, scenes, items, abilities) are original
    creations. A GM may load their own copy's content only from a private,
    git-ignored owner content pack on their own machine
    (`content/private/*.json`, never in the repository, never in shared
    Firestore documents readable by other rooms). This is a clarification of
    the existing boundary above, not a relaxation of it.
- No generic rules-authoring DSL or remote/executable template content.
  Templates are trusted TypeScript packages shipped with a release.
- No production credentials, secrets, or real player data in the repository
  at any phase.

## Engineering invariants

These come directly from the architecture's ADRs and review resolutions.
Do not relax them without a recorded architecture change:

- `authorizeGameAction`, `decide`, `reduce`, `project`, `explainPool`, and
  `validAllocations` are pure functions with no I/O, no wall-clock reads, and
  no ambient randomness. Randomness enters only through an injected
  `RandomSource` inside `DecisionContext`.
- Platform authorization (membership, seat capability, room status, payload
  bounds, command-family guards) runs before template authorization. A
  template cannot weaken a platform check.
- `TState` (the authority record) is the sole live source of full state.
  Snapshots are archival copies, never a reconstruction path for command
  execution.
- One complete projection document exists per viewer (a member, `gm`, or
  `table`). Projections are authoritative for clients; event tails are for
  timeline/theatre only and are never replayed to reconstruct state.
- A viewer's projection must never contain another viewer's private state.
  This is tested as a property, not just spot-checked.
- Hidden GM-only inputs are redacted from player-visible projections and
  player-visible event copies. `explainPool` only ever sees what the
  viewer's own projection contains.
- Dice are drawn from a deterministic generator seeded once per command
  invocation. Tests use fixed seeds so resolution is reproducible.
- Respect the size budgets in `docs/ARCHITECTURE.md` (authority working
  budget, per-viewer projection ceiling). Add or update a fixture test
  whenever a shape that contributes to those budgets changes.

## Workflow expectations

- Keep the engine (`packages/engine`, `packages/contracts`, `templates/*`)
  framework-independent. It must build and run without `apps/web` or any
  Firebase package present.
- Every change to a pure function requires a corresponding unit test in the
  same package. Every change to a template's action/allocation surface
  requires a property or fixture test covering projection isolation.
- Run format, lint, typecheck, and the full test suite before calling work
  done. Record the commands and their results in `CLAUDE_HANDOFF.md`.
- Do not call a non-trivial change complete until it has been independently
  reviewed (a second pass, not the author's own read-through). Record the
  review outcome the way prior passes are recorded under `docs/reviews/`.
- When pausing or finishing a material unit of work, update
  `CLAUDE_HANDOFF.md`'s "Current state" and "Next action" sections, commit,
  and push alongside the code change.

## Scope discipline

Implement only what the current phase in `docs/IMPLEMENTATION_ROADMAP.md`
calls for. Do not pull forward later-phase concerns (realtime sync, GM
console, presentation renderers, campaign tooling) into an earlier PR just
because the contracts hint at them. Land the narrow slice, get it reviewed,
then proceed.
