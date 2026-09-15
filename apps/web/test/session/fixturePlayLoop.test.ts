import { describe, expect, it } from "vitest";
import {
  characterStateFromFixture,
  diePoints,
  explainDeclareChoice,
  interpretDie,
  resolveAllocation,
  sceneStateFromFixture,
  totalRollPoints,
  validAllocationTargets,
  type ActiveRollState,
} from "../../src/session/fixturePlayLoop.js";
import { ETR_ROSTER_FIXTURE, ETR_SCENE_FIXTURE } from "../fixtures/etrTemp.js";

const rook = ETR_ROSTER_FIXTURE.find((c) => c.id === "rook")!;
const dropForecourt = ETR_SCENE_FIXTURE.find((s) => s.id === "drop-forecourt")!;

describe("fixturePlayLoop (TEMPORARY C02 fixture engine)", () => {
  it("interprets dice per D1: 1-3 discard, 4-5 success, 6 critical", () => {
    expect(interpretDie(1)).toBe("discard");
    expect(interpretDie(3)).toBe("discard");
    expect(interpretDie(4)).toBe("success");
    expect(interpretDie(5)).toBe("success");
    expect(interpretDie(6)).toBe("critical");
    expect(diePoints("discard")).toBe(0);
    expect(diePoints("success")).toBe(1);
    expect(diePoints("critical")).toBe(2);
  });

  it("explains a pool as stat + items + abilities + claimed bonuses", () => {
    const character = characterStateFromFixture(rook);
    const explanation = explainDeclareChoice(character, {
      statIndex: 5, // Sneak: 4
      itemIds: ["rook-silenced-pistol"], // +1
      abilityIds: ["rook-other-practiced-hands"], // +1, free
      bonusClaimIds: ["rook-silenced-pistol"], // +1 (bonusCount)
      engagedThreatIds: [],
    });
    expect(explanation.total).toBe(4 + 1 + 1 + 1);
  });

  it("computes a pool of 2 dice when no stat fits", () => {
    const character = characterStateFromFixture(rook);
    const explanation = explainDeclareChoice(character, {
      statIndex: null,
      itemIds: [],
      abilityIds: [],
      bonusClaimIds: [],
      engagedThreatIds: [],
    });
    expect(explanation.total).toBe(2);
  });

  it("offers Objective, engaged Threats, Defend (only if attack successes remain), and Feed (only if Blood < 10) as allocation targets", () => {
    const character = characterStateFromFixture(rook);
    const scene = sceneStateFromFixture(dropForecourt);
    const roll: ActiveRollState = {
      keptDice: [],
      discardedDice: [],
      gmAttackSuccessesRemaining: 2,
      engagedThreatIds: ["patrol-a"],
      allocations: {},
    };
    const targets = validAllocationTargets(scene, character, roll).map((t) => t.key);
    expect(targets).toContain("objective");
    expect(targets).toContain("threat:patrol-a");
    expect(targets).toContain("defend");
    expect(targets).toContain("feed");
    expect(targets).not.toContain("threat:patrol-b"); // not engaged

    const noAttack: ActiveRollState = { ...roll, gmAttackSuccessesRemaining: 0 };
    expect(validAllocationTargets(scene, character, noAttack).map((t) => t.key)).not.toContain(
      "defend",
    );

    const fullBlood = { ...character, blood: 10 };
    expect(validAllocationTargets(scene, fullBlood, roll).map((t) => t.key)).not.toContain("feed");
  });

  it("applies Challenge absorption per A7: damage = max(0, points - challenge)", () => {
    const character = characterStateFromFixture(rook);
    const scene = sceneStateFromFixture(ETR_SCENE_FIXTURE.find((s) => s.id === "printworks")!); // objective challenge 1
    const roll: ActiveRollState = {
      keptDice: [],
      discardedDice: [],
      gmAttackSuccessesRemaining: 0,
      engagedThreatIds: [],
      allocations: { objective: 3 },
    };
    const outcome = resolveAllocation(character, scene, roll);
    expect(outcome.scene.objectiveRating).toBe(scene.objectiveRating - (3 - 1));
  });

  it("marks one injury when 1-2 attack successes remain after allocation, and Downed at 3+", () => {
    const character = characterStateFromFixture(rook);
    const scene = sceneStateFromFixture(dropForecourt);
    const injured = resolveAllocation(character, scene, {
      keptDice: [],
      discardedDice: [],
      gmAttackSuccessesRemaining: 1,
      engagedThreatIds: [],
      allocations: {},
    });
    expect(injured.character.injuriesMarked).toBe(1);
    expect(injured.character.downed).toBe(false);

    const downed = resolveAllocation(character, scene, {
      keptDice: [],
      discardedDice: [],
      gmAttackSuccessesRemaining: 3,
      engagedThreatIds: [],
      allocations: {},
    });
    expect(downed.character.downed).toBe(true);
  });

  it("defend reduces remaining attack successes before the injury check", () => {
    const character = characterStateFromFixture(rook);
    const scene = sceneStateFromFixture(dropForecourt);
    const outcome = resolveAllocation(character, scene, {
      keptDice: [],
      discardedDice: [],
      gmAttackSuccessesRemaining: 3,
      engagedThreatIds: [],
      allocations: { defend: 3 },
    });
    expect(outcome.character.downed).toBe(false);
    expect(outcome.character.injuriesMarked).toBe(0);
  });

  it("feed adds points to Blood, clamped at 10", () => {
    const character = { ...characterStateFromFixture(rook), blood: 9 };
    const scene = sceneStateFromFixture(dropForecourt);
    const outcome = resolveAllocation(character, scene, {
      keptDice: [],
      discardedDice: [],
      gmAttackSuccessesRemaining: 0,
      engagedThreatIds: [],
      allocations: { feed: 5 },
    });
    expect(outcome.character.blood).toBe(10);
  });

  it("totalRollPoints sums success=1/critical=2 across kept dice", () => {
    const roll: ActiveRollState = {
      keptDice: [
        { id: "a", face: 5, kind: "success" },
        { id: "b", face: 6, kind: "critical" },
      ],
      discardedDice: [],
      gmAttackSuccessesRemaining: 0,
      engagedThreatIds: [],
      allocations: {},
    };
    expect(totalRollPoints(roll)).toBe(3);
  });
});
