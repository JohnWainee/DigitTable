# Template architecture

## Boundary

```text
apps/web
apps/functions
packages/contracts
packages/engine
packages/testing
templates/eat-the-reich
  manifest  rules  content  theme  theatre  assets
```

## Template contract

A template provides identity/version metadata, validated state schemas, action and allocation rules, terminology, map definitions, theatre scenes, content indexes, and migrations.

The platform provides identity and rooms; mandatory membership/capability authorization; authoritative command/event handling; shared, private-player, and GM-only visibility; sync and recovery; a dice interface and audit metadata; accessible primitives and safety tools; and history/export. Presentation and broader platform packages are extracted only after concrete use proves a boundary.

## Rules design

Rules are typed pure functions. The template contract explicitly provides pool explanations and valid allocations over a viewer projection, so UI may query them locally but may not reimplement mechanics. Decisions assign every event to shared, GM, or named-member destinations. State changes occur through platform-authorized, template-validated commands reduced into events. Presentation consumes results; it never decides them.

Avoid an unrestricted scripting API in v1. A TypeScript template shipped with the app is enough to prove the boundary safely.

## Versioning

Persist `platformVersion`, `templateId`, `templateVersion`, and `schemaVersion` with every campaign. Templates own migrations. Refuse incompatible loads with a recoverable export path.
