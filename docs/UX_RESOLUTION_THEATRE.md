# UX and Resolution Theatre

## Principle

The rules engine stays mostly invisible; fiction, consequence, and player choice remain foregrounded. Mechanical derivations are always available, never forced into the main flow.

## State machine

```text
compose → ready → rolling-player → rolling-opposition → reveal
        → allocating → applying → resolved | cancelled | interrupted
```

Every transition has accessible DOM text and an event-log entry. PixiJS or 3D layers mirror state; they do not own it.

## Visual grammar

- living pulp dossier: paper, stamps, grease pencil, torn photos, condensed type;
- bone/black base with restrained blood-red and electric accents;
- quiet motion at rest and brief impact during major resolution;
- shared cutaways for reveals, criticals, downed characters, and transitions.

Avoid a sober military-simulator tone. Use original or licensed assets only.

## Presentation levels

- **Cinematic:** synchronized transitions, sound, particles, optional physical dice.
- **Standard:** short 2D transitions and restrained audio.
- **Reduced:** instant changes, no nonessential movement, equivalent text/status.

Respect OS reduced-motion. Provide separate animation, flashing, camera, sound, volume, and haptics controls. Never require drag; allocations also support tap/select and keyboard input.

## Shared cutaways and safety

Every client receives the same semantic scene/event ID, but timing tolerates slow devices and late joins. A client can skip locally without blocking resolution.

Pause, Fade/Veil, and Skip remain reachable at all times and do not reveal their actor. Safety activation interrupts presentation and suppresses queued effects cleanly.
