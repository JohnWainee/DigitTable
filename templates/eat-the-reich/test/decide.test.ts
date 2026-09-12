import { describe, expect, it } from "vitest";
import { createSeededRandom } from "@digitable/engine";
import { ACTION_ID, GEAR_SILENCED_TOOL, THREAT_ID } from "../src/content.js";
import { eatTheReichTemplate } from "../src/engine.js";
import { rollPool } from "../src/pool.js";
import type { EatTheReichState } from "../src/state.js";
import {
  GM_CTX,
  GM_MEMBER_ID,
  PLAYER_CTX,
  PLAYER_MEMBER_ID,
  freshState,
  stateWithRoll,
} from "./fixtures.js";

function expectOk<T extends { ok: boolean }>(result: T): asserts result is T & { ok: true } {
  expect(result.ok).toBe(true);
}

function expectRejected<T extends { ok: boolean }>(result: T): asserts result is T & { ok: false } {
  expect(result.ok).toBe(false);
}

describe("decide: BeginAction", () => {
  it("rolls the visible pool plus the threat's hidden modifier, drawing dice in decide order", () => {
    const state = freshState();
    const seed = "begin-action-seed-1";
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: createSeededRandom(seed) },
      {
        type: "BeginAction",
        actorMemberId: PLAYER_MEMBER_ID,
        threatId: THREAT_ID,
        actionId: ACTION_ID,
        gearIds: [GEAR_SILENCED_TOOL],
      },
    );
    expectOk(decision);
    expect(decision.events).toHaveLength(1);
    const [decided] = decision.events;

    // nerve(2) + gear(1) + hiddenDifficultyModifier(-1) = 2 dice
    const expected = rollPool(createSeededRandom(seed), 2);
    expect(decided?.event).toMatchObject({
      type: "ActionRolled",
      faces: expected.faces,
      hits: expected.hits,
      poolComponents: { nerve: 2, gear: 1, hiddenModifier: -1 },
      hiddenAdjustmentApplied: true,
    });
  });

  it("redacts the hidden modifier and revealing face count from the shared copy", () => {
    const state = freshState();
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: createSeededRandom("redaction-seed") },
      {
        type: "BeginAction",
        actorMemberId: PLAYER_MEMBER_ID,
        threatId: THREAT_ID,
        actionId: ACTION_ID,
        gearIds: [],
      },
    );
    expectOk(decision);
    const [decided] = decision.events;
    const shared = decided?.effects.find((e) => e.destination.kind === "shared");
    const gm = decided?.effects.find((e) => e.destination.kind === "gm");
    expect(shared?.payload).toMatchObject({
      faces: null,
      poolComponents: { hiddenModifier: null },
      hiddenAdjustmentApplied: true,
    });
    expect(gm?.payload).toMatchObject({
      poolComponents: { hiddenModifier: -1 },
      hiddenAdjustmentApplied: true,
    });
    expect(gm?.payload.type).toBe("ActionRolled");
    if (gm?.payload.type !== "ActionRolled") return;
    expect(Array.isArray(gm.payload.faces)).toBe(true);
  });

  it("rejects an actor with no bound character", () => {
    const decision = eatTheReichTemplate.decide(
      { state: freshState(), actor: GM_CTX, random: createSeededRandom("x") },
      {
        type: "BeginAction",
        actorMemberId: GM_MEMBER_ID,
        threatId: THREAT_ID,
        actionId: ACTION_ID,
        gearIds: [],
      },
    );
    expectRejected(decision);
    expect(decision.code).toBe("UNKNOWN_ACTION");
  });

  it("rejects an unknown threat", () => {
    const decision = eatTheReichTemplate.decide(
      { state: freshState(), actor: PLAYER_CTX, random: createSeededRandom("x") },
      {
        type: "BeginAction",
        actorMemberId: PLAYER_MEMBER_ID,
        threatId: "no-such-threat",
        actionId: ACTION_ID,
        gearIds: [],
      },
    );
    expectRejected(decision);
    expect(decision.code).toBe("UNKNOWN_ACTION");
  });

  it("rejects an unknown action id", () => {
    const decision = eatTheReichTemplate.decide(
      { state: freshState(), actor: PLAYER_CTX, random: createSeededRandom("x") },
      {
        type: "BeginAction",
        actorMemberId: PLAYER_MEMBER_ID,
        threatId: THREAT_ID,
        actionId: "not-a-real-action",
        gearIds: [],
      },
    );
    expectRejected(decision);
    expect(decision.code).toBe("UNKNOWN_ACTION");
  });

  it("rejects starting a new action while one is already unresolved for that actor", () => {
    const state = stateWithRoll({
      id: "roll-existing",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      status: "awaiting_opposition",
    });
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: createSeededRandom("x") },
      {
        type: "BeginAction",
        actorMemberId: PLAYER_MEMBER_ID,
        threatId: THREAT_ID,
        actionId: ACTION_ID,
        gearIds: [],
      },
    );
    expectRejected(decision);
    expect(decision.code).toBe("ROLL_ALREADY_RESOLVED");
  });
});

