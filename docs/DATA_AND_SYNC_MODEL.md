# Data and sync model

## Room partitions

Carry forward Signal Bleed's visibility model with finer-grained writes:

```text
rooms/{roomCode}
  meta
  shared
  players/{uid}
  gm
  commands/{commandId}
  events/{sequence}
  presence/{uid}
```

Firebase rules—not client checks—enforce access. Anonymous identity is acceptable for playtesting; evaluate recovery codes or account linking before promising persistent campaigns.

## Command/event flow

1. Client creates a UUID command with actor, expected revision, template version, payload, and timestamp.
2. Local projection applies an optimistic result when safe.
3. Authority validates role, revision, and template rule.
4. Accepted command emits ordered events; repeated command IDs are idempotent.
5. Clients rebuild projections and reconcile optimistic state.

The local vertical slice implements the same repository interface in memory/local storage. Firebase is an adapter, not component-level infrastructure.

## Conflict policy

- GM transitions and encounter loads require the current room revision.
- Independent private updates merge by entity/field.
- Allocations target one unresolved roll and become invalid after resolution.
- Reconnect replays missing events, then retries unsent commands by ID.
- Never silently discard a conflict; explain it and offer recovery.

## Audit and privacy

Dice events record pool inputs, faces, rules version, allocations, and overrides. Private content must not leak into shared events, analytics, logs, or errors. Define retention and deletion before production.
