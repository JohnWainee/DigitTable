# Implementation roadmap

## 2026-09-14 milestone adjustment: Eat the Reich three-day release

John's 2026-09-14 direction (GitHub issue #14) reprioritizes this roadmap for
a three-day push to a private playable Eat the Reich session: **scene and
character tools are pulled forward into this sprint, ahead of the rest of
Phase 3**, running alongside Phase 2's realtime-room work instead of waiting
for it to fully close. Specifically, out of Phase 3's list below, this sprint
includes:

- Character claims, verified sheet fields, Blood/injuries, gear/abilities,
  and resource effects (board task B02).
- Consecutive-scene GM tooling: load/edit a scene, multiple
  objectives/threats, reveal/progress/complete transitions, and mission
  ending, with resources carrying between scenes (board task B04).
- A non-tactical SVG Paris route map with scene nodes for GM/table display
  (board task C03) — explicitly **not** the tactical grid/fog/measurement
  system Phase 3/4 might otherwise imply; that remains deferred (see
  "Later", below, and the board's "Defer" section).

Everything else in Phase 3 (encounter library/builder, dossiers, difficulty
presets, broadcasts, private messages, lore, safety tooling, timeline) and
all of Phase 4 stay in their original sequence and are **not** pulled
forward. Phase 2's realtime-room scope (room admission, GM claim, idempotent
commands, reconnect, multi-device tests) is unchanged and remains this
sprint's other concurrent track (board tasks A01–A07). This note is the
canonical record of the adjustment; day-by-day execution and status live on
issue #14, not here.

## Phase 0 — rights and decisions

- Document what game content may be stored and distributed.
- Choose hosting/Firebase projects and retention policy.
- Confirm sample content and first-playable devices.

Exit: authorized or placeholder material is ready.

## Phase 1A — scaffold and engine

- Scaffold workspaces and early quality gates.
- Define template, command, event, and presentation contracts.
- Define the bounded authority-record and atomic per-viewer projection shapes.
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
- Stable member seats, hardened recovery/rotation, room admission, GM claim, UID-keyed RTDB presence, private partitions.
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
