import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import type { EatTheReichState } from "../src/state.js";
import {
  FixedSequenceRandom,
  GM_CTX,
  PLAYER_CTX,
  PLAYER_MEMBER_ID,
  ROOK_ID,
  SECOND_PLAYER_CTX,
  stateWithClaim,
  stateWithRoll,
  stateWithScene,
} from "./fixtures.js";

const THREAT_ID = "threat-fixture";

/** Rook, claimed, with a scene of one primary Objective (rating 8, challenge 0) and one revealed Threat (rating 6, attack 3, challenge 0). */
function baseState(patch: { objective?: object; threat?: object } = {}): EatTheReichState {
  return stateWithScene(patch, stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID));
}

describe("decide: BeginAction (matrix declare, C1-C3, P1-P3)", () => {
  it("declares an action and records it as a pending roll", () => {
    const state = baseState();
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "SNEAK",
        itemIds: ["rook-silenced-pistol"],
        abilityIds: [],
        bonusClaimIds: ["rook-silenced-pistol"],
        engagedThreatIds: [THREAT_ID],
        note: null,
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.events[0]?.event).toMatchObject({
      type: "ActionDeclared",
      characterId: ROOK_ID,
      stat: "SNEAK",
      itemIds: ["rook-silenced-pistol"],
      engagedThreatIds: [THREAT_ID],
    });
  });

  it("redacts item/ability/bonus/engagement detail from the shared (non-owner) event copy", () => {
    const state = baseState();
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "SNEAK",
        itemIds: ["rook-silenced-pistol"],
        abilityIds: [],
        bonusClaimIds: [],
        engagedThreatIds: [THREAT_ID],
        note: "a secret plan",
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const sharedEffect = decision.events[0]?.effects.find((e) => e.destination.kind === "shared");
    expect(sharedEffect?.payload).toMatchObject({ stat: "none", itemIds: [], note: null });
    const gmEffect = decision.events[0]?.effects.find((e) => e.destination.kind === "gm");
    expect(gmEffect?.payload).toMatchObject({ stat: "SNEAK", note: "a secret plan" });
  });

  it("rejects declaring for a character you do not own", () => {
    const state = baseState();
    const decision = eatTheReichTemplate.decide(
      { state, actor: SECOND_PLAYER_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "SNEAK",
        itemIds: [],
        abilityIds: [],
        bonusClaimIds: [],
        engagedThreatIds: [],
        note: null,
      },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("ROLE_FORBIDDEN");
  });

  it("rejects a downed character (matrix I2)", () => {
    const before = baseState();
    const rook = before.characters[ROOK_ID];
    if (!rook) throw new Error("fixture missing rook");
    const state: EatTheReichState = {
      ...before,
      characters: { ...before.characters, [ROOK_ID]: { ...rook, downed: true } },
    };
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "SNEAK",
        itemIds: [],
        abilityIds: [],
        bonusClaimIds: [],
        engagedThreatIds: [],
        note: null,
      },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("CHARACTER_DOWNED");
  });

  it("rejects declaring while an unresolved roll already exists", () => {
    const state = stateWithRoll(
      {
        id: "roll-open",
        characterId: ROOK_ID,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "declared",
      },
      baseState(),
    );
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "SNEAK",
        itemIds: [],
        abilityIds: [],
        bonusClaimIds: [],
        engagedThreatIds: [],
        note: null,
      },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("ROLL_ALREADY_RESOLVED");
  });

  it("rejects a bonus claim for something not selected", () => {
    const decision = eatTheReichTemplate.decide(
      { state: baseState(), actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "SNEAK",
        itemIds: [],
        abilityIds: [],
        bonusClaimIds: ["rook-silenced-pistol"],
        engagedThreatIds: [],
        note: null,
      },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("UNKNOWN_ACTION");
  });

  it("rejects declaring with a depleted item (ITEM_DEPLETED)", () => {
    const before = baseState();
    const rook = before.characters[ROOK_ID];
    if (!rook) throw new Error("fixture missing rook");
    const state: EatTheReichState = {
      ...before,
      characters: {
        ...before.characters,
        [ROOK_ID]: {
          ...rook,
          items: rook.items.map((item) =>
            item.id === "rook-silenced-pistol" ? { ...item, usesRemaining: 0 } : item,
          ),
        },
      },
    };
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "SNEAK",
        itemIds: ["rook-silenced-pistol"],
        abilityIds: [],
        bonusClaimIds: [],
        engagedThreatIds: [],
        note: null,
      },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("ITEM_DEPLETED");
  });

  it("rejects engaging an unrevealed or unknown Threat", () => {
    const decision = eatTheReichTemplate.decide(
      { state: baseState(), actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "SNEAK",
        itemIds: [],
        abilityIds: [],
        bonusClaimIds: [],
        engagedThreatIds: ["not-a-threat"],
        note: null,
      },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("UNKNOWN_ACTION");
  });
});

