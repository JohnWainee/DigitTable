# Implementation roadmap

## Phase 0 — rights and decisions

- Document what game content may be stored and distributed.
- Choose hosting/Firebase projects and retention policy.
- Confirm sample content and first-playable devices.

Exit: authorized or placeholder material is ready.

## Phase 1A — scaffold and engine

- Scaffold workspaces and early quality gates.
- Define template, command, event, and presentation contracts.
- Implement pure decide/reduce/project and pool/allocation queries with deterministic dice.
- Add allocation, idempotency, and projection-isolation tests.

Exit: one opposed action resolves in the pure engine with placeholder content.

## Phase 1B — player surface

- Add React/Vite and an in-memory repository.
- Build compose, explain, roll, wait, allocate, and confirm states.
- Add phone-width keyboard, reduced-motion, and axe checks.

Exit: the player flow resolves locally and accessibly.

## Phase 1C — GM and shared views

- Add GM opposition controls and a read-only shared-table capability.
- Add multi-role local simulation and desktop-width tests.
- Complete one opposed roll/allocation flow across all views.

Exit: one encounter resolves end to end with simulated roles.

## Phase 2 — realtime room

- Firebase emulator, anonymous auth, App Check monitoring, Firestore/RTDB rules.
- Stable member seats, recovery codes, room admission, GM claim, RTDB presence, private partitions.
- Idempotent commands, ordering, reconnect, offline queue.
- Multi-device tests and failure injection.

Exit: three physical clients survive disconnect/reconnect.

## Phase 3 — campaign tools

- Interactive SVG Paris map and discovery state.
- Encounter library/builder, dossiers, and difficulty presets.
- Character, equipment, injury, and Blood workflows.
- Broadcasts, private messages, lore, safety, and timeline.

Exit: a GM runs a short session without external bookkeeping.

## Phase 4 — presentation and hardening

- Template-driven PixiJS theatre and sound.
- Optional 3D dice behind capability checks.
- PWA caching/update UX, observability, backups, and export.
- App Check enforcement, accessibility audit, performance budgets, threat model, and playtests.

Exit: release candidate passes accessibility, security, reconnect, and facilitated playtests.

## Later

Marketplace, public user-generated content, tactical maps, voice/video, advanced accounts, generic rules authoring, and AI-generated campaign content.
