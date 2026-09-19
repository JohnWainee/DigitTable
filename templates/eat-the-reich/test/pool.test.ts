import { describe, expect, it } from "vitest";
import {
  buildPool,
  interpretAttackDie,
  interpretDie,
  isLastUse,
  lastUseBonusDice,
  NO_STAT_BASE,
  pointsForResult,
  type PoolEligibleCharacter,
} from "../src/pool.js";
import type {
  AbilityState,
  InjuryCategoryState,
  InjuryPenaltyTag,
  ItemState,
  Stat,
} from "../src/state.js";

function makeItem(overrides: Partial<ItemState> = {}): ItemState {
  return {
    id: "item-1",
    name: "Test Item",
    bonusRequirement: "a test condition",
    bonusPlus: 1,
    maxUses: 3,
    usesRemaining: 3,
    ...overrides,
  };
}

function makeAbility(overrides: Partial<AbilityState> = {}): AbilityState {
  return {
    id: "ability-1",
    name: "Test Ability",
    trigger: "other",
    effect: { kind: "none" },
    ...overrides,
  };
}

function makeCharacter(overrides: Partial<PoolEligibleCharacter> = {}): PoolEligibleCharacter {
  const stats: Record<Stat, number> = {
    BRAWL: 2,
    CON: 2,
    FIX: 2,
    SEARCH: 2,
    SHOOT: 2,
    SNEAK: 3,
    TERRIFY: 1,
  };
  return {
    stats,
    blood: 5,
    items: [],
    abilities: [],
    injuries: [],
    ...overrides,
  };
}

function injuryWithSecondBoxPenalty(penalty: InjuryPenaltyTag): InjuryCategoryState {
  return {
    id: "cat-1",
    label: "Test Category",
    boxes: [{ marked: false }, { marked: true, penalty }],
  };
}

