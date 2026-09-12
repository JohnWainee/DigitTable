import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../src/index.js";

describe("createSeededRandom", () => {
  it("is deterministic for a fixed seed", () => {
    const a = createSeededRandom("fixed-seed");
    const b = createSeededRandom("fixed-seed");
    const drawsA = Array.from({ length: 20 }, () => a.rollDie(6));
    const drawsB = Array.from({ length: 20 }, () => b.rollDie(6));
    expect(drawsA).toEqual(drawsB);
  });

  it("reproduces the same draws across independent generator instances (retry-stable)", () => {
    // Simulates a Firestore transaction retry: same seed, re-drawn from scratch.
    const seed = "retry-seed-42";
    const first = Array.from({ length: 5 }, () => createSeededRandom(seed).rollDie(6));
    // Each call above constructs a *new* generator, so this instead checks
    // that one generator drawn twice in sequence is stable when restarted:
    const gen = createSeededRandom(seed);
    const second = Array.from({ length: 5 }, () => gen.rollDie(6));
    const gen2 = createSeededRandom(seed);
    const third = Array.from({ length: 5 }, () => gen2.rollDie(6));
    expect(second).toEqual(third);
    expect(first.length).toBe(5);
  });

  it("produces different sequences for different seeds (overwhelmingly likely)", () => {
    const a = createSeededRandom("seed-one");
    const b = createSeededRandom("seed-two");
    const drawsA = Array.from({ length: 20 }, () => a.rollDie(6));
    const drawsB = Array.from({ length: 20 }, () => b.rollDie(6));
    expect(drawsA).not.toEqual(drawsB);
  });

  it("stays within [1, sides] over a large sample", () => {
    const random = createSeededRandom("range-check");
    for (let i = 0; i < 2000; i += 1) {
      const face = random.rollDie(6);
      expect(face).toBeGreaterThanOrEqual(1);
      expect(face).toBeLessThanOrEqual(6);
      expect(Number.isInteger(face)).toBe(true);
    }
  });

  it("rejects a non-positive-integer side count", () => {
    const random = createSeededRandom("bad-sides");
    expect(() => random.rollDie(0)).toThrow(RangeError);
    expect(() => random.rollDie(-1)).toThrow(RangeError);
    expect(() => random.rollDie(1.5)).toThrow(RangeError);
  });
});
