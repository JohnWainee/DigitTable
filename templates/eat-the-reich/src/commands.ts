import type { MemberId } from "@digitable/contracts";
import type { RollAllocation } from "./state.js";

/**
 * The opposed-action flow (docs/ARCHITECTURE.md, "Opposed action"): a player
 * begins an action, the server rolls their pool; the GM commits an
 * opposition push, the server rolls it; the player allocates their net
 * successes against valid targets.
 */
export type EatTheReichCommand =
  | {
      readonly type: "BeginAction";
      readonly actorMemberId: MemberId;
      readonly threatId: string;
      readonly actionId: string;
      readonly gearIds: readonly string[];
    }
  | {
      readonly type: "SubmitOpposition";
      readonly rollId: string;
      readonly pushDice: number;
    }
  | {
      readonly type: "AllocateResults";
      readonly rollId: string;
      readonly allocations: readonly RollAllocation[];
    };
