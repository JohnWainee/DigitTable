import { describe, expect, it } from "vitest";
import { rollDice, type RandomSource } from "../src/index.js";

class SequenceRandom implements RandomSource {
  private index = 0;
  constructor(private readonly faces: readonly number[]) {}

  rollDie(_sides: number): number {
    const face = this.faces[this.index];
    if (face === undefined) {
      throw new Error("SequenceRandom exhausted");
    }
    this.index += 1;
    return face;
  }
}

describe("rollDice", () => {
  it("draws exactly `count` dice in order", () => {
    const random = new SequenceRandom([1, 2, 3, 4]);
    expect(rollDice(random, 3, 6)).toEqual([1, 2, 3]);
  });

  it("returns an empty array for zero dice without drawing", () => {
    const random = new SequenceRandom([]);
    expect(rollDice(random, 0, 6)).toEqual([]);
  });
});
