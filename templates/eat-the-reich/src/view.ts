import type { LocationState, ObjectiveState, RollAllocation, RollStatus } from "./state.js";

export interface CharacterPublicSummary {
  readonly memberId: string;
  readonly name: string;
  readonly wounds: number;
  readonly maxWounds: number;
}

export interface CharacterFullView extends CharacterPublicSummary {
  readonly attributes: { readonly nerve: number };
  readonly gear: readonly string[];
}

export interface ThreatPublicSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly resolveRemaining: number;
  readonly maxResolve: number;
  readonly status: "active" | "defeated";
}

/** GM-only fields are present exclusively on this variant. */
export interface ThreatGmSummary extends ThreatPublicSummary {
  readonly hiddenDifficultyModifier: number;
  readonly hiddenIntel: string;
}

export interface ActiveRollView {
  readonly rollId: string;
  readonly actorMemberId: string;
  readonly threatId: string;
  readonly actionId: string;
  readonly status: RollStatus;
  readonly playerFaces: readonly number[];
  readonly playerHits: number;
  readonly hiddenAdjustmentApplied: boolean;
  /** GM-only: the real magnitude of the hidden difficulty modifier. */
  readonly hiddenDifficultyModifier?: number;
  readonly pushDice?: number;
  readonly oppositionFaces?: readonly number[];
  readonly oppositionHits?: number;
  readonly netSuccesses?: number;
  readonly allocations?: readonly RollAllocation[];
}

export interface EatTheReichView {
  readonly location: LocationState;
  readonly objective: ObjectiveState;
  readonly self: CharacterFullView | null;
  readonly characters: readonly CharacterPublicSummary[];
  readonly threats: readonly (ThreatPublicSummary | ThreatGmSummary)[];
  readonly activeRoll: ActiveRollView | null;
}
