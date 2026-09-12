import type { MemberId } from "@digitable/contracts";

/**
 * All content here is original placeholder material generated for this
 * prototype (see assets/generated/eat-the-reich/README.md) and is not
 * extracted from or intended to reproduce licensed *Eat the Reich* text,
 * terminology, or rules. Replace or formally approve before public release.
 */

export interface LocationState {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface ObjectiveState {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly advancesRemaining: number;
  readonly status: "active" | "complete";
}

export interface CharacterState {
  readonly memberId: MemberId;
  readonly name: string;
  readonly attributes: { readonly nerve: number };
  readonly gear: readonly string[];
  readonly wounds: number;
  readonly maxWounds: number;
}

/**
 * `hiddenDifficultyModifier` and `hiddenIntel` are GM-only. They are folded
 * into resolution but must never appear in a non-GM viewer's projection
 * (docs/ARCHITECTURE.md, N12).
 */
export interface ThreatState {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly basePool: number;
  readonly resolveRemaining: number;
  readonly maxResolve: number;
  readonly hiddenDifficultyModifier: number;
  readonly hiddenIntel: string;
  readonly status: "active" | "defeated";
}

export type RollStatus = "awaiting_opposition" | "awaiting_allocation" | "resolved";

export interface RollAllocation {
  readonly optionId: string;
  readonly uses: number;
}

export interface RollState {
  readonly id: string;
  readonly actorMemberId: MemberId;
  readonly threatId: string;
  readonly actionId: string;
  readonly status: RollStatus;
  readonly playerFaces: readonly number[];
  readonly playerHits: number;
  readonly poolComponents: {
    readonly nerve: number;
    readonly gear: number;
    readonly hiddenModifier: number;
  };
  readonly hiddenAdjustmentApplied: boolean;
  readonly pushDice?: number;
  readonly oppositionFaces?: readonly number[];
  readonly oppositionHits?: number;
  readonly netSuccesses?: number;
  readonly allocations?: readonly RollAllocation[];
}

export interface EatTheReichState {
  readonly schemaVersion: 1;
  readonly location: LocationState;
  readonly objective: ObjectiveState;
  readonly characters: Readonly<Record<string, CharacterState>>;
  readonly threats: Readonly<Record<string, ThreatState>>;
  readonly rolls: Readonly<Record<string, RollState>>;
  readonly nextRollSequence: number;
}