describe("buildPool (matrix P1-P3, P7)", () => {
  it("base equals the chosen stat's rating", () => {
    const outcome = buildPool(makeCharacter(), { stat: "SNEAK", itemIds: [], abilityIds: [] });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.base).toBe(3);
    expect(outcome.result.total).toBe(3);
  });

  it('"none" gives the 2-dice base', () => {
    const outcome = buildPool(makeCharacter(), { stat: "none", itemIds: [], abilityIds: [] });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.base).toBe(NO_STAT_BASE);
  });

  it("an item use adds one die", () => {
    const character = makeCharacter({ items: [makeItem({ id: "silenced-pistol" })] });
    const outcome = buildPool(character, {
      stat: "SNEAK",
      itemIds: ["silenced-pistol"],
      abilityIds: [],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.itemDice).toBe(1);
    expect(outcome.result.total).toBe(4);
  });

  it("a depleted item is rejected", () => {
    const character = makeCharacter({
      items: [makeItem({ id: "spent-item", usesRemaining: 0 })],
    });
    const outcome = buildPool(character, {
      stat: "SNEAK",
      itemIds: ["spent-item"],
      abilityIds: [],
    });
    expect(outcome).toEqual({
      ok: false,
      rejection: { kind: "itemDepleted", itemId: "spent-item" },
    });
  });

  it("utility equipment cannot be submitted as a pool die", () => {
    const character = makeCharacter({
      items: [makeItem({ id: "cigarettes", poolEligible: false, bonusPlus: 0 })],
    });
    expect(
      buildPool(character, { stat: "SNEAK", itemIds: ["cigarettes"], abilityIds: [] }),
    ).toEqual({
      ok: false,
      rejection: { kind: "itemNotPoolEligible", itemId: "cigarettes" },
    });
  });

  it("an unknown item is rejected", () => {
    const outcome = buildPool(makeCharacter(), {
      stat: "SNEAK",
      itemIds: ["nope"],
      abilityIds: [],
    });
    expect(outcome).toEqual({ ok: false, rejection: { kind: "unknownItem", itemId: "nope" } });
  });

  it("duplicate item ids are deduplicated to one die", () => {
    const character = makeCharacter({ items: [makeItem({ id: "one-item" })] });
    const outcome = buildPool(character, {
      stat: "SNEAK",
      itemIds: ["one-item", "one-item"],
      abilityIds: [],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.itemDice).toBe(1);
  });

  it("a blood-cost ability adds one die and charges Blood exactly once", () => {
    const character = makeCharacter({
      abilities: [makeAbility({ id: "surge", trigger: "blood", bloodCost: 1 })],
    });
    const outcome = buildPool(character, {
      stat: "SNEAK",
      itemIds: [],
      abilityIds: ["surge", "surge"],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.abilityDice).toBe(1);
    expect(outcome.result.bloodCost).toBe(1);
  });

  it("a free ('other') ability adds one die at no Blood cost", () => {
    const character = makeCharacter({
      abilities: [makeAbility({ id: "practiced", trigger: "other" })],
    });
    const outcome = buildPool(character, {
      stat: "SNEAK",
      itemIds: [],
      abilityIds: ["practiced"],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.bloodCost).toBe(0);
  });

  it("insufficient Blood for a blood-cost ability is rejected", () => {
    const character = makeCharacter({
      blood: 0,
      abilities: [makeAbility({ id: "surge", trigger: "blood", bloodCost: 1 })],
    });
    const outcome = buildPool(character, {
      stat: "SNEAK",
      itemIds: [],
      abilityIds: ["surge"],
    });
    expect(outcome).toEqual({
      ok: false,
      rejection: { kind: "insufficientBlood", needed: 1, available: 0 },
    });
  });

  it("a special-trigger ability cannot be used to add a die", () => {
    const character = makeCharacter({
      abilities: [makeAbility({ id: "crit-only", trigger: "special" })],
    });
    const outcome = buildPool(character, {
      stat: "SNEAK",
      itemIds: [],
      abilityIds: ["crit-only"],
    });
    expect(outcome).toEqual({
      ok: false,
      rejection: { kind: "abilityNotUsable", abilityId: "crit-only" },
    });
  });

  it("a passive-trigger ability cannot be used to add a die", () => {
    const character = makeCharacter({
      abilities: [makeAbility({ id: "on-ones", trigger: "passive" })],
    });
    const outcome = buildPool(character, {
      stat: "SNEAK",
      itemIds: [],
      abilityIds: ["on-ones"],
    });
    expect(outcome.ok).toBe(false);
  });

  it("statDelta injury penalty lowers the chosen stat, floored at 0", () => {
    const character = makeCharacter({
      injuries: [injuryWithSecondBoxPenalty({ kind: "statDelta", deltas: { SNEAK: -5 } })],
    });
    const outcome = buildPool(character, { stat: "SNEAK", itemIds: [], abilityIds: [] });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.base).toBe(0);
  });

  it("statDelta only applies to its own stat, not others", () => {
    const character = makeCharacter({
      injuries: [injuryWithSecondBoxPenalty({ kind: "statDelta", deltas: { SNEAK: -5 } })],
    });
    const outcome = buildPool(character, { stat: "BRAWL", itemIds: [], abilityIds: [] });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.base).toBe(2);
  });

  it("allStatsDelta lowers whichever stat is chosen", () => {
    const character = makeCharacter({
      injuries: [injuryWithSecondBoxPenalty({ kind: "allStatsDelta", amount: -1 })],
    });
    const outcome = buildPool(character, { stat: "SNEAK", itemIds: [], abilityIds: [] });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.base).toBe(2);
  });

  it("an unmarked second box's penalty does not apply", () => {
    const character = makeCharacter({
      injuries: [
        {
          id: "cat-1",
          label: "Test",
          boxes: [
            { marked: false },
            { marked: false, penalty: { kind: "allStatsDelta", amount: -5 } },
          ],
        },
      ],
    });
    const outcome = buildPool(character, { stat: "SNEAK", itemIds: [], abilityIds: [] });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.base).toBe(3);
  });

  it("oneItemPerTurn rejects selecting more than one item", () => {
    const character = makeCharacter({
      items: [makeItem({ id: "a" }), makeItem({ id: "b" })],
      injuries: [injuryWithSecondBoxPenalty({ kind: "oneItemPerTurn" })],
    });
    const outcome = buildPool(character, { stat: "SNEAK", itemIds: ["a", "b"], abilityIds: [] });
    expect(outcome).toEqual({
      ok: false,
      rejection: { kind: "oneItemPerTurn", selectedCount: 2 },
    });
  });

  it("oneItemPerTurn allows exactly one item", () => {
    const character = makeCharacter({
      items: [makeItem({ id: "a" })],
      injuries: [injuryWithSecondBoxPenalty({ kind: "oneItemPerTurn" })],
    });
    const outcome = buildPool(character, { stat: "SNEAK", itemIds: ["a"], abilityIds: [] });
    expect(outcome.ok).toBe(true);
  });

  it("noBloodSpend rejects a blood-cost ability even if Blood is available", () => {
    const character = makeCharacter({
      blood: 5,
      abilities: [makeAbility({ id: "surge", trigger: "blood", bloodCost: 1 })],
      injuries: [injuryWithSecondBoxPenalty({ kind: "noBloodSpend" })],
    });
    const outcome = buildPool(character, { stat: "SNEAK", itemIds: [], abilityIds: ["surge"] });
    expect(outcome).toEqual({
      ok: false,
      rejection: { kind: "bloodSpendForbidden", abilityId: "surge" },
    });
  });
});

