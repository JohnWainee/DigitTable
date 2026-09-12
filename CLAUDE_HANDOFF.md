# Claude implementation handoff

- **Status:** Architecture ready for review; implementation has not started
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
- The architecture selects trusted Firebase Functions as command authority and RTDB as realtime event/projection storage.

## Read in this order

1. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — canonical technical proposal and ADRs.
2. [`docs/EAT_THE_REICH_BUILD_GUIDE.md`](docs/EAT_THE_REICH_BUILD_GUIDE.md) — product experience and scope.
3. [`docs/UX_RESOLUTION_THEATRE.md`](docs/UX_RESOLUTION_THEATRE.md) — presentation and accessibility.
4. [`docs/TEMPLATE_ARCHITECTURE.md`](docs/TEMPLATE_ARCHITECTURE.md) — concise template boundary.
5. [`docs/DATA_AND_SYNC_MODEL.md`](docs/DATA_AND_SYNC_MODEL.md) — concise sync summary.
6. [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md) — milestone view.

Also inspect `JohnWainee/signal-bleed` `AGENTS.md`, `README.md`, and `HANDOFF.md` for reference behavior. Its repository instructions apply only inside that repository.

## Immediate assignment: architecture review

Perform a fresh, independent review of `docs/ARCHITECTURE.md`. Report findings by severity and propose concrete edits. Challenge:

- Functions + RTDB versus direct writes or Firestore;
- atomic event/receipt/projection updates and room sequence allocation;
- shared, GM-only, and per-player path isolation;
- anonymous-auth recovery and room-join threats;
- whether the template contract exposes too much before a second game;
- DOM/Resolution Theatre accessibility equivalence;
- delivery scope for a small team.

Do not begin broad implementation until John approves the architectural direction or review changes are folded into PR #1.

## First implementation PR after approval

Scope it to a local-only vertical slice:

1. Add `AGENTS.md` with architecture/handoff and independent-review expectations.
2. Scaffold npm workspaces, TypeScript, React, Vite, Vitest, ESLint, formatting, and Playwright.
3. Create `contracts`, `engine`, `platform`, `presentation`, and initial-template packages at the documented boundaries.
4. Implement an in-memory repository; do not configure production Firebase.
5. Use original placeholder data for one character, location, objective, and threat.
6. Complete choose action → explain pool → player roll → opposition → allocate → consequences → event log.
7. Show the same accepted semantic result in player, GM, and table views.
8. Support keyboard, screen reader, and reduced-motion paths in that flow.

### Required checks

- Format, lint, and typecheck.
- Unit tests for `authorize`, `decide`, `reduce`, `project`, dice interpretation, and allocation invariants.
- Component tests for accessible pool explanation and allocation.
- Playwright smoke tests at phone and desktop widths.
- No Three.js, production credentials, licensed source assets, marketplace, tactical grid, or generic rules DSL.

## Definition of first playable

After the later realtime PR, two players and one GM can join a room, load the sample encounter, resolve an opposed action, receive correctly isolated projections, reconnect without duplicating it, invoke anonymous safety controls, and review the timeline.

## Decisions requiring John

- Game-content distribution rights and approved placeholder fixture.
- Architecture approval after independent review.
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

Independent architecture review of PR #1, followed by John's approval or requested revisions. Only then create the local vertical-slice implementation branch/PR.
