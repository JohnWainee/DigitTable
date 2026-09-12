import { describe, expect, it } from "vitest";
import { ACTION_ID, THREAT_ID } from "../src/content.js";
import { eatTheReichTemplate } from "../src/engine.js";
import { PLAYER_MEMBER_ID, freshState } from "./fixtures.js";

describe("reduce", () => {
  it("ActionRolled creates an awaiting_opposition roll and bumps nextRollSequence", () => {
    const state = freshState();
    const next = eatTheReichTemplate.reduce(state, {
      type: "ActionRolled",
      rollId: "roll-1",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      faces: [5, 6],
      hits: 2,
      poolComponents: { nerve: 2, gear: 0, hiddenModifier: -1 },
      hiddenAdjustmentApplied: true,
    });

    expect(next.rolls["roll-1"]).toMatchObject({
      status: "awaiting_opposition",
      playerFaces: [5, 6],
      playerHits: 2,
    });
    expect(next.nextRollSequence).toBe(state.nextRollSequence + 1);
    expect(state.rolls["roll-1"]).toBeUndefined(); // reduce does not mutate its input
  });

  it("OppositionRolled moves the roll to awaiting_allocation with opposition data", () => {
    const withRoll = eatTheReichTemplate.reduce(freshState(), {
      type: "ActionRolled",
      rollId: "roll-1",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      faces: [5],
      hits: 1,
      poolComponents: { nerve: 2, gear: 0, hiddenModifier: -1 },
      hiddenAdjustmentApplied: true,
    });

    const next = eatTheReichTemplate.reduce(withRoll, {
      type: "OppositionRolled",
      rollId: "roll-1",
      threatId: THREAT_ID,
      pushDice: 1,
      faces: [3, 4, 2, 1],
      hits: 0,
      netSuccesses: 1,
    });

    expect(next.rolls["roll-1"]).toMatchObject({
      status: "awaiting_allocation",
      pushDice: 1,
      oppositionHits: 0,
      netSuccesses: 1,
    });
  });

  it("ActionResolved marks the roll resolved and applies consequences to threat and objective", () => {
    const state = freshState();
    const next = eatTheReichTemplate.reduce(state, {
      type: "ActionResolved",
      rollId: "roll-1",
      allocations: [{ optionId: "damage-threat", uses: 2 }],
      threatId: THREAT_ID,
      threatResolveRemaining: 1,
      threatStatus: "active",
      objectiveAdvancesRemaining: 2,
      objectiveStatus: "active",
    });

    expect(next.threats[THREAT_ID]).toMatchObject({ resolveRemaining: 1, status: "active" });
    expect(next.objective).toMatchObject({ advancesRemaining: 2, status: "active" });
  });

  it("ActionResolved is a no-op on rolls/threats that no longer exist (defensive)", () => {
    const state = freshState();
    const next = eatTheReichTemplate.reduce(state, {
      type: "ActionResolved",
      rollId: "no-such-roll",
      allocations: [],
      threatId: "no-such-threat",
      threatResolveRemaining: 0,
      threatStatus: "defeated",
      objectiveAdvancesRemaining: 0,
      objectiveStatus: "complete",
    });
    expect(next.rolls).toEqual(state.rolls);
    expect(next.threats).toEqual(state.threats);
    // objective is always updated: it's tracked independently of any one threat/roll.
    expect(next.objective).toMatchObject({ advancesRemaining: 0, status: "complete" });
  });
});
