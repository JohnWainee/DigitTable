import { describe, expect, it } from "vitest";
import type { RandomSource } from "@digitable/contracts";
import { ACTION_ID, GEAR_SILENCED_TOOL } from "../src/content.js";
import { computeVisiblePool, rollPool } from "../src/pool.js";

class FixedSequenceRandom implements RandomSource {
  private index = 0;
  constructor(private readonly faces: readonly number[]) {}
  rollDie(): number {
    const face = this.faces[this.index];
    if (face === undefined) throw new Error("exhausted");
    this.index += 1;
    return face;
  }
}

describe("rollPool: dice interpretation", () => {
  it("counts only faces at or above the success threshold (5 or 6) as hits", () => {
    const outcome = rollPool(new FixedSequenceRandom([1, 2, 3, 4, 5, 6]), 6);
    expect(outcome.faces).toEqual([1, 2, 3, 4, 5, 6]);
    expect(outcome.hits).toBe(2);
  });

  it("rolls zero dice for a pool of zero", () => {
    const outcome = rollPool(new FixedSequenceRandom([]), 0);
    expect(outcome).toEqual({ faces: [], hits: 0 });
  });

  it("clamps a negative pool size to zero dice rather than throwing", () => {
    const outcome = rollPool(new FixedSequenceRandom([]), -3);
    expect(outcome).toEqual({ faces: [], hits: 0 });
  });

  it("counts zero hits when every face misses the threshold", () => {
    const outcome = rollPool(new FixedSequenceRandom([1, 1, 4, 4]), 4);
    expect(outcome.hits).toBe(0);
  });
});

describe("computeVisiblePool", () => {
  const character = { attributes: { nerve: 2 }, gear: [GEAR_SILENCED_TOOL] };

  it("sums the attribute and carried, action-relevant gear", () => {
    expect(computeVisiblePool(character, ACTION_ID, [GEAR_SILENCED_TOOL])).toEqual({
      nerve: 2,
      gear: 1,
      total: 3,
    });
  });

  it("ignores gear ids the character does not carry", () => {
    expect(computeVisiblePool(character, ACTION_ID, ["someone-elses-gear"])).toEqual({
      nerve: 2,
      gear: 0,
      total: 2,
    });
  });

  it("counts a carried gear item at most once when its id is repeated", () => {
    expect(
      computeVisiblePool(character, ACTION_ID, [GEAR_SILENCED_TOOL, GEAR_SILENCED_TOOL]),
    ).toEqual({ nerve: 2, gear: 1, total: 3 });
  });

  it("contributes nothing for an unrecognized action id", () => {
    expect(computeVisiblePool(character, "not-a-real-action", [GEAR_SILENCED_TOOL])).toEqual({
      nerve: 0,
      gear: 0,
      total: 0,
    });
  });
});