describe("interpretDie (matrix D1-D2)", () => {
  it.each([
    [1, "discard"],
    [2, "discard"],
    [3, "discard"],
    [4, "success"],
    [5, "success"],
    [6, "critical"],
  ] as const)("face %i interprets to %s at the default threshold", (face, expected) => {
    expect(interpretDie(face)).toBe(expected);
  });

  it("D2: a threat's discardBelow override changes the discard band (discard 1-4)", () => {
    expect(interpretDie(4, 5)).toBe("discard");
    expect(interpretDie(5, 5)).toBe("success");
    expect(interpretDie(6, 5)).toBe("critical");
  });
});

describe("pointsForResult (matrix D1)", () => {
  it("a success is worth 1 point, a critical 2, a discard 0", () => {
    expect(pointsForResult("discard")).toBe(0);
    expect(pointsForResult("success")).toBe(1);
    expect(pointsForResult("critical")).toBe(2);
  });
});

describe("interpretAttackDie (matrix D3)", () => {
  it("a face below 4 is 0 successes", () => {
    expect(interpretAttackDie(3, false)).toBe(0);
  });

  it("a face of 4 or 5 is 1 success", () => {
    expect(interpretAttackDie(4, false)).toBe(1);
    expect(interpretAttackDie(5, false)).toBe(1);
  });

  it("a 6 is 1 success by default (no GM criticals)", () => {
    expect(interpretAttackDie(6, false)).toBe(1);
  });

  it("attackCritOnSix makes a 6 worth 2 successes", () => {
    expect(interpretAttackDie(6, true)).toBe(2);
  });
});

describe("isLastUse / lastUseBonusDice (matrix P5)", () => {
  it("an item with maxUses > 1 about to go from 1 to 0 is its last use", () => {
    expect(isLastUse(makeItem({ maxUses: 3, usesRemaining: 1 }))).toBe(true);
  });

  it("an item not down to its last use is not", () => {
    expect(isLastUse(makeItem({ maxUses: 3, usesRemaining: 2 }))).toBe(false);
  });

  it("a single-use item (maxUses 1) never qualifies for the last-use bonus", () => {
    expect(isLastUse(makeItem({ maxUses: 1, usesRemaining: 1 }))).toBe(false);
  });

  it("lastUseBonusDice sums the bonus across every qualifying selected item", () => {
    const character = makeCharacter({
      items: [
        makeItem({ id: "a", maxUses: 3, usesRemaining: 1 }),
        makeItem({ id: "b", maxUses: 1, usesRemaining: 1 }),
        makeItem({ id: "c", maxUses: 3, usesRemaining: 2 }),
      ],
    });
    expect(lastUseBonusDice(character, ["a", "b", "c"])).toBe(1);
  });

  it("lastUseBonusDice deduplicates repeated item ids", () => {
    const character = makeCharacter({
      items: [makeItem({ id: "a", maxUses: 3, usesRemaining: 1 })],
    });
    expect(lastUseBonusDice(character, ["a", "a"])).toBe(1);
  });
});
