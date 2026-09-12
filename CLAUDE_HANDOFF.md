# Claude implementation handoff

- **Status:** Architecture direction approved; second-pass findings folded into PR #1; implementation has not started
- **Branch:** `codex/eat-the-reich-platform-plan`
- **PR:** `JohnWainee/DigitTable#1`
- **Last updated:** 2026-09-12 by Codex

## Mission

Build DigiTable as a reusable narrative-RPG play surface, with *Eat the Reich* as the first template and Signal Bleed as a behavioral reference.

Signal Bleed's useful patterns are room codes, GM-seat ownership, shared/GM/private state separation, lore outside sessions, local resilience, broadcasts, safety-minded play, and deliberate deploy controls. Do not port its self-contained HTML/no-build architecture.

## Current state

- Repository is initialized and connected to GitHub.
- Architecture work is on this branch and draft PR #1.
- No application scaffold, dependencies, Firebase project, or production credentials exist yet.
- No licensed game text, art, or audio is approved for commit.
- The revised architecture selects trusted Firebase Functions as command authority, Firestore as transactional event/projection storage, and RTDB for ephemeral presence.

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

## First implementation PR after approval: scaffold and engine

Scope it to a local-only vertical slice:

1. Add `AGENTS.md` with architecture/handoff and independent-review expectations.
2. Scaffold npm workspaces, TypeScript, Vitest, ESLint, and formatting without React or Firebase.
3. Create `contracts`, `engine`, `testing`, and the initial-template package.
4. Use original placeholder data for one character, location, objective, and threat.
5. Implement pure `decide`, `reduce`, `project`, `explainPool`, and `validAllocations` for one opposed action with a fixed-seed deterministic generator.
6. Include bounded authority-record and atomic per-viewer projection fixtures in the contracts.

### Required checks

- Format, lint, and typecheck.
- Unit tests for platform authorization, `authorizeGameAction`, `decide`, `reduce`, `project`, dice interpretation, and allocation invariants.
- Property/fixture tests proving one member projection never contains another member's private state.
- No Three.js, production credentials, licensed source assets, marketplace, tactical grid, or generic rules DSL.

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

Run documentation consistency checks, obtain final review of this resolution commit, merge PR #1 followed by PR #2, then create a fresh scaffold-and-engine implementation branch from updated `main`.
