import { allocationTargetKey, type AllocationTarget } from "./allocations.js";
import type { ThreatState } from "./state.js";

/**
 * Pure helpers for B03's opposition and allocation math
 * (docs/ETR_RULES_MATRIX.md 3.4-3.5), kept separate from `engine.ts`'s
 * `decide` wiring so each rule is independently unit-testable, matching
 * this template's existing `pool.ts`/`allocations.ts` split.
 */

/** A Threat at rating <= 0 has effective Attack 0, regardless of its stored value (matrix O3). */
export function effectiveAttack(threat: Pick<ThreatState, "rating" | "attack">): number {
  return threat.rating > 0 ? threat.attack : 0;
}

/**
 * The GM's Attack dice pool for one action (matrix O1-O3, p. 31/37-38): the
 * highest effective Attack among the Threats the character is engaged
 * with, plus one per *other* active Threat "in play" (rating > 0),
 * regardless of whether that other Threat is engaged this action. Zero
 * engaged Threats rolls zero dice (O2).
 */
export function computeAttackDiceCount(
  allThreats: readonly Pick<ThreatState, "id" | "rating" | "attack" | "status">[],
  engagedThreatIds: readonly string[],
): number {
  if (engagedThreatIds.length === 0) return 0;
  const engaged = allThreats.filter((threat) => engagedThreatIds.includes(threat.id));
  if (engaged.length === 0) return 0;
  const maxAttack = Math.max(...engaged.map((threat) => effectiveAttack(threat)));
  const activeInPlay = allThreats.filter(
    (threat) => threat.status === "active" && threat.rating > 0,
  ).length;
  return maxAttack + Math.max(0, activeInPlay - 1);
}

/** matrix I1: a d6 roll maps to an injury category index, 1-2/3-4/5-6 -> 0/1/2. */
export function rollCategoryIndex(face: number): 0 | 1 | 2 {
  if (face <= 2) return 0;
  if (face <= 4) return 1;
  return 2;
}

/**
 * matrix A7: a target's Challenge negates points spent on it before its
 * rating drops. Default resolution is "negates points" (matches the p. 38
 * worked example); the matrix records this as a book ambiguity B may
 * revisit with a GM correction if John's copy disagrees.
 */
export function challengeDamage(points: number, challenge: number): number {
  return Math.max(0, points - challenge);
}

export interface GroupedAllocation {
  readonly target: AllocationTarget;
  readonly dieFaceIndexes: readonly number[];
  readonly points: number;
}

/** Groups per-die allocations by target, summing points (matrix A7-A8: Challenge and multi-target spending). */
export function groupAllocationsByTarget(
  allocations: readonly { readonly dieFaceIndex: number; readonly target: AllocationTarget }[],
  pointsByFaceIndex: ReadonlyMap<number, number>,
): readonly GroupedAllocation[] {
  const byKey = new Map<string, GroupedAllocation>();
  for (const allocation of allocations) {
    const key = allocationTargetKey(allocation.target);
    const points = pointsByFaceIndex.get(allocation.dieFaceIndex) ?? 0;
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        target: existing.target,
        dieFaceIndexes: [...existing.dieFaceIndexes, allocation.dieFaceIndex],
        points: existing.points + points,
      });
    } else {
      byKey.set(key, {
        target: allocation.target,
        dieFaceIndexes: [allocation.dieFaceIndex],
        points,
      });
    }
  }
  return [...byKey.values()];
}
