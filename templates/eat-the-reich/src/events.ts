import type { MemberId } from "@digitable/contracts";
import type { AllocationTarget } from "./allocations.js";
import type { CharacterCorrectionPatch } from "./commands.js";
import type {
  BonusClaimRecord,
  ItemState,
  KeptDie,
  ObjectiveState,
  Stat,
  ThreatState,
} from "./state.js";

/** The replacement scene contents applied by `SceneLoaded` (matrix S1, S4, S8). */
export interface SceneSnapshot {
  readonly id: string;
  readonly title: string;
  readonly locationLabel: string;
  readonly reinforcementsMode: "book" | "simplified";
  readonly objectives: readonly ObjectiveState[];
  readonly threats: readonly ThreatState[];
}

export interface ObjectiveDelta {
  readonly objectiveId: string;
  readonly ratingAfter: number;
  readonly status: "active" | "complete";
}

export interface ThreatDelta {
  readonly threatId: string;
  readonly ratingAfter: number;
  readonly attackAfter: number;
  readonly status: "active" | "beaten" | "removed";
}

export interface ItemUseRestoreDelta {
  readonly itemId: string;
  readonly amount: number;
}

/** A full post-edit snapshot of one edited Objective/Threat (matrix §4 item 7's `EditScene`). */
export interface ObjectiveEditResult {
  readonly objectiveId: string;
  readonly rating: number;
  readonly challenge: number;
}

export interface ThreatEditResult {
  readonly threatId: string;
  readonly rating: number;
  readonly attack: number;
  readonly challenge: number;
}

export interface InjuryMarkResult {
  readonly categoryId: string;
  readonly boxIndexes: readonly (0 | 1)[];
  readonly downed: boolean;
  readonly rescueObjective: ObjectiveState | null;
}

export type EatTheReichEvent =
  | {
      readonly type: "CharacterClaimed";
      readonly characterId: string;
      readonly memberId: MemberId;
    }
  | {
      readonly type: "CharacterReleased";
      readonly characterId: string;
      readonly memberId: MemberId;
    }
  | {
      readonly type: "InjuryHealed";
      readonly characterId: string;
      readonly categoryId: string;
      readonly boxIndex: 0 | 1;
      readonly bloodSpent: number;
    }
  | {
      readonly type: "ActionDeclared";
      readonly rollId: string;
      readonly characterId: string;
      readonly actorMemberId: MemberId;
      readonly stat: Stat | "none";
      readonly itemIds: readonly string[];
      readonly abilityIds: readonly string[];
      readonly bonusClaimIds: readonly string[];
      readonly engagedThreatIds: readonly string[];
      readonly note: string | null;
    }
  | {
      readonly type: "ActionRolled";
      readonly rollId: string;
      readonly characterId: string;
      readonly approvedBonusClaims: readonly BonusClaimRecord[];
      readonly engagedThreatIds: readonly string[];
      readonly primaryEngagedThreatId: string | null;
      readonly playerFaces: readonly number[];
      readonly keptDice: readonly KeptDie[];
      readonly attackDiceRolled: number;
      readonly attackFaces: readonly number[];
      readonly attackSuccessesRolled: number;
      /** Item ids whose `usesRemaining` this roll consumed (one use each). */
      readonly itemIdsCharged: readonly string[];
      readonly bloodSpent: number;
      /** From passive `onOnesGainBlood` triggers evaluated on this roll's 1s (matrix D5). */
      readonly passiveBloodGained: number;
    }
  | {
      readonly type: "ActionResolved";
      readonly rollId: string;
      readonly characterId: string;
      readonly allocations: readonly {
        readonly dieFaceIndex: number;
        readonly target: AllocationTarget;
      }[];
      readonly objectiveDeltas: readonly ObjectiveDelta[];
      readonly threatDeltas: readonly ThreatDelta[];
      readonly bloodDelta: number;
      readonly itemRestoreDeltas: readonly ItemUseRestoreDelta[];
      readonly injuryClearedCount: number;
      readonly remainingAttackSuccessesAfterAllocation: number;
      readonly attackBumpThreatId: string | null;
      readonly injuryMark: InjuryMarkResult | null;
      readonly injuryChoicePendingMode: "single" | "downed" | null;
      readonly injuryChoicePendingCategoryId?: string | null;
    }
  | {
      readonly type: "InjuryCategoryChosen";
      readonly rollId: string;
      readonly characterId: string;
      readonly mark: InjuryMarkResult;
    }
  | {
      readonly type: "SceneLoaded";
      readonly scene: SceneSnapshot;
      /** Rescue Objectives carried forward from the previous scene, if any (matrix I2, S8). */
      readonly carriedRescueObjectives: readonly ObjectiveState[];
    }
  | {
      readonly type: "MissionEnded";
      readonly reason: string | null;
    }
  | {
      readonly type: "RoundEnded";
      readonly round: number;
      readonly reinforcementDeltas: readonly {
        readonly threatId: string;
        readonly ratingAfter: number;
        readonly attackAfter: number;
        readonly status: "active" | "beaten" | "removed";
      }[];
    }
  | {
      readonly type: "ThreatRevealed";
      readonly threatId: string;
    }
  | {
      readonly type: "SceneEdited";
      readonly reason: string;
      readonly addedObjectives: readonly ObjectiveState[];
      readonly addedThreats: readonly ThreatState[];
      readonly updatedObjectives: readonly ObjectiveEditResult[];
      readonly updatedThreats: readonly ThreatEditResult[];
      readonly removedObjectiveIds: readonly string[];
      readonly removedThreatIds: readonly string[];
    }
  | {
      readonly type: "SceneRulesChanged";
      readonly reinforcements: "book" | "simplified";
      readonly reason: string;
    }
  | {
      readonly type: "CharacterCorrected";
      readonly characterId: string;
      readonly reason: string;
      readonly patch: CharacterCorrectionPatch;
    }
  | {
      readonly type: "RollVoided";
      readonly rollId: string;
      readonly characterId: string;
      readonly reason: string;
      readonly bloodRefund: number;
      readonly itemRestoreDeltas: readonly ItemUseRestoreDelta[];
    }
  | {
      readonly type: "ItemGranted";
      readonly characterId: string;
      readonly item: ItemState;
      readonly reason: string | null;
      readonly previousActiveLootId: string | null;
    }
  | {
      readonly type: "AdvanceUnlocked";
      readonly characterId: string;
      readonly advanceId: string;
      readonly reason: string | null;
    }
  | {
      readonly type: "CharacterReassigned";
      readonly characterId: string;
      readonly previousMemberId: MemberId | null;
      readonly memberId: MemberId | null;
      readonly reason: string | null;
    }
  | {
      readonly type: "Paused";
    }
  | {
      readonly type: "Resumed";
    };
