import type {
  AbilityState,
  DieResult,
  InjuryCategoryState,
  InjuryPenaltyTag,
  ItemState,
  Stat,
} from "./state.js";

/**
 * The structural subset of `CharacterState` (and the `CharacterFullSheet`
 * projection shape, which carries the same fields) that pool building
 * needs. Keeping this narrow lets `explainPool` call `buildPool` directly
 * against a viewer's own projected sheet, not just the trusted state.
 */
export interface PoolEligibleCharacter {
  readonly stats: Readonly<Record<Stat, number>>;
  readonly blood: number;
  readonly items: readonly ItemState[];
  readonly abilities: readonly AbilityState[];
  readonly injuries: readonly InjuryCategoryState[];
}

/** d6 pool; face-based interpretation (discard/success/critical) lands in B03 (matrix D1). */
export const DICE_SIDES = 6;

/**
 * A face of 4 or 5 is a success (1-3 discard, 6 is a critical worth 2 -
 * matrix D1, p. 31/34/71). Exposed here (not yet consumed by any B02 code)
 * so B03's die interpreter and every `PoolExplanation.successThreshold`
 * caller share one constant instead of re-deriving it.
 */
export const SUCCESS_THRESHOLD = 4;

/** Base dice for an action with no fitting stat (matrix C1: "roll 2 dice"). */
export const NO_STAT_BASE = 2;

export interface PoolBuildInput {
  readonly stat: Stat | "none";
  /** Deduplicated by the caller is not required; `buildPool` dedupes. */
  readonly itemIds: readonly string[];
  /** Only `"blood"`/`"other"` trigger abilities may be listed here (matrix P3). */
  readonly abilityIds: readonly string[];
}

export interface PoolComponent {
  readonly label: string;
  readonly value: number;
}

export interface PoolBuildResult {
  /** The chosen stat's rating (or `NO_STAT_BASE`), after any active `statDelta`/`allStatsDelta` injury penalty, floored at 0. */
  readonly base: number;
  readonly itemDice: number;
  readonly abilityDice: number;
  readonly bloodCost: number;
  readonly total: number;
  readonly components: readonly PoolComponent[];
}

export type PoolBuildRejection =
  | { readonly kind: "unknownItem"; readonly itemId: string }
  | { readonly kind: "itemNotPoolEligible"; readonly itemId: string }
  | { readonly kind: "itemDepleted"; readonly itemId: string }
  | { readonly kind: "unknownAbility"; readonly abilityId: string }
  | { readonly kind: "abilityNotUsable"; readonly abilityId: string }
  | { readonly kind: "oneItemPerTurn"; readonly selectedCount: number }
  | { readonly kind: "bloodSpendForbidden"; readonly abilityId: string }
  | { readonly kind: "insufficientBlood"; readonly needed: number; readonly available: number };

export type PoolBuildOutcome =
  | { readonly ok: true; readonly result: PoolBuildResult }
  | { readonly ok: false; readonly rejection: PoolBuildRejection };

/** The active second-box injury penalty tags on a character (matrix P7, I1). */
export function activePenaltyTags(character: PoolEligibleCharacter): readonly InjuryPenaltyTag[] {
  const tags: InjuryPenaltyTag[] = [];
  for (const category of character.injuries) {
    const secondBox = category.boxes[1];
    if (secondBox.marked && secondBox.penalty) {
      tags.push(secondBox.penalty);
    }
  }
  return tags;
}

function statBase(
  character: PoolEligibleCharacter,
  stat: Stat | "none",
  tags: readonly InjuryPenaltyTag[],
): number {
  const raw = stat === "none" ? NO_STAT_BASE : character.stats[stat];
  let delta = 0;
  for (const tag of tags) {
    if (tag.kind === "statDelta" && stat !== "none") {
      delta += tag.deltas[stat] ?? 0;
    } else if (tag.kind === "allStatsDelta") {
      delta += tag.amount;
    }
  }
  return Math.max(0, raw + delta);
}

/**
 * Computes a pool's base + item + ability dice (matrix P1-P3) with the six
 * typed injury-penalty tags applied (matrix P7). Bonus-claim dice (P4),
 * last-use dice (P5), and late bonus dice (P6) are computed by B03's
 * `decide` once a roll is actually declared/reviewed — this function only
 * covers what a character's own state determines before GM review.
 */
