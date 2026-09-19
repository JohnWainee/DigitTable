# Sourcebook roster independent review — 2026-09-19

## Scope

Independent comparison of the six DigiTable character sheets against the owner-supplied *Eat the Reich* PDF, including names, stats, equipment, abilities, advances, injuries, Last Stands, and executable mechanics.

## First pass findings

The initial replacement had six blockers: Corpse Eater was modeled as a selectable no-op; Cigarettes and Cowboy Hat incorrectly added pool dice; printed ability bonus conditions were absent; Nicole's Scavenger numbering was absent; fixture coverage was incomplete; and comments still described original placeholders.

## Resolution

- Preserved legacy character IDs while replacing every player-facing sheet field with the supplied roster.
- Added every printed ability bonus condition and Nicole's `[1]`–`[6]` equipment mapping.
- Modeled Corpse Eater as a passive any-1 trigger that gains exactly 1 Blood once per roll.
- Added typed non-pool utility equipment plus a player-authorized `UseUtilityItem` path: Cigarettes consume a use and regain 2 Blood; Cowboy Hat is destroyed to cancel a pending Injury or Downed result.
- Added server-side rejection for attempts to submit utility equipment as pool dice.
- Added a complete roster snapshot plus focused pool and resolution regressions.

## Verification

- `npm run check` — passed: 71 test files passed, 1 skipped; 690 tests passed, 11 todo.
- `npm run build` — Functions and web production builds passed; the existing non-blocking Vite large-chunk warning remains.

## Outcome

Final independent-review disposition: **approved with no blocking findings**. The reviewer confirmed the ordinary Injury/Downed hat flow, server-enforced rolled-category choice, depleted-item handling, unique per-use event identity, Corpse Eater semantics, complete roster fixture, and source-sheet fidelity.
