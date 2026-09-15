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
  /** Optional bonus-claim pair (matrix P4), same shape as `ItemState`'s. Not every ability has one. */
  readonly bonusRequirement?: string;
  readonly bonusPlus?: number;
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

/**
 * B03 (docs/ETR_RULES_MATRIX.md 3.5, 3.7): an Objective a scene presents.
 * `kind` distinguishes the primary Objective (completing it ends the scene,
 * matrix S1) from GM-created secondary/rescue/retreat Objectives (S2, I2,
 * S3 — created by B04's GM commands). No Scene wrapper or round tracking
 * exists yet (B04); this milestone has one implicit "current scene" only.
 */
export interface ObjectiveState {
  readonly id: string;
  readonly title: string;
  readonly kind: "primary" | "secondary" | "rescue" | "retreat";
  readonly rating: number;
  readonly challenge: number;
  readonly status: "active" | "complete";
}

/**
 * Typed Threat flags (docs/ETR_RULES_MATRIX.md Appendix B "Threat" row,
 * S10). Only the flags B03's roll/allocation math needs are enforced this
 * slice; `challengeLocked` (blocks Challenge reduction, B04's EditScene) is
 * carried as data now so B04 doesn't need another reshape.
 */
export interface ThreatFlags {
  /** D2: overrides the discard band for the engaged player's dice (default: matrix's SUCCESS_THRESHOLD). */
  readonly discardBelow?: number;
  /** A5: this Threat cannot be fed from (Blood gain) while engaged with it alone. */
  readonly noFeeding?: boolean;
  /** D3: a 6 on this Threat's Attack dice is worth 2 successes instead of 1. */
  readonly attackCritOnSix?: boolean;
  /** S10: this Threat's Challenge cannot be reduced by any effect (enforced when B04 adds Challenge-reducing GM tools). */
  readonly challengeLocked?: boolean;
  /** I4: any injury this Threat inflicts marks every available box in the rolled category, not just one. */
  readonly injuryMarksWholeCategory?: boolean;
}

/**
 * B03 (matrix 3.4, 3.7, 3.5 A3/A7): a Threat a scene presents. `solo`/
 * `elite` (matrix S4) affect reinforcement (B04) and removal-on-zero
 * (elite is removed rather than merely beaten back, and its Blood unlocks
 * an advance — B04's GrantItem/UnlockAdvance).
 */
export interface ThreatState {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  readonly startingAttack: number;
  readonly attack: number;
  readonly challenge: number;
  readonly solo: boolean;
  readonly elite: boolean;
  readonly flags: ThreatFlags;
  readonly status: "active" | "beaten" | "removed";
  /** GM-only; an unrevealed Threat never appears in a player/table projection (matrix Appendix C). */
  readonly revealed: boolean;
}

/** One approved or struck bonus claim, recorded at GM review time (matrix P4). */
export interface BonusClaimRecord {
  readonly sourceId: string;
  readonly approved: boolean;
  readonly plus: number;
}

export type DieResult = "discard" | "success" | "critical";

export interface KeptDie {
  readonly faceIndex: number;
  readonly face: number;
  readonly result: "success" | "critical";
  readonly points: number;
}

/**
 * A pending injury the player must resolve by picking a category because
 * the rolled category had no open box left (matrix I1 "if both full, pick
 * another category"; I2's Downed case reuses the same mechanism).
 */
export interface InjuryChoicePending {
  readonly mode: "single" | "downed";
}

export type RollStatus = "declared" | "awaiting_allocation" | "awaiting_injury_choice" | "resolved";

/**
 * B03's declare -> GM review -> single server roll -> allocate loop
 * (docs/ETR_SESSION_FLOW.md §6). One `RollRecord` per `BeginAction`; the
 * character may not `BeginAction` again while an unresolved roll of theirs
 * exists (enforced in `decide`).
 */
export interface RollRecord {
  readonly id: string;
  readonly characterId: string;
  readonly actorMemberId: MemberId;
  readonly status: RollStatus;
  readonly declaredStat: Stat | "none";
  readonly declaredItemIds: readonly string[];
  readonly declaredAbilityIds: readonly string[];
  readonly declaredBonusClaimIds: readonly string[];
  readonly declaredEngagedThreatIds: readonly string[];
  readonly note: string | null;
  // Populated once ReviewAction resolves:
  readonly approvedBonusClaims?: readonly BonusClaimRecord[];
  readonly engagedThreatIds?: readonly string[];
  readonly playerFaces?: readonly number[];
  readonly keptDice?: readonly KeptDie[];
  readonly attackDiceRolled?: number;
  readonly attackFaces?: readonly number[];
  readonly attackSuccessesRolled?: number;
  readonly primaryEngagedThreatId?: string | null;
  // Populated once AllocateResults resolves:
  readonly remainingAttackSuccessesAfterAllocation?: number;
  readonly injuryChoicePending?: InjuryChoicePending;
}

export interface EatTheReichState {
  readonly schemaVersion: 3;
  readonly characters: Readonly<Record<string, CharacterState>>;
  readonly objectives: Readonly<Record<string, ObjectiveState>>;
  readonly threats: Readonly<Record<string, ThreatState>>;
  readonly rolls: Readonly<Record<string, RollRecord>>;
  readonly nextRollSequence: number;
}
