import type { MemberId } from "@digitable/contracts";

/**
 * All content here (the roster in `roster.ts`, item/ability/injury names and
 * flavour text) is an original DigiTable creation. It follows the
 * structural *shape* Eat the Reich's rulebook specifies for a custom
 * character (docs/ETR_RULES_MATRIX.md Appendix A, matrix rule C3) but
 * reuses no licensed name, sentence, or entry. See AGENTS.md "Non-negotiable
 * boundaries" and docs/EAT_THE_REICH_BUILD_GUIDE.md "Licensing and content
 * policy" for the governing clarification.
 */

/** The seven stats every character has (docs/ETR_RULES_MATRIX.md C1, p. 30). */
export const STATS = ["BRAWL", "CON", "FIX", "SEARCH", "SHOOT", "SNEAK", "TERRIFY"] as const;
export type Stat = (typeof STATS)[number];

export function isStat(value: string): value is Stat {
  return (STATS as readonly string[]).includes(value);
}

export interface ItemState {
  readonly id: string;
  readonly name: string;
  /** Short in-fiction condition that must be satisfied to claim the bonus dice below (matrix P4). */
  readonly bonusRequirement: string;
  /** The "+" count (1-4): how many bonus dice a satisfied claim adds (matrix P4). */
  readonly bonusPlus: number;
  readonly maxUses: number;
  readonly usesRemaining: number;
}

/** How an ability contributes to a pool (matrix P2/P3, Appendix A). */
export type AbilityTrigger =
  /** Usable only on a critical die during allocation (matrix A6); never adds a build-time die. */
  | "special"
  /** Adds one die to the pool when used; costs `bloodCost` Blood (matrix P3). */
  | "blood"
  /** Adds one die to the pool when used; no Blood cost (matrix C3 "one free choice"). */
  | "other"
  /** Evaluated automatically at roll time on a rolled 1, never "used" to add a die (matrix D5). */
  | "passive";

/**
 * The typed effect vocabulary from docs/ETR_RULES_MATRIX.md Appendix B.
 * `none` covers an ability whose only effect is contributing a die (most
 * `blood`/`other` abilities); every other tag is applied automatically by
 * the engine where the matrix marks it typed, and `text` is shown to the GM
 * for manual application (matrix §4 item 3).
 */
export type AbilityEffect =
  | { readonly kind: "none" }
  | { readonly kind: "reduceThreatAttack"; readonly amount: number }
  | { readonly kind: "reduceRating"; readonly amount: number }
  | { readonly kind: "gainBlood"; readonly amount: number }
  | { readonly kind: "clearInjury"; readonly count: number }
  | { readonly kind: "removeAttackSuccesses"; readonly amount: number }
  | { readonly kind: "damageElite"; readonly amount: number }
  | { readonly kind: "restoreItemUse"; readonly itemId: string; readonly amount: number }
  | { readonly kind: "onOnesGainBlood"; readonly amount: number }
  | { readonly kind: "onOnesRemoveAttack"; readonly amount: number }
  | { readonly kind: "text"; readonly description: string };

export interface AbilityState {
  readonly id: string;
  readonly name: string;
  readonly trigger: AbilityTrigger;
  /** Present only for `trigger: "blood"`. */
  readonly bloodCost?: number;
  readonly effect: AbilityEffect;
}

/**
 * The six typed injury-penalty tags from Appendix B, applied only on a
 * category's second box (matrix P7, I1). `statDelta`'s keys are a subset of
 * `Stat`; `allStatsDelta` applies to every stat at once.
 */
export type InjuryPenaltyTag =
  | { readonly kind: "noBonusDice" }
  | { readonly kind: "noSpecials" }
  | { readonly kind: "oneItemPerTurn" }
  | { readonly kind: "statDelta"; readonly deltas: Partial<Record<Stat, number>> }
  | { readonly kind: "allStatsDelta"; readonly amount: number }
  | { readonly kind: "noBloodSpend" }
  | { readonly kind: "noBloodGain" }
  | { readonly kind: "bloodUpkeep"; readonly amount: number };

export interface InjuryBox {
  readonly marked: boolean;
  /** Only ever set on a category's second box. */
  readonly penalty?: InjuryPenaltyTag;
}

/** Exactly two boxes per category (matrix C3, I1): a plain first box, a penalty-bearing second box. */
export interface InjuryCategoryState {
  readonly id: string;
  readonly label: string;
  readonly boxes: readonly [InjuryBox, InjuryBox];
}

export interface AdvanceState {
  readonly id: string;
  readonly label: string;
  readonly unlocked: boolean;
}

export interface LastStandState {
  readonly label: string;
  readonly diceCount: number;
}

/**
 * A roster character's live state. Keyed in `EatTheReichState.characters` by
 * its original roster id (`rook`, `vesper`, ...), independent of which
 * member (if any) currently claims it (matrix C2).
 */
export interface CharacterState {
  readonly id: string;
  readonly name: string;
  readonly concept: string;
  readonly portraitId: string;
  readonly claimedByMemberId: MemberId | null;
  readonly stats: Readonly<Record<Stat, number>>;
  /** 0-10 (matrix C4). */
  readonly blood: number;
  readonly items: readonly ItemState[];
  readonly abilities: readonly AbilityState[];
  readonly advances: readonly AdvanceState[];
  /** Exactly three categories (matrix C3). */
  readonly injuries: readonly InjuryCategoryState[];
  readonly lastStand: LastStandState;
  /** Out of the fight until rescued (matrix I2). Resolution loop lands in B03. */
  readonly downed: boolean;
  /** Completed a Last Stand and retired (matrix I3). Resolution loop lands in B03. */
  readonly retired: boolean;
  readonly activeLootId: string | null;
}

export interface EatTheReichState {
  readonly schemaVersion: 2;
  readonly characters: Readonly<Record<string, CharacterState>>;
}
