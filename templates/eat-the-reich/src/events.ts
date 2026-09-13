import type { MemberId } from "@digitable/contracts";
import type { RollAllocation } from "./state.js";

/**
 * `ActionRolled.poolComponents.hiddenModifier` and `hiddenAdjustmentApplied`
 * carry the server-authoritative derivation. The GM-destination copy keeps
 * the true `hiddenModifier`; the shared/player copy omits it while keeping
 * `hiddenAdjustmentApplied`, so a player can tell an adjustment happened
 * without learning its magnitude (docs/ARCHITECTURE.md, N12). Player-visible
 * copies also redact `faces`, because their length would reveal the exact
 * hidden modifier when compared with the visible pool.
 */
export type EatTheReichEvent =
  | {
      readonly type: "ActionRolled";
      readonly rollId: string;
      readonly actorMemberId: MemberId;
      readonly threatId: string;
      readonly actionId: string;
      readonly faces: readonly number[] | null;
      readonly hits: number;
      readonly poolComponents: {
        readonly nerve: number;
        readonly gear: number;
        readonly hiddenModifier: number | null;
      };
      readonly hiddenAdjustmentApplied: boolean;
    }
  | {
      readonly type: "OppositionRolled";
      readonly rollId: string;
      readonly threatId: string;
      readonly pushDice: number;
      readonly faces: readonly number[];
      readonly hits: number;
      readonly netSuccesses: number;
    }
  | {
      readonly type: "ActionResolved";
      readonly rollId: string;
      readonly allocations: readonly RollAllocation[];
      readonly threatId: string;
      readonly threatResolveRemaining: number;
      readonly threatStatus: "active" | "defeated";
      readonly objectiveAdvancesRemaining: number;
      readonly objectiveStatus: "active" | "complete";
    };
