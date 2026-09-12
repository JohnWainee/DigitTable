import { rollDice, type RandomSource } from "@digitable/contracts";
import { ACTION_GEAR_BONUS, ACTION_ID, DICE_SIDES, SUCCESS_THRESHOLD } from "./content.js";

export interface PoolBreakdown {
  readonly nerve: number;
  readonly gear: number;
  readonly total: number;
}

/** Structural subset shared by CharacterState and the CharacterFullView projection shape. */
export interface PoolEligibleCharacter {
  readonly attributes: { readonly nerve: number };
  readonly gear: readonly string[];
}

/**
 * The visible portion of the pool: attribute plus carried, action-relevant
 * gear. Never includes a hidden GM modifier — callers with access to one
 * (i.e. `decide`, which also has the live threat state) add it separately.
 */
export function computeVisiblePool(
  character: PoolEligibleCharacter,
  actionId: string,
  gearIds: readonly string[],
): PoolBreakdown {
  if (actionId !== ACTION_ID) {
    return { nerve: 0, gear: 0, total: 0 };
  }
  const carriedGearIds = new Set(character.gear);
  const gearBonus = gearIds
    .filter((id) => carriedGearIds.has(id))
    .reduce((sum, id) => sum + (ACTION_GEAR_BONUS[id] ?? 0), 0);
  return {
    nerve: character.attributes.nerve,
    gear: gearBonus,
    total: character.attributes.nerve + gearBonus,
  };
}

export interface RollOutcome {
  readonly faces: readonly number[];
  readonly hits: number;
}

/** Rolls `poolSize` dice (clamped to zero or more) and counts hits at SUCCESS_THRESHOLD. */
export function rollPool(random: RandomSource, poolSize: number): RollOutcome {
  const size = Math.max(0, poolSize);
  const faces = rollDice(random, size, DICE_SIDES);
  const hits = faces.filter((face) => face >= SUCCESS_THRESHOLD).length;
  return { faces, hits };
}