describe("decide: SubmitOpposition", () => {
  function awaitingOppositionState(playerHits: number): EatTheReichState {
    return stateWithRoll({
      id: "roll-1",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      status: "awaiting_opposition",
      playerHits,
    });
  }

  it("rolls the threat's base pool plus push dice and computes net successes", () => {
    const state = awaitingOppositionState(3);
    const seed = "opposition-seed-1";
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: createSeededRandom(seed) },
      { type: "SubmitOpposition", rollId: "roll-1", pushDice: 1 },
    );
    expectOk(decision);
    const expected = rollPool(createSeededRandom(seed), 4); // basePool(3) + pushDice(1)
    expect(decision.events[0]?.event).toMatchObject({
      type: "OppositionRolled",
      faces: expected.faces,
      hits: expected.hits,
      netSuccesses: Math.max(0, 3 - expected.hits),
    });
  });

  it("clamps net successes to zero when opposition beats the player", () => {
    // playerHits is 0, so netSuccesses = max(0, 0 - hits) is 0 regardless of
    // the opposition roll — this exercises the clamp itself, not luck.
    const state = awaitingOppositionState(0);
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: createSeededRandom("any-seed") },
      { type: "SubmitOpposition", rollId: "roll-1", pushDice: 2 },
    );
    expectOk(decision);
    const event = decision.events[0]?.event;
    expect(event && "netSuccesses" in event ? event.netSuccesses : undefined).toBe(0);
  });

  it("rejects an unknown roll", () => {
    const decision = eatTheReichTemplate.decide(
      { state: freshState(), actor: GM_CTX, random: createSeededRandom("x") },
      { type: "SubmitOpposition", rollId: "no-such-roll", pushDice: 0 },
    );
    expectRejected(decision);
    expect(decision.code).toBe("UNKNOWN_ACTION");
  });

  it("rejects a roll that is not awaiting opposition", () => {
    const state = stateWithRoll({
      id: "roll-1",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      status: "awaiting_allocation",
      netSuccesses: 1,
    });
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: createSeededRandom("x") },
      { type: "SubmitOpposition", rollId: "roll-1", pushDice: 0 },
    );
    expectRejected(decision);
    expect(decision.code).toBe("ROLL_ALREADY_RESOLVED");
  });

  it.each([-1, 3, 1.5])("rejects an out-of-range push value (%s)", (pushDice) => {
    const decision = eatTheReichTemplate.decide(
      { state: awaitingOppositionState(1), actor: GM_CTX, random: createSeededRandom("x") },
      { type: "SubmitOpposition", rollId: "roll-1", pushDice },
    );
    expectRejected(decision);
    expect(decision.code).toBe("INVALID_ALLOCATION");
  });
});

