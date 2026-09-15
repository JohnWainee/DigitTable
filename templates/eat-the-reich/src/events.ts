import type { MemberId } from "@digitable/contracts";
import type { AllocationTarget } from "./allocations.js";
import type { BonusClaimRecord, KeptDie, ObjectiveState, Stat } from "./state.js";

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
    }
  | {
      readonly type: "InjuryCategoryChosen";
      readonly rollId: string;
      readonly characterId: string;
      readonly mark: InjuryMarkResult;
    };
