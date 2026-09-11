# Template architecture

## Boundary

```text
apps/web
packages/platform
  auth  sessions  events  sync  maps  encounters  journals  accessibility
packages/rules-runtime
packages/presentation
templates/eat-the-reich
  manifest  rules  content  theme  theatre  assets
```

## Template contract

A template provides identity/version metadata, validated state schemas, action and allocation rules, terminology, map definitions, theatre scenes, content indexes, and migrations.

The platform provides identity and rooms; authoritative command/event handling; shared, private-player, and GM-only visibility; sync and offline recovery; a dice interface and audit metadata; accessible primitives and safety tools; and history/export.

## Rules design

Rules are typed pure functions. UI may request a pool explanation or valid allocations, but may not reimplement mechanics. State changes occur through validated commands reduced into events. Presentation consumes results; it never decides them.

Avoid an unrestricted scripting API in v1. A TypeScript template shipped with the app is enough to prove the boundary safely.

## Versioning

Persist `platformVersion`, `templateId`, `templateVersion`, and `schemaVersion` with every campaign. Templates own migrations. Refuse incompatible loads with a recoverable export path.