describe("decide: AllocateResults", () => {
  function awaitingAllocationState(netSuccesses: number): EatTheReichState {
    return stateWithRoll({
      id: "roll-1",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      status: "awaiting_allocation",
      netSuccesses,
    });
  }

  it("applies a valid allocation and reduces the threat's remaining resolve", () => {
    const decision = eatTheReichTemplate.decide(
      { state: awaitingAllocationState(2), actor: PLAYER_CTX, random: createSeededRandom("x") },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [{ optionId: "damage-threat", uses: 2 }],
      },
    );
    expectOk(decision);
    expect(decision.events[0]?.event).toMatchObject({
      type: "ActionResolved",
      threatResolveRemaining: 1, // maxResolve 3 - 2
      threatStatus: "active",
    });
  });

  it("marks the threat defeated once its resolve reaches zero", () => {
    const decision = eatTheReichTemplate.decide(
      { state: awaitingAllocationState(3), actor: PLAYER_CTX, random: createSeededRandom("x") },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [{ optionId: "damage-threat", uses: 3 }],
      },
    );
    expectOk(decision);
    expect(decision.events[0]?.event).toMatchObject({
      threatResolveRemaining: 0,
      threatStatus: "defeated",
    });
  });

  it("rejects allocation from a member who does not own the roll", () => {
    const decision = eatTheReichTemplate.decide(
      { state: awaitingAllocationState(2), actor: GM_CTX, random: createSeededRandom("x") },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [{ optionId: "damage-threat", uses: 1 }],
      },
    );
    expectRejected(decision);
    expect(decision.code).toBe("ROLE_FORBIDDEN");
  });

  it("rejects allocating an already-resolved roll", () => {
    const state = stateWithRoll({
      id: "roll-1",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      status: "resolved",
      netSuccesses: 2,
    });
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: createSeededRandom("x") },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [{ optionId: "damage-threat", uses: 1 }],
      },
    );
    expectRejected(decision);
    expect(decision.code).toBe("ROLL_ALREADY_RESOLVED");
  });

  it("rejects an unknown allocation option", () => {
    const decision = eatTheReichTemplate.decide(
      { state: awaitingAllocationState(2), actor: PLAYER_CTX, random: createSeededRandom("x") },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [{ optionId: "not-a-real-option", uses: 1 }],
      },
    );
    expectRejected(decision);
    expect(decision.code).toBe("INVALID_ALLOCATION");
  });

  it("rejects spending more uses than an option's maxUses allows", () => {
    const decision = eatTheReichTemplate.decide(
      { state: awaitingAllocationState(1), actor: PLAYER_CTX, random: createSeededRandom("x") },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [{ optionId: "damage-threat", uses: 5 }],
      },
    );
    expectRejected(decision);
    expect(decision.code).toBe("INVALID_ALLOCATION");
  });

  it("rejects spending more total successes than were earned across options", () => {
    // netSuccesses(1): 1 use of each option is individually within that
    // option's own maxUses, but their combined cost (2) exceeds netSuccesses.
    const decision = eatTheReichTemplate.decide(
      { state: awaitingAllocationState(1), actor: PLAYER_CTX, random: createSeededRandom("x") },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { optionId: "damage-threat", uses: 1 },
          { optionId: "advance-objective", uses: 1 },
        ],
      },
    );
    expectRejected(decision);
    expect(decision.code).toBe("INVALID_ALLOCATION");
  });

  it("rejects duplicate allocation option ids", () => {
    const decision = eatTheReichTemplate.decide(
      { state: awaitingAllocationState(2), actor: PLAYER_CTX, random: createSeededRandom("x") },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { optionId: "damage-threat", uses: 1 },
          { optionId: "damage-threat", uses: 1 },
        ],
      },
    );
    expectRejected(decision);
    expect(decision.code).toBe("INVALID_ALLOCATION");
  });

  it("allows spending zero successes (no-op allocation)", () => {
    const decision = eatTheReichTemplate.decide(
      { state: awaitingAllocationState(0), actor: PLAYER_CTX, random: createSeededRandom("x") },
      { type: "AllocateResults", rollId: "roll-1", allocations: [] },
    );
    expectOk(decision);
  });
});