describe("decide: ReviewAction (matrix P4-P6, D1-D3, O1-O4)", () => {
  function declaredState(): EatTheReichState {
    return stateWithRoll(
      {
        id: "roll-1",
        characterId: ROOK_ID,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "declared",
        declaredStat: "CON",
        declaredItemIds: ["rook-silenced-pistol"],
        declaredBonusClaimIds: ["rook-silenced-pistol"],
        declaredEngagedThreatIds: [THREAT_ID],
      },
      baseState(),
    );
  }

  it("computes the full pool (stat + item + approved bonus), rolls dice, and charges resources", () => {
    // Pool = CON(4) + item(1) + bonus(+1 approved) = 6 player dice; threat attack(3) = 3 attack dice.
    const playerFaces = [6, 5, 4, 3, 2, 1];
    const attackFaces = [4, 1, 2];
    const random = new FixedSequenceRandom([...playerFaces, ...attackFaces]);
    const decision = eatTheReichTemplate.decide(
      { state: declaredState(), actor: GM_CTX, random },
      {
        type: "ReviewAction",
        rollId: "roll-1",
        approvedClaimIds: ["rook-silenced-pistol"],
        engagedThreatIds: [THREAT_ID],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    expect(event).toMatchObject({
      type: "ActionRolled",
      playerFaces,
      attackFaces,
      attackDiceRolled: 3,
      attackSuccessesRolled: 1, // only face 4 is >= 4 among [4,1,2]
      itemIdsCharged: ["rook-silenced-pistol"],
      bloodSpent: 0,
    });
    if (event?.type !== "ActionRolled") return;
    expect(event.keptDice).toEqual([
      { faceIndex: 0, face: 6, result: "critical", points: 2 },
      { faceIndex: 1, face: 5, result: "success", points: 1 },
      { faceIndex: 2, face: 4, result: "success", points: 1 },
    ]);
  });

  it("a struck bonus claim contributes no dice (matrix P4)", () => {
    // Pool = CON(4) + item(1), no bonus = 5 player dice.
    const random = new FixedSequenceRandom([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    const decision = eatTheReichTemplate.decide(
      { state: declaredState(), actor: GM_CTX, random },
      {
        type: "ReviewAction",
        rollId: "roll-1",
        approvedClaimIds: [],
        engagedThreatIds: [THREAT_ID],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "ActionRolled") throw new Error("expected ActionRolled");
    expect(event.playerFaces).toHaveLength(5);
    expect(event.approvedBonusClaims).toEqual([
      { sourceId: "rook-silenced-pistol", approved: false, plus: 1 },
    ]);
  });

  it("charges Blood for a selected blood-cost ability", () => {
    const withScene = baseState({ threat: { rating: 0 } }); // no attack dice, keep test focused
    const rook = withScene.characters[ROOK_ID];
    if (!rook) throw new Error("fixture missing rook");
    const withBlood: EatTheReichState = {
      ...withScene,
      characters: { ...withScene.characters, [ROOK_ID]: { ...rook, blood: 3 } },
    };
    const state = stateWithRoll(
      {
        id: "roll-1",
        characterId: ROOK_ID,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "declared",
        declaredStat: "CON",
        declaredAbilityIds: ["rook-blood-second-wind"],
      },
      withBlood,
    );
    const random = new FixedSequenceRandom([2, 2, 2, 2, 2]); // CON(4) + ability(1) = 5 dice, no attack
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random },
      { type: "ReviewAction", rollId: "roll-1", approvedClaimIds: [], engagedThreatIds: [] },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "ActionRolled") throw new Error("expected ActionRolled");
    expect(event.bloodSpent).toBe(1);
  });

  it("Corpse Eater gains exactly 1 Blood when any number of 1s are rolled", () => {
    const characterId = "orsolya";
    const state = stateWithRoll(
      {
        id: "roll-1",
        characterId,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "declared",
        declaredStat: "CON",
      },
      stateWithScene({ threat: { rating: 0 } }, stateWithClaim(characterId, PLAYER_MEMBER_ID)),
    );
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([1]) },
      { type: "ReviewAction", rollId: "roll-1", approvedClaimIds: [], engagedThreatIds: [] },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.events[0]?.event).toMatchObject({
      type: "ActionRolled",
      playerFaces: [1],
      passiveBloodGained: 1,
    });
  });

  it("lets a player mark Cigarettes to regain 2 Blood", () => {
    const before = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    const rook = before.characters[ROOK_ID]!;
    const state = {
      ...before,
      characters: { ...before.characters, [ROOK_ID]: { ...rook, blood: 1 } },
    };
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "UseUtilityItem",
        characterId: ROOK_ID,
        itemId: "rook-pocket-mirror",
        rollId: null,
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.events[0]?.event).toMatchObject({
      type: "CharacterCorrected",
      patch: {
        blood: 3,
        itemUses: [{ itemId: "rook-pocket-mirror", usesRemaining: 2 }],
      },
    });
  });

  it("lets Chuck destroy the Cowboy hat to cancel a pending Downed result", () => {
    const characterId = "orsolya";
    const state = stateWithRoll(
      {
        id: "roll-1",
        characterId,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "awaiting_injury_choice",
        injuryChoicePending: { mode: "downed" },
      },
      stateWithClaim(characterId, PLAYER_MEMBER_ID),
    );
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "UseUtilityItem",
        characterId,
        itemId: "orsolya-draft-horse",
        rollId: "roll-1",
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.events.map((entry) => entry.event)).toMatchObject([
      {
        type: "CharacterCorrected",
        patch: { itemUses: [{ itemId: "orsolya-draft-horse", usesRemaining: 0 }] },
      },
      {
        type: "InjuryCategoryChosen",
        rollId: "roll-1",
        mark: { boxIndexes: [], downed: false, rescueObjective: null },
      },
    ]);
  });

  it("does not let Chuck redirect a deferred hat injury to another category", () => {
    const characterId = "orsolya";
    const state = stateWithRoll(
      {
        id: "roll-1",
        characterId,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "awaiting_injury_choice",
        injuryChoicePending: {
          mode: "single",
          preferredCategoryId: "orsolya-saddle-lost",
        },
      },
      stateWithClaim(characterId, PLAYER_MEMBER_ID),
    );
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "ChooseInjuryCategory",
        rollId: "roll-1",
        categoryId: "orsolya-sabre-arm-numb",
      },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("INVALID_ALLOCATION");
  });

  it("noBonusDice forbids bonus dice even when the GM approves the claim (matrix P7)", () => {
    const before = declaredState();
    const rook = before.characters[ROOK_ID];
    if (!rook) throw new Error("fixture missing rook");
    const state: EatTheReichState = {
      ...before,
      characters: {
        ...before.characters,
        [ROOK_ID]: {
          ...rook,
          injuries: rook.injuries.map((c, i) =>
            i === 0
              ? {
                  ...c,
                  boxes: [
                    { marked: true },
                    { marked: true, penalty: { kind: "noBonusDice" } },
                  ] as typeof c.boxes,
                }
              : c,
          ),
        },
      },
    };
    // Pool = CON(4) + item(1), no bonus even though approved = 5 player dice; threat attack(3) = 3 attack dice.
    const random = new FixedSequenceRandom([1, 1, 1, 1, 1, 1, 1, 1]);
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random },
      {
        type: "ReviewAction",
        rollId: "roll-1",
        approvedClaimIds: ["rook-silenced-pistol"],
        engagedThreatIds: [THREAT_ID],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "ActionRolled") throw new Error("expected ActionRolled");
    expect(event.playerFaces).toHaveLength(5);
    // Approval is still recorded for audit even though it contributed no dice.
    expect(event.approvedBonusClaims).toEqual([
      { sourceId: "rook-silenced-pistol", approved: true, plus: 1 },
    ]);
  });

  it("rejects reviewing a roll that is not awaiting review", () => {
    const state = stateWithRoll(
      { id: "roll-1", characterId: ROOK_ID, actorMemberId: PLAYER_MEMBER_ID, status: "resolved" },
      baseState(),
    );
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "ReviewAction", rollId: "roll-1", approvedClaimIds: [], engagedThreatIds: [] },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("ROLL_ALREADY_RESOLVED");
  });
});

