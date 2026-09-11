# Implementation roadmap

## Phase 0 — rights and decisions

- Document what game content may be stored and distributed.
- Choose hosting/Firebase projects and retention policy.
- Confirm sample content and first-playable devices.

Exit: authorized or placeholder material is ready.

## Phase 1 — local vertical slice

- Scaffold app and quality gates.
- Define template, command, event, and presentation contracts.
- Implement local repository and event projection.
- Build player, GM, and shared-table shells.
- Complete one opposed roll/allocation flow.
- Add responsive and accessibility browser tests.

Exit: one encounter resolves end to end with simulated roles.

## Phase 2 — realtime room

- Firebase emulator, anonymous auth, and rules.
- Room join, GM claim, presence, private partitions.
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
- Accessibility audit, performance budgets, threat model, and playtests.

Exit: release candidate passes accessibility, security, reconnect, and facilitated playtests.

## Later

Marketplace, public user-generated content, tactical maps, voice/video, advanced accounts, generic rules authoring, and AI-generated campaign content.
