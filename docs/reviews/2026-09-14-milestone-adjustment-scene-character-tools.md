# 2026-09-14 milestone adjustment: scene/character tools prioritized for ETR play

- **Authority:** John, 2026-09-14, relayed as the mission statement of GitHub
  issue #14 ("Eat the Reich: three-day execution board for Fable and
  Sonnet"): "focus DigitTable's art AND play on Eat the Reich, deliver
  private playable sessions within three days ... defer generic modules."
- **Recorded by:** Sonnet A, task A02, per the board's explicit instruction
  to "record the user-authorized milestone adjustment in canonical docs
  before implementing the newly prioritized scene/character tools" and to
  keep it out of PR #13 (admission gate).
- **What changes:** `docs/IMPLEMENTATION_ROADMAP.md` gains a dated section
  pulling three Phase 3 items forward into this sprint, run alongside
  Phase 2's realtime-room work rather than sequenced after it:
  1. Character claims and resources (sheet fields, Blood/injuries,
     gear/abilities, resource effects) — board task B02.
  2. Consecutive-scene GM tooling (scene load/edit, objectives/threats,
     reveal/progress/complete, mission ending, resources carrying between
     scenes) — board task B04.
  3. A non-tactical SVG Paris route map with scene nodes — board task C03.
- **What does not change:** the rest of Phase 3 (encounter
  library/builder, dossiers, difficulty presets, broadcasts, private
  messages, lore, safety tooling, timeline) and all of Phase 4 stay in
  their original sequence. The board's "Defer" list (generic modules,
  marketplace, authoring DSL, campaign management suite, advanced
  dossiers/search, private messaging, voice/video, AI campaign generation,
  3D/PixiJS, tactical grid/fog/measurement, custom initiative, elaborate
  sound, durable accounts, public production launch) is unchanged and
  binding — in particular, the route map pulled forward in item 3 is
  explicitly the non-tactical SVG map, not a tactical grid/fog/measurement
  system.
- **Scope boundary:** this note and the roadmap edit are the only changes
  in the A02 PR that touch prioritization. No rules, character, scene, or
  map implementation code is added here — that is Sonnet B's (B02/B04) and
  Sonnet C's (C03) work, unblocked by this record existing first. PR #13
  (the admission gate, board task A01) is untouched by this change, per the
  board's explicit instruction not to mix the two.