export function buildPool(
  character: PoolEligibleCharacter,
  input: PoolBuildInput,
): PoolBuildOutcome {
  const tags = activePenaltyTags(character);
  const oneItemPerTurn = tags.some((tag) => tag.kind === "oneItemPerTurn");
  const noBloodSpend = tags.some((tag) => tag.kind === "noBloodSpend");

  const itemIds = [...new Set(input.itemIds)];
  const abilityIds = [...new Set(input.abilityIds)];

  if (oneItemPerTurn && itemIds.length > 1) {
    return { ok: false, rejection: { kind: "oneItemPerTurn", selectedCount: itemIds.length } };
  }

  for (const itemId of itemIds) {
    const item = character.items.find((candidate) => candidate.id === itemId);
    if (!item) return { ok: false, rejection: { kind: "unknownItem", itemId } };
    if (item.poolEligible === false) {
      return { ok: false, rejection: { kind: "itemNotPoolEligible", itemId } };
    }
    if (item.usesRemaining <= 0) return { ok: false, rejection: { kind: "itemDepleted", itemId } };
  }

  let bloodCost = 0;
  for (const abilityId of abilityIds) {
    const ability = character.abilities.find((candidate) => candidate.id === abilityId);
    if (!ability) return { ok: false, rejection: { kind: "unknownAbility", abilityId } };
    if (ability.trigger !== "blood" && ability.trigger !== "other") {
      return { ok: false, rejection: { kind: "abilityNotUsable", abilityId } };
    }
    if (ability.trigger === "blood") {
      const cost = ability.bloodCost ?? 1;
      if (noBloodSpend && cost > 0) {
        return { ok: false, rejection: { kind: "bloodSpendForbidden", abilityId } };
      }
      bloodCost += cost;
    }
  }

  if (bloodCost > character.blood) {
    return {
      ok: false,
      rejection: { kind: "insufficientBlood", needed: bloodCost, available: character.blood },
    };
  }

  const base = statBase(character, input.stat, tags);
  const itemDice = itemIds.length;
  const abilityDice = abilityIds.length;
  const total = base + itemDice + abilityDice;

  const components: PoolComponent[] = [
    { label: input.stat === "none" ? "No fitting stat" : input.stat, value: base },
    ...(itemDice > 0 ? [{ label: "Items", value: itemDice }] : []),
    ...(abilityDice > 0 ? [{ label: "Abilities", value: abilityDice }] : []),
  ];

  return { ok: true, result: { base, itemDice, abilityDice, bloodCost, total, components } };
}

// ---------------------------------------------------------------------------
// B03: die interpretation (matrix D1-D3), bonus claims (P4), last-use (P5).
// ---------------------------------------------------------------------------

/**
 * A face of 6 is always a critical; a face at or above `discardBelow`
 * (default `SUCCESS_THRESHOLD`, i.e. 4) but below 6 is a success; anything
 * lower discards (matrix D1). `discardBelow` may be overridden per-Threat
 * (matrix D2, e.g. a Threat with "discard 1-4" sets it to 5).
 */
export function interpretDie(face: number, discardBelow: number = SUCCESS_THRESHOLD): DieResult {
  if (face >= 6) return "critical";
  if (face >= discardBelow) return "success";
  return "discard";
}

/** A success is worth 1 point, a critical 2, a discard 0 (matrix D1, 3.5 preamble). */
export function pointsForResult(result: DieResult): number {
  return result === "critical" ? 2 : result === "success" ? 1 : 0;
}

/**
 * The GM's Attack dice have no critical rule: any face >= 4 is one success,
 * including a 6 — unless the engaged Threat's `attackCritOnSix` flag makes a
 * 6 worth 2 (matrix D3).
 */
export function interpretAttackDie(face: number, attackCritOnSix: boolean): number {
  if (face < SUCCESS_THRESHOLD) return 0;
  if (face === 6 && attackCritOnSix) return 2;
  return 1;
}

/**
 * Whether using `itemId` right now would be its *last* use — i.e.
 * `usesRemaining` is about to go from 1 to 0 on an item whose `maxUses > 1`
 * (matrix P5: "last use of an item that started with >1 use adds one extra
 * die"). A single-use item (`maxUses === 1`) never qualifies.
 */
export function isLastUse(item: ItemState): boolean {
  return item.maxUses > 1 && item.usesRemaining === 1;
}

/** Sum of P5's last-use bonus across every item in `itemIds` that qualifies. */
export function lastUseBonusDice(
  character: PoolEligibleCharacter,
  itemIds: readonly string[],
): number {
  let bonus = 0;
  for (const itemId of new Set(itemIds)) {
    const item = character.items.find((candidate) => candidate.id === itemId);
    if (item && isLastUse(item)) bonus += 1;
  }
  return bonus;
}
