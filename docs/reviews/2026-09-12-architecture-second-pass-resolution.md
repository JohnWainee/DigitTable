# Architecture second-pass resolution

- **Source review:** Claude, commit `868c75c` on PR #2
- **Reviewed proposal:** `f956e59` on PR #1
- **Decision:** Direction approved by John on 2026-09-12; findings accepted and folded into the canonical architecture
- **Canonical document:** [`../ARCHITECTURE.md`](../ARCHITECTURE.md)

## Disposition

| Finding | Resolution |
|---|---|
| N1 | Added `authority/current` as the sole live full-state source, defined the transaction read/write set, made snapshots archival copies, and set a 256 KiB working budget plus 1 MiB ceiling test. |
| N2 | Replaced tree-like notation with valid Firestore collection/document paths, selected nested event visibility partitions, added a rules sketch, and removed the duplicate layout from the sync summary. |
| N3 | Replaced split shared/private projection listeners with one complete projection document per viewer. |
| N4 | Keyed RTDB presence by UID, enforced self-write rules, and explicitly accepted authenticated room-ID-level presence visibility as a limited residual disclosure. |
| N5 | Added code rotation, GM-assisted player recovery, 64-bit minimum entropy, URL prohibition, per-room/IP throttling, lockout, stale-presence removal, a UID-free audit event, and GM takeover remedies. |
| N6 | Replaced pre-generated dice with one cryptographic invocation seed and a retry-stable deterministic generator in `DecisionContext`. |
| N7 | Narrowed the anonymity claim, documented infrastructure correlation risk, added receipt/event tests, and prohibited a distinctive safety pending state. |
| N8 | Split public member metadata from service-only UID bindings. |
| N9 | Recorded worst-case transaction and per-session projection bandwidth and established measured triggers for patch projections. |
| N10 | Changed room routes to use opaque, stable room IDs; rotatable codes remain join inputs only. |
| N11 | Corrected billing and offline-persistence statements, limited safety controls to player/GM surfaces, and kept testing fixture-only before realtime work. |
| N12 | Clarified that pre-roll explanations use viewer-visible state and required `ActionRolled` to carry the appropriately redacted server-authoritative derivation. |

## Resulting implementation gate

The scaffold-and-engine slice may start after this documentation revision is independently checked and PR #1 merges. Its contracts and fixtures must include the bounded authority record, complete per-viewer projections, and fixed-seed deterministic randomness. Firebase adapters, emulator helpers, rules, and recovery flows remain deferred to the realtime milestone.