describe("decide: AllocateResults (matrix A1-A9, O4, I1-I2)", () => {
  /** faces [6,5,4] kept as critical(2pts)/success(1pt)/success(1pt); 1 attack success rolled. */
  function rolledState(
    overrides: Partial<Parameters<typeof stateWithRoll>[0]> = {},
    base: EatTheReichState = baseState(),
  ): EatTheReichState {
    return stateWithRoll(
      {
        id: "roll-1",
        characterId: ROOK_ID,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "awaiting_allocation",
        engagedThreatIds: [THREAT_ID],
        primaryEngagedThreatId: THREAT_ID,
        playerFaces: [6, 5, 4],
        keptDice: [
          { faceIndex: 0, face: 6, result: "critical", points: 2 },
          { faceIndex: 1, face: 5, result: "success", points: 1 },
          { faceIndex: 2, face: 4, result: "success", points: 1 },
        ],
        attackDiceRolled: 1,
        attackFaces: [4],
        attackSuccessesRolled: 1,
        ...overrides,
      },
      base,
    );
  }

  it("every kept die must be allocated exactly once (A1)", () => {
    const decision = eatTheReichTemplate.decide(
      { state: rolledState(), actor: PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [{ dieFaceIndex: 0, target: { kind: "defend" } }], // dice 1 and 2 left unassigned
      },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("INVALID_ALLOCATION");
  });

  it("a duplicate die index is rejected (A1)", () => {
    const decision = eatTheReichTemplate.decide(
      { state: rolledState(), actor: PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { dieFaceIndex: 0, target: { kind: "defend" } },
          { dieFaceIndex: 0, target: { kind: "feed" } },
          { dieFaceIndex: 1, target: { kind: "defend" } },
          { dieFaceIndex: 2, target: { kind: "defend" } },
        ],
      },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("INVALID_ALLOCATION");
  });

  it("a player cannot allocate another actor's roll (A9)", () => {
    const decision = eatTheReichTemplate.decide(
      { state: rolledState(), actor: SECOND_PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { dieFaceIndex: 0, target: { kind: "defend" } },
          { dieFaceIndex: 1, target: { kind: "defend" } },
          { dieFaceIndex: 2, target: { kind: "defend" } },
        ],
      },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("ROLE_FORBIDDEN");
  });

  it("Challenge negates points before rating drops: Challenge 2, 3 successes -> -1 (p.38 worked example)", () => {
    const state = baseState({ threat: { challenge: 2, rating: 6 } });
    const withRoll = stateWithRoll(
      {
        id: "roll-1",
        characterId: ROOK_ID,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "awaiting_allocation",
        engagedThreatIds: [THREAT_ID],
        primaryEngagedThreatId: THREAT_ID,
        playerFaces: [4, 4, 4],
        keptDice: [
          { faceIndex: 0, face: 4, result: "success", points: 1 },
          { faceIndex: 1, face: 4, result: "success", points: 1 },
          { faceIndex: 2, face: 4, result: "success", points: 1 },
        ],
        attackDiceRolled: 0,
        attackFaces: [],
        attackSuccessesRolled: 0,
      },
      state,
    );
    const decision = eatTheReichTemplate.decide(
      { state: withRoll, actor: PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { dieFaceIndex: 0, target: { kind: "threat", threatId: THREAT_ID } },
          { dieFaceIndex: 1, target: { kind: "threat", threatId: THREAT_ID } },
          { dieFaceIndex: 2, target: { kind: "threat", threatId: THREAT_ID } },
        ],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "ActionResolved") throw new Error("expected ActionResolved");
    expect(event.threatDeltas).toEqual([
      { threatId: THREAT_ID, ratingAfter: 5, attackAfter: 3, status: "active" },
    ]);
  });

  it("an Objective reaching 0 completes; a Threat reaching 0 is beaten and its Attack drops to 0", () => {
    const state = baseState({
      objective: { rating: 2, challenge: 0 },
      threat: { rating: 2, challenge: 0 },
    });
    const withRoll = stateWithRoll(
      {
        id: "roll-1",
        characterId: ROOK_ID,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "awaiting_allocation",
        engagedThreatIds: [THREAT_ID],
        primaryEngagedThreatId: THREAT_ID,
        playerFaces: [6, 6],
        keptDice: [
          { faceIndex: 0, face: 6, result: "critical", points: 2 },
          { faceIndex: 1, face: 6, result: "critical", points: 2 },
        ],
        attackDiceRolled: 0,
        attackFaces: [],
        attackSuccessesRolled: 0,
      },
      state,
    );
    const decision = eatTheReichTemplate.decide(
      { state: withRoll, actor: PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { dieFaceIndex: 0, target: { kind: "objective", objectiveId: "objective-fixture" } },
          { dieFaceIndex: 1, target: { kind: "threat", threatId: THREAT_ID } },
        ],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "ActionResolved") throw new Error("expected ActionResolved");
    expect(event.objectiveDeltas).toEqual([
      { objectiveId: "objective-fixture", ratingAfter: 0, status: "complete" },
    ]);
    expect(event.threatDeltas).toEqual([
      { threatId: THREAT_ID, ratingAfter: 0, attackAfter: 0, status: "beaten" },
    ]);
  });

  it("defend removes Attack successes by points, floor 0", () => {
    const decision = eatTheReichTemplate.decide(
      {
        state: rolledState({ attackSuccessesRolled: 2 }),
        actor: PLAYER_CTX,
        random: new FixedSequenceRandom([1]),
      },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { dieFaceIndex: 0, target: { kind: "defend" } },
          { dieFaceIndex: 1, target: { kind: "defend" } },
          { dieFaceIndex: 2, target: { kind: "feed" } },
        ],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "ActionResolved") throw new Error("expected ActionResolved");
    // 2+1=3 defend points against 2 attack successes -> 0 remaining, no injury.
    expect(event.remainingAttackSuccessesAfterAllocation).toBe(0);
    expect(event.injuryMark).toBeNull();
    expect(event.bloodDelta).toBe(1); // the feed die (1 point)
  });

  it("feed adds points to Blood, clamped at 10", () => {
    const withRoll = stateWithRoll(
      {
        id: "roll-1",
        characterId: ROOK_ID,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "awaiting_allocation",
        engagedThreatIds: [],
        primaryEngagedThreatId: null,
        playerFaces: [6, 6],
        keptDice: [
          { faceIndex: 0, face: 6, result: "critical", points: 2 },
          { faceIndex: 1, face: 6, result: "critical", points: 2 },
        ],
        attackDiceRolled: 0,
        attackFaces: [],
        attackSuccessesRolled: 0,
      },
      stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID, { blood: 8 }, baseState()),
    );
    const decision = eatTheReichTemplate.decide(
      { state: withRoll, actor: PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { dieFaceIndex: 0, target: { kind: "feed" } },
          { dieFaceIndex: 1, target: { kind: "feed" } },
        ],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "ActionResolved") throw new Error("expected ActionResolved");
    expect(event.bloodDelta).toBe(2); // clamped by reduce() to blood 10, not 12
  });

  it("a success die cannot activate a SPECIAL (A6)", () => {
    const decision = eatTheReichTemplate.decide(
      { state: rolledState(), actor: PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { dieFaceIndex: 1, target: { kind: "special", abilityId: "rook-special-blackout-drop" } },
          { dieFaceIndex: 0, target: { kind: "defend" } },
          { dieFaceIndex: 2, target: { kind: "defend" } },
        ],
      },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("INVALID_ALLOCATION");
  });

  it("a critical activates a SPECIAL and applies its typed effect (reduceThreatAttack)", () => {
    const decision = eatTheReichTemplate.decide(
      { state: rolledState(), actor: PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { dieFaceIndex: 0, target: { kind: "special", abilityId: "rook-special-blackout-drop" } },
          { dieFaceIndex: 1, target: { kind: "defend" } },
          { dieFaceIndex: 2, target: { kind: "defend" } },
        ],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "ActionResolved") throw new Error("expected ActionResolved");
    // Deadeye Shot: reduceThreatAttack(1) on the primary engaged Threat (attack 3 -> 2).
    expect(event.threatDeltas).toEqual([
      { threatId: THREAT_ID, ratingAfter: 6, attackAfter: 2, status: "active" },
    ]);
  });

  it("zero-success Attack bump: the primary engaged Threat's Attack rises by 1 when the GM rolled none (O4)", () => {
    const withRoll = stateWithRoll(
      {
        id: "roll-1",
        characterId: ROOK_ID,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "awaiting_allocation",
        engagedThreatIds: [THREAT_ID],
        primaryEngagedThreatId: THREAT_ID,
        playerFaces: [4],
        keptDice: [{ faceIndex: 0, face: 4, result: "success", points: 1 }],
        attackDiceRolled: 3,
        attackFaces: [1, 2, 3],
        attackSuccessesRolled: 0,
      },
      baseState(),
    );
    const decision = eatTheReichTemplate.decide(
      { state: withRoll, actor: PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [{ dieFaceIndex: 0, target: { kind: "feed" } }],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "ActionResolved") throw new Error("expected ActionResolved");
    expect(event.attackBumpThreatId).toBe(THREAT_ID);
    expect(event.threatDeltas).toEqual([
      { threatId: THREAT_ID, ratingAfter: 6, attackAfter: 4, status: "active" },
    ]);
  });

  it("1 remaining Attack success rolls one injury category and marks the first open box (I1)", () => {
    const decision = eatTheReichTemplate.decide(
      { state: rolledState(), actor: PLAYER_CTX, random: new FixedSequenceRandom([3]) }, // face 3 -> category index 1
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { dieFaceIndex: 0, target: { kind: "feed" } },
          { dieFaceIndex: 1, target: { kind: "feed" } },
          { dieFaceIndex: 2, target: { kind: "feed" } },
        ],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "ActionResolved") throw new Error("expected ActionResolved");
    expect(event.remainingAttackSuccessesAfterAllocation).toBe(1);
    expect(event.injuryMark).toEqual({
      categoryId: "rook-hands-broken",
      boxIndexes: [0],
      downed: false,
      rescueObjective: null,
    });
  });

  it("defers Chuck's normal injury so the Cowboy hat can cancel it", () => {
    const characterId = "orsolya";
    const state = rolledState(
      { characterId },
      stateWithScene({}, stateWithClaim(characterId, PLAYER_MEMBER_ID)),
    );
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: new FixedSequenceRandom([3]) },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { dieFaceIndex: 0, target: { kind: "feed" } },
          { dieFaceIndex: 1, target: { kind: "feed" } },
          { dieFaceIndex: 2, target: { kind: "feed" } },
        ],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.events[0]?.event).toMatchObject({
      type: "ActionResolved",
      injuryMark: null,
      injuryChoicePendingMode: "single",
      injuryChoicePendingCategoryId: "orsolya-saddle-lost",
    });
  });

  it("3+ remaining Attack successes downs the character, marks all boxes, and creates a rescue Objective (I2)", () => {
    const decision = eatTheReichTemplate.decide(
      {
        state: rolledState({ attackSuccessesRolled: 3 }),
        actor: PLAYER_CTX,
        random: new FixedSequenceRandom([5]),
      }, // category index 2
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { dieFaceIndex: 0, target: { kind: "feed" } },
          { dieFaceIndex: 1, target: { kind: "feed" } },
          { dieFaceIndex: 2, target: { kind: "feed" } },
        ],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "ActionResolved") throw new Error("expected ActionResolved");
    expect(event.injuryMark?.downed).toBe(true);
    expect(event.injuryMark?.categoryId).toBe("rook-line-cut");
    expect(event.injuryMark?.boxIndexes).toEqual([0, 1]);
    expect(event.injuryMark?.rescueObjective).toMatchObject({ id: "rescue-rook", kind: "rescue" });
  });

  it("when the rolled category has no open box, the roll awaits ChooseInjuryCategory instead of marking anything", () => {
    const before = baseState();
    const rook = before.characters[ROOK_ID];
    if (!rook) throw new Error("fixture missing rook");
    // Category index 1 ("rook-hands-broken", matching face 3 below) fully marked already.
    const filled: EatTheReichState = {
      ...before,
      characters: {
        ...before.characters,
        [ROOK_ID]: {
          ...rook,
          injuries: rook.injuries.map((c, i) =>
            i === 1
              ? {
                  ...c,
                  boxes: [{ marked: true }, { ...c.boxes[1], marked: true }] as typeof c.boxes,
                }
              : c,
          ),
        },
      },
    };
    const decision = eatTheReichTemplate.decide(
      { state: rolledState({}, filled), actor: PLAYER_CTX, random: new FixedSequenceRandom([3]) },
      {
        type: "AllocateResults",
        rollId: "roll-1",
        allocations: [
          { dieFaceIndex: 0, target: { kind: "feed" } },
          { dieFaceIndex: 1, target: { kind: "feed" } },
          { dieFaceIndex: 2, target: { kind: "feed" } },
        ],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "ActionResolved") throw new Error("expected ActionResolved");
    expect(event.injuryMark).toBeNull();
    expect(event.injuryChoicePendingMode).toBe("single");
  });
});

