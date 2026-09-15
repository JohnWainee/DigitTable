# Eat the Reich build guide

## Product position

This is not a generic virtual tabletop with a themed skin. The game book should feel alive: Paris is the board, characters are live dashboards, encounters are executable objects, and the GM operates a director console.

The platform owns infrastructure and interaction primitives. The template owns terminology, rules, data schemas, visual grammar, sound cues, and presentation scenes.

## Experience pillars

1. **Interactive campaign map.** Browsable outside sessions; during play it records route, discoveries, active locations, threats, and completed objectives.
2. **Rules-aware character dashboard.** Mobile-first actions, Blood, injuries, equipment, abilities, and pool explanations on demand.
3. **Executable encounters.** The GM loads or composes locations, objectives, threats, NPCs, complications, and rewards without leaving the scene.
4. **Synchronized resolution.** Player and GM rolls become a shared event; the player retains meaningful allocation decisions.
5. **Persistent dossier and after-action report.** Lore unlocks through play and the event log becomes a campaign record.

## Player flow

- Join by room code and claim/select a character.
- Between scenes: Map, Character, Dossier.
- In a scene: objective, visible threats, Blood/injuries, contextual actions.
- Select an action and optional equipment/ability inputs.
- Review a compact pool; expand “Why?” for its derivation.
- Roll, view opposition, and allocate usable dice to valid targets.
- Confirm the resulting state and shared narrative event.

## GM flow

- Claim the GM seat and open a persistent director console.
- Load a prepared encounter or assemble one from searchable content.
- Adjust difficulty explicitly; show every value changed by a preset.
- Control scene state, opposition, reveals, private messages, sound/FX, and safety state.
- Override suggestions with a reason captured in the event log.

## Scope boundaries

The first milestone is zone/scene based, not tactical-grid play. Do not build line of sight, measuring tools, initiative automation, or a generic rules scripting language. Do not automate away judgment or dice allocation.

Use placeholder content until licensing is documented. Content ingestion must not couple copyrighted text to the engine.

## Licensing and content policy (B01, 2026-09-14)

Per `docs/ETR_RULES_MATRIX.md` §5 and `AGENTS.md` "Non-negotiable boundaries": ordinary
game-mechanical structure and short field labels — the seven stat names (BRAWL, CON, FIX,
SEARCH, SHOOT, SNEAK, TERRIFY), Blood, Objective/Threat/Challenge/Attack ratings, the
success/critical thresholds, injury category names, Downed, Last Stand, Loot, and Flashback —
may be implemented in code and shown in the UI. This is ordinary game-mechanical vocabulary,
not the rulebook's expression of it.

What must never be committed to this repository, in any form: rulebook prose, character sheet
text, location entries, enemy/NPC entries, tables of flavour text, or artwork from the
published book. `templates/eat-the-reich`'s roster, scenes, items, abilities, and injury
flavour text are original creations (see `docs/ETR_RULES_MATRIX.md` Appendices A–C); they
follow the book's structural shape (stat spread, item/ability counts, scene pacing bands) but
reuse no licensed name, entry, or sentence.

A GM who owns a copy of the rulebook may play with their own book's content by loading a
private, git-ignored owner content pack from their own machine
(`content/private/*.json` — see `.gitignore`). That pack is never committed, never uploaded to
shared Firestore documents another room could read, and is not part of any release build.
