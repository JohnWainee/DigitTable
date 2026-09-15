import type { AllocationTarget } from "./allocations.js";
import type { Stat } from "./state.js";

/**
 * B03 adds the declare -> GM review -> single server roll -> allocate loop
 * (docs/ETR_SESSION_FLOW.md §6): `BeginAction` (declare), `ReviewAction`
 * (GM confirms/strikes bonus claims and engaged threats, then the server
 * rolls once), `AllocateResults` (player spends kept dice), and
 * `ChooseInjuryCategory` (the I1 "category full" follow-up). B02's
 * `ClaimCharacter`/`ReleaseCharacter`/`HealInjury` are unchanged.
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
    };
