# Data and sync model

## Room partitions

[`ARCHITECTURE.md`](ARCHITECTURE.md#8-data-model) is the canonical path specification and rules boundary. Do not duplicate its Firestore layout here. In summary: Firestore holds a service-only authority document and binding documents, one complete projection document per viewer, physically partitioned events, actor-private receipts, and archival snapshots. RTDB holds UID-keyed ephemeral presence only.

Firebase rules—not client checks—enforce access. Private state is keyed by stable room-scoped member ID, not anonymous UID; replaceable service-only UID bindings and rotatable recovery codes permit seat recovery without moving data.

## Command/event flow

1. Client sends a UUID command to a callable Function with template version, payload, timestamp, and an optional command-family revision guard.
2. UI shows the command as pending without speculatively changing domain state.
3. Platform authority validates membership, capability, room status, payload bounds, and command guard before template authorization.
4. One Firestore transaction reads the live authority state and actor binding, checks/creates the actor-private receipt, and atomically commits authority, ordered events, revision, and full per-viewer projections.
5. Repeated or concurrent command IDs return the stored result without rerolling.
6. Clients read authoritative projections; event tails drive timeline and theatre only.

The local vertical slice implements the same repository interface in memory/local storage. Firebase is an adapter, not component-level infrastructure.

## Conflict policy

- GM transitions and encounter loads require the current room revision.
- Independent private updates merge by entity/field.
- Allocations target one unresolved roll and become invalid after resolution.
- Safety commands are never revision-gated.
- Reconnect refreshes the projection, reads the authorized event tail, then reconciles private receipts and retries pending safe commands by ID.
- Never silently discard a conflict; explain it and offer recovery.

## Audit and privacy

Dice events record the server-authoritative derivation, faces, rules version, allocations, and overrides, redacted for each destination. Visibility is represented by physical storage partitions. Per-path sequence gaps are expected because the room sequence is global. Private content must not leak into shared events, analytics, logs, receipts, or errors. Safety actor identity appears in neither client-readable game data nor application logs; infrastructure timing/address correlation remains a restricted, short-retention residual risk. Define retention and deletion before production.
