import type { SceneObjectiveInput, SceneThreatInput } from "./commands.js";

/**
 * B05: the original four-scene mission (docs/ETR_RULES_MATRIX.md Appendix
 * C) — enough for an opening, two distinct middle scenes, and a
 * conclusion. Every location, Objective, and Threat name/flavour line here
 * is a DigiTable original; only the structural shape (rating bands,
 * pacing) follows the rulebook (matrix Appendix C's own framing: "Threat
 * stat lines are original but sit in the same bands as the book's common
 * enemies so the pacing feels right"). See AGENTS.md "Non-negotiable
 * boundaries" and docs/EAT_THE_REICH_BUILD_GUIDE.md "Licensing and content
 * policy".
 *
 * This is the GM-authored *content* `LoadScene`/`NextScene` expect as their
 * payload (docs/ETR_RULES_IMPLEMENTATION_PLAN.md §3's B04 note: the
 * template has no server-side scene catalog — the GM console looks a
 * `SceneDefinition` up by id and sends it as the command). Sonnet C's
 * `SceneDirector` is the natural place to present this list.
 */
export interface SceneDefinition {
  readonly sceneId: string;
  readonly title: string;
  readonly locationLabel: string;
  readonly objectives: readonly SceneObjectiveInput[];
  readonly threats: readonly SceneThreatInput[];
  readonly reinforcementsMode: "book" | "simplified";
  /** GM-facing table notes for running the scene — never sent to any client; source only. */
  readonly gmBriefing: string;
}

const DROP_FORECOURT: SceneDefinition = {
  sceneId: "drop-forecourt",
  title: "The Forecourt of the Gare des Ombres",
  locationLabel: "The forecourt of the Gare des Ombres, dusk — the coffins have just hit",
  objectives: [
    {
      id: "drop-forecourt-clear-wreckage",
      title: "Get clear of the wreckage and into the streets",
      kind: "primary",
      rating: 8,
      challenge: 0,
    },
  ],
  threats: [
    {
      id: "drop-forecourt-patrol-a",
      name: "Station Patrol A",
      rating: 4,
      attack: 2,
      challenge: 0,
      solo: false,
      elite: false,
      flags: {},
      revealed: true,
      notes: "",
    },
    {
      id: "drop-forecourt-patrol-b",
      name: "Station Patrol B",
      rating: 4,
      attack: 2,
      challenge: 0,
      solo: false,
      elite: false,
      flags: {},
      revealed: true,
      notes: "",
    },
  ],
  reinforcementsMode: "book",
  gmBriefing:
    "Opening scene: every character introduces themselves as the coffins break open in the wreckage. Use the first Feed to teach Blood.",
};

const METRO_PLATFORM: SceneDefinition = {
  sceneId: "metro-platform",
  title: "The Abandoned Métro Platform",
  locationLabel: "An abandoned Métro platform, water dripping toward a sealed far end",
  objectives: [
    {
      id: "metro-platform-cut-through",
      title: "Cut through the tunnels to the far exit",
      kind: "primary",
      rating: 8,
      challenge: 0,
    },
  ],
  threats: [
    {
      id: "metro-platform-plated-squad",
      name: "Plated Squad",
      rating: 6,
      attack: 3,
      challenge: 1,
      solo: false,
      elite: false,
      flags: {},
      revealed: true,
      notes: "",
    },
    {
      id: "metro-platform-enforcer",
      name: "The Enforcer",
      rating: 8,
      attack: 4,
      challenge: 1,
      solo: true,
      elite: true,
      flags: {},
      revealed: false,
      notes:
        "Foreshadow with slow, heavy footsteps down the tunnel before round 1 ends; reveal at the start of round 2. Its Blood unlocks an advance for whoever lands the killing blow (matrix S4).",
    },
  ],
  reinforcementsMode: "book",
  gmBriefing: "The Enforcer is unrevealed at load; RevealThreat it once round 2 begins.",
};

const PRINTWORKS: SceneDefinition = {
  sceneId: "printworks",
  title: "The Occupier's Printworks",
  locationLabel: "The occupier's propaganda printworks, presses still running",
  objectives: [
    {
      id: "printworks-wreck-presses",
      title: "Wreck the presses and get out through the loading yard",
      kind: "primary",
      rating: 8,
      challenge: 1,
    },
    {
      id: "printworks-free-night-shift",
      title: "Free the night-shift",
      kind: "secondary",
      rating: 4,
      challenge: 0,
    },
  ],
  threats: [
    {
      id: "printworks-rifle-squad",
      name: "Rifle Squad",
      rating: 6,
      attack: 3,
      challenge: 0,
      solo: false,
      elite: false,
      flags: {},
      revealed: true,
      notes: "",
    },
    {
      id: "printworks-marksman-nest",
      name: "Marksman Nest",
      rating: 3,
      attack: 6,
      challenge: 2,
      solo: true,
      elite: false,
      flags: {},
      revealed: true,
      notes: "Fixed emplacement on the mezzanine; describe it as visible but hard to reach.",
    },
  ],
  reinforcementsMode: "book",
  gmBriefing:
    "Loot: an ink-drum on a trolley (++ rolling downhill) is available via GrantItem if a player narrates taking it. Completing the secondary Objective offers one of matrix S2's six rewards — a GM correction, since ChooseSecondaryReward isn't automated this milestone.",
};

const SIGNAL_MAST: SceneDefinition = {
  sceneId: "signal-mast",
  title: "The Signal Mast",
  locationLabel: "The Signal Mast on the river bluff — the mission's conclusion",
  objectives: [
    {
      id: "signal-mast-silence-the-voice",
      title: "Silence the Voice",
      kind: "primary",
      rating: 10,
      challenge: 1,
    },
  ],
  threats: [
    {
      id: "signal-mast-armoured-truck",
      name: "Armoured Truck",
      rating: 4,
      attack: 2,
      challenge: 1,
      solo: true,
      elite: false,
      flags: {},
      revealed: true,
      notes: "",
    },
    {
      id: "signal-mast-warden",
      name: "The Warden",
      rating: 10,
      attack: 5,
      challenge: 1,
      solo: true,
      elite: true,
      flags: { challengeLocked: true, injuryMarksWholeCategory: true },
      revealed: false,
      notes:
        "The mission's final guardian. Foreshadow through the whole scene (a voice on every speaker, a shape on the mast); reveal when the party is committed, no earlier than round 2. Challenge cannot be lowered by any effect; any injury it inflicts marks the whole rolled category.",
    },
  ],
  reinforcementsMode: "book",
  gmBriefing:
    "Conclusion: once the primary Objective reaches 0, EndMission becomes available. Prompt an epilogue line from each surviving character.",
};

/** The four scenes in play order (matrix Appendix C). */
export const ORIGINAL_MISSION: readonly SceneDefinition[] = [
  DROP_FORECOURT,
  METRO_PLATFORM,
  PRINTWORKS,
  SIGNAL_MAST,
];
