import { describe, expect, it } from "vitest";
import {
  challengeDamage,
  computeAttackDiceCount,
  effectiveAttack,
  groupAllocationsByTarget,
  rollCategoryIndex,
} from "../src/resolution.js";
import type { ThreatState } from "../src/state.js";

function threat(overrides: Partial<ThreatState> = {}): ThreatState {
  return {
    id: "t1",
    name: "Test Threat",
    rating: 6,
    startingAttack: 3,
    attack: 3,
    challenge: 0,
    solo: false,
    elite: false,
    flags: {},
    status: "active",
    revealed: true,
    ...overrides,
  };
}

describe("effectiveAttack (matrix O3)", () => {
  it("is the stored attack when rating is positive", () => {
    expect(effectiveAttack({ rating: 4, attack: 3 })).toBe(3);
  });

  it("is 0 when rating is 0 regardless of the stored attack", () => {
    expect(effectiveAttack({ rating: 0, attack: 5 })).toBe(0);
  });
});

describe("computeAttackDiceCount (matrix O1-O3, p.38 worked example)", () => {
  it("returns 0 with no engaged Threats (O2)", () => {
    const threats = [threat({ id: "a", rating: 6, attack: 3 })];
    expect(computeAttackDiceCount(threats, [])).toBe(0);
  });

  it("reproduces the p.38 worked example: 6/3 and 4/2 engaged -> 4 dice", () => {
    const threats = [
      threat({ id: "a", rating: 6, attack: 3 }),
      threat({ id: "b", rating: 4, attack: 2 }),
    ];
    expect(computeAttackDiceCount(threats, ["a", "b"])).toBe(4); // max(3,2) + (2-1)
  });

  it("after the first Threat is beaten to 0, the same engagement rolls 2 dice", () => {
    const threats = [
      threat({ id: "a", rating: 0, attack: 3 }), // effective attack 0, and no longer "in play"
      threat({ id: "b", rating: 4, attack: 2 }),
    ];
    expect(computeAttackDiceCount(threats, ["a", "b"])).toBe(2); // max(0,2) + (1-1)
  });

  it("a single engaged Threat with no other active Threats in play rolls just its Attack", () => {
    const threats = [threat({ id: "a", rating: 6, attack: 3 })];
    expect(computeAttackDiceCount(threats, ["a"])).toBe(3);
  });

  it("counts every active Threat in play, engaged or not, for the +1 bonus", () => {
    const threats = [
      threat({ id: "a", rating: 6, attack: 3 }),
      threat({ id: "b", rating: 4, attack: 1 }), // not engaged, still "in play"
      threat({ id: "c", rating: 0, attack: 9 }), // rating 0: not "in play"
    ];
    expect(computeAttackDiceCount(threats, ["a"])).toBe(4); // 3 + (2 active in play - 1)
  });
});

describe("rollCategoryIndex (matrix I1)", () => {
  it.each([
    [1, 0],
    [2, 0],
    [3, 1],
    [4, 1],
    [5, 2],
    [6, 2],
  ])("face %i maps to category index %i", (face, expected) => {
    expect(rollCategoryIndex(face)).toBe(expected);
  });
});

describe("challengeDamage (matrix A7, p.38 worked example)", () => {
  it("Challenge 2, 3 successes -> -1 rating", () => {
    expect(challengeDamage(3, 2)).toBe(1);
  });

  it("Challenge 1, 4 successes -> -3 rating", () => {
    expect(challengeDamage(4, 1)).toBe(3);
  });

  it("never goes negative when Challenge exceeds points", () => {
    expect(challengeDamage(1, 5)).toBe(0);
  });

  it("Challenge 0 passes points through unchanged", () => {
    expect(challengeDamage(5, 0)).toBe(5);
  });
});

describe("groupAllocationsByTarget (matrix A7-A8)", () => {
  it("sums points for repeated dice on the same target", () => {
    const grouped = groupAllocationsByTarget(
      [
        { dieFaceIndex: 0, target: { kind: "threat", threatId: "t1" } },
        { dieFaceIndex: 1, target: { kind: "threat", threatId: "t1" } },
      ],
      new Map([
        [0, 1],
        [1, 2],
      ]),
    );
    expect(grouped).toEqual([
      { target: { kind: "threat", threatId: "t1" }, dieFaceIndexes: [0, 1], points: 3 },
    ]);
  });

  it("keeps different targets in separate groups", () => {
    const grouped = groupAllocationsByTarget(
      [
        { dieFaceIndex: 0, target: { kind: "threat", threatId: "t1" } },
        { dieFaceIndex: 1, target: { kind: "objective", objectiveId: "o1" } },
      ],
      new Map([
        [0, 1],
        [1, 1],
      ]),
    );
    expect(grouped).toHaveLength(2);
  });
});