describe("decide: ChooseInjuryCategory (matrix I1 overflow)", () => {
  it("resolves the pending choice by marking the chosen (open) category", () => {
    const before = baseState();
    const rook = before.characters[ROOK_ID];
    if (!rook) throw new Error("fixture missing rook");
    const state = stateWithRoll(
      {
        id: "roll-1",
        characterId: ROOK_ID,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "awaiting_injury_choice",
        injuryChoicePending: { mode: "single" },
      },
      before,
    );
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      { type: "ChooseInjuryCategory", rollId: "roll-1", categoryId: "rook-papers-burned" },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "InjuryCategoryChosen") throw new Error("expected InjuryCategoryChosen");
    expect(event.mark).toEqual({
      categoryId: "rook-papers-burned",
      boxIndexes: [0],
      downed: false,
      rescueObjective: null,
    });
  });

  it("rejects choosing a category that also has no open box", () => {
    const before = baseState();
    const rook = before.characters[ROOK_ID];
    if (!rook) throw new Error("fixture missing rook");
    const filled: EatTheReichState = {
      ...before,
      characters: {
        ...before.characters,
        [ROOK_ID]: {
          ...rook,
          injuries: rook.injuries.map((c, i) =>
            i === 0
              ? {
                  ...c,
                  boxes: [{ marked: true }, { ...c.boxes[1], marked: true }] as typeof c.boxes,
                }
              : c,
          ),
        },
      },
    };
    const state = stateWithRoll(
      {
        id: "roll-1",
        characterId: ROOK_ID,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "awaiting_injury_choice",
        injuryChoicePending: { mode: "single" },
      },
      filled,
    );
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      { type: "ChooseInjuryCategory", rollId: "roll-1", categoryId: "rook-papers-burned" },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("INVALID_ALLOCATION");
  });

  it("rejects when no choice is pending", () => {
    const state = stateWithRoll(
      { id: "roll-1", characterId: ROOK_ID, actorMemberId: PLAYER_MEMBER_ID, status: "resolved" },
      baseState(),
    );
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      { type: "ChooseInjuryCategory", rollId: "roll-1", categoryId: "rook-papers-burned" },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("ROLL_ALREADY_RESOLVED");
  });
});
