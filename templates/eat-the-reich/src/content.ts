import type { MemberId } from "@digitable/contracts";
import type { CharacterState, LocationState, ObjectiveState, ThreatState } from "./state.js";

/**
 * Original placeholder campaign content for the first playable slice: one
 * character, one location, one objective, and one threat. Names match the
 * original placeholder art pack (assets/generated/eat-the-reich/README.md)
 * for consistency; no licensed text or mechanics are reproduced.
 */

export const DICE_SIDES = 6;
export const SUCCESS_THRESHOLD = 5; // a face of 5 or 6 counts as a hit

export const ACTION_ID = "strong-arm-the-enforcer";
export const ACTION_LABEL = "Strong-Arm the Enforcer";
export const THREAT_ID = "enforcer";
export const GEAR_SILENCED_TOOL = "silenced-tool";

/** Gear that contributes to ACTION_ID's pool, and how much each grants. */
export const ACTION_GEAR_BONUS: Readonly<Record<string, number>> = {
  [GEAR_SILENCED_TOOL]: 1,
};

export const PLACEHOLDER_LOCATION: LocationState = {
  id: "metro-platform",
  name: "Abandoned Métro Platform",
  description:
    "A flooded, disused Métro platform. Water drips toward a sealed door glowing faintly red at the far end.",
};

export const PLACEHOLDER_OBJECTIVE: ObjectiveState = {
  id: "silence-the-alarm",
  title: "Silence the alarm before reinforcements arrive",
  description:
    "The sealed door is wired to an alarm relay. Disable the enforcer guarding it before the sound draws more of them.",
  advancesRemaining: 2,
  status: "active",
};

export function placeholderCharacter(memberId: MemberId): CharacterState {
  return {
    memberId,
    name: "Rook",
    attributes: { nerve: 2 },
    gear: [GEAR_SILENCED_TOOL],
    wounds: 0,
    maxWounds: 3,
  };
}

export const PLACEHOLDER_THREAT: ThreatState = {
  id: THREAT_ID,
  name: "The Enforcer",
  description: "A pale occult enforcer in a black coat, wearing a cracked porcelain half-mask.",
  basePool: 3,
  resolveRemaining: 3,
  maxResolve: 3,
  // GM-only: secretly stiffens (or eases) the player's pool for this scene.
  // Never exposed to a non-GM projection or a pre-roll pool explanation.
  hiddenDifficultyModifier: -1,
  hiddenIntel:
    "It periodically checks a hidden wrist relay; disrupt that and the alarm goes quiet for good.",
  status: "active",
};
