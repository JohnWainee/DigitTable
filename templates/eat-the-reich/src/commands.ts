import type { AllocationTarget } from "./allocations.js";
import type { Stat, ThreatFlags } from "./state.js";

/** GM input describing one Objective for `LoadScene`/`NextScene`/`EditScene` (matrix 3.7 S1-S2). */
export interface SceneObjectiveInput {
  readonly id: string;
  readonly title: string;
  readonly kind: "primary" | "secondary" | "retreat";
  readonly rating: number;
  readonly challenge: number;
}

/** GM input describing one Threat for `LoadScene`/`NextScene`/`EditScene` (matrix 3.7 S4, Appendix B). */
export interface SceneThreatInput {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  readonly attack: number;
  readonly challenge: number;
  readonly solo: boolean;
  readonly elite: boolean;
  readonly flags: ThreatFlags;
  readonly revealed: boolean;
}

/**
 * The bounded fields `CorrectCharacter` may change (matrix §4 item 7,
 * docs/ETR_SESSION_FLOW.md §7's table). Every field is optional; only the
 * ones present are changed. Blood/item uses/advances stay within their
 * natural bounds (enforced in `decide`, not just by this type).
 */
export interface CharacterCorrectionPatch {
  readonly blood?: number;
  readonly downed?: boolean;
  readonly retired?: boolean;
  readonly activeLootId?: string | null;
  readonly itemUses?: readonly { readonly itemId: string; readonly usesRemaining: number }[];
  readonly injuryBoxes?: readonly {
    readonly categoryId: string;
    readonly boxIndex: 0 | 1;
    readonly marked: boolean;
  }[];
}

/**
 * B03 adds the declare -> GM review -> single server roll -> allocate loop
 * (docs/ETR_SESSION_FLOW.md §6). B04 adds scene/round/GM-director commands
 * (§5, §7) and the anonymous Pause/Resume safety interrupt (§8, matrix T1).
 */
export type EatTheReichCommand =
  | {
      readonly type: "ClaimCharacter";
      readonly characterId: string;
    }
  | {
      readonly type: "ReleaseCharacter";
      readonly characterId: string;
    }
  | {
      readonly type: "HealInjury";
      readonly characterId: string;
      readonly categoryId: string;
      readonly boxIndex: 0 | 1;
    }
  | {
      readonly type: "BeginAction";
      readonly characterId: string;
      readonly stat: Stat | "none";
      readonly itemIds: readonly string[];
      readonly abilityIds: readonly string[];
      /** Item/ability ids (a subset of `itemIds`/`abilityIds`) the player claims meet their bonus requirement (matrix P4). */
      readonly bonusClaimIds: readonly string[];
      readonly engagedThreatIds: readonly string[];
      readonly note: string | null;
    }
  | {
      readonly type: "ReviewAction";
      readonly rollId: string;
      /** A subset of the declaration's `bonusClaimIds` the GM approves; everything else is struck. */
      readonly approvedClaimIds: readonly string[];
      /** The GM's final engaged-Threat list, defaulting to the player's declared choice. */
      readonly engagedThreatIds: readonly string[];
    }
  | {
      readonly type: "AllocateResults";
      readonly rollId: string;
      readonly allocations: readonly {
        readonly dieFaceIndex: number;
        readonly target: AllocationTarget;
      }[];
    }
  | {
      readonly type: "ChooseInjuryCategory";
      readonly rollId: string;
      readonly categoryId: string;
    }
  | {
      readonly type: "LoadScene";
      readonly sceneId: string;
      readonly title: string;
      readonly locationLabel: string;
      readonly objectives: readonly SceneObjectiveInput[];
      readonly threats: readonly SceneThreatInput[];
      readonly reinforcementsMode: "book" | "simplified";
    }
  | {
      readonly type: "NextScene";
      readonly sceneId: string;
      readonly title: string;
      readonly locationLabel: string;
      readonly objectives: readonly SceneObjectiveInput[];
      readonly threats: readonly SceneThreatInput[];
      readonly reinforcementsMode: "book" | "simplified";
      /** Required unless the current scene's primary Objective is already complete (matrix flow §7). */
      readonly reason: string | null;
    }
  | {
      readonly type: "EndMission";
      /** Required unless the final scene's primary Objective is already complete. */
      readonly reason: string | null;
    }
  | {
      readonly type: "EndRound";
    }
  | {
      readonly type: "RevealThreat";
      readonly threatId: string;
    }
  | {
      readonly type: "EditScene";
      readonly reason: string;
      readonly addObjectives?: readonly SceneObjectiveInput[];
      readonly addThreats?: readonly SceneThreatInput[];
      readonly updateObjectives?: readonly {
        readonly objectiveId: string;
        readonly rating?: number;
        readonly challenge?: number;
      }[];
      readonly updateThreats?: readonly {
        readonly threatId: string;
        readonly rating?: number;
        readonly attack?: number;
        readonly challenge?: number;
      }[];
      readonly removeObjectiveIds?: readonly string[];
      readonly removeThreatIds?: readonly string[];
    }
  | {
      readonly type: "SetSceneRules";
      readonly reinforcements: "book" | "simplified";
      readonly reason: string;
    }
  | {
      readonly type: "CorrectCharacter";
      readonly characterId: string;
      readonly reason: string;
      readonly patch: CharacterCorrectionPatch;
    }
  | {
      readonly type: "VoidRoll";
      readonly rollId: string;
      readonly reason: string;
    }
  | {
      readonly type: "GrantItem";
      readonly characterId: string;
      readonly item: {
        readonly id: string;
        readonly name: string;
        readonly bonusRequirement: string;
        readonly bonusPlus: number;
        readonly maxUses: number;
      };
      readonly reason: string | null;
    }
  | {
      readonly type: "UnlockAdvance";
      readonly characterId: string;
      readonly advanceId: string;
      readonly reason: string | null;
    }
  | {
      readonly type: "ReassignCharacter";
      readonly characterId: string;
      readonly memberId: string | null;
      readonly reason: string | null;
    }
  | {
      readonly type: "Pause";
    }
  | {
      readonly type: "Resume";
    };
