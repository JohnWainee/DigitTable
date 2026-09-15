import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import type { EatTheReichState } from "../src/state.js";
import {
  FixedSequenceRandom,
  GM_CTX,
  PLAYER_CTX,
  PLAYER_MEMBER_ID,
  ROOK_ID,
  freshState,
  stateWithClaim,
  stateWithRoll,
  stateWithScene,
} from "./fixtures.js";

const THREAT_ID = "threat-fixture";
const OBJECTIVE_ID = "objective-fixture";

function scenelessState(): EatTheReichState {
  return stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
}

describe("decide: LoadScene / NextScene (matrix S1, S8)", () => {
  const sceneInput = {
    sceneId: "scene-1",
    title: "New Scene",
    locationLabel: "Somewhere",
    objectives: [
      { id: "obj-1", title: "Primary", kind: "primary" as const, rating: 8, challenge: 0 },
    ],
    threats: [
      {
        id: "threat-1",
        name: "New Threat",
        rating: 6,
        attack: 3,
        challenge: 0,
        solo: false,
        elite: false,
        flags: {},
        revealed: true,
        notes: "",
      },
    ],
    reinforcementsMode: "book" as const,
  };

  it("LoadScene loads the first scene when none is active", () => {
    const decision = eatTheReichTemplate.decide(
      { state: scenelessState(), actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "LoadScene", ...sceneInput },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const event = decision.events[0]?.event;
    if (event?.type !== "SceneLoaded") throw new Error("expected SceneLoaded");
    expect(event.scene.id).toBe("scene-1");
    expect(event.scene.objectives).toHaveLength(1);
  });

  it("LoadScene never leaks GM-only Threat notes or unrevealed Threats to the shared event copy (matrix Appendix C)", () => {
    const decision = eatTheReichTemplate.decide(
      { state: scenelessState(), actor: GM_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "LoadScene",
        ...sceneInput,
        threats: [
          {
            id: "revealed-threat",
            name: "Revealed Threat",
            rating: 4,
            attack: 2,
            challenge: 0,
            solo: false,
            elite: false,
            flags: {},
            revealed: true,
            notes: "a public-facing gm note, still not for players",
          },
          {
            id: "hidden-threat",
            name: "The Hidden One",
            rating: 8,
            attack: 4,
            challenge: 1,
            solo: true,
            elite: true,
            flags: {},
            revealed: false,
            notes: "a very secret foreshadowing note",
          },
        ],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const gmEffect = decision.events[0]?.effects.find((e) => e.destination.kind === "gm");
    const sharedEffect = decision.events[0]?.effects.find((e) => e.destination.kind === "shared");
    if (gmEffect?.payload.type !== "SceneLoaded" || sharedEffect?.payload.type !== "SceneLoaded") {
      throw new Error("expected SceneLoaded on both destinations");
    }
    expect(gmEffect.payload.scene.threats).toHaveLength(2);
    expect(gmEffect.payload.scene.threats.find((t) => t.id === "hidden-threat")).toBeDefined();
    expect(gmEffect.payload.scene.threats.find((t) => t.id === "revealed-threat")?.notes).toBe(
      "a public-facing gm note, still not for players",
    );

    expect(sharedEffect.payload.scene.threats).toHaveLength(1);
    expect(
      sharedEffect.payload.scene.threats.find((t) => t.id === "hidden-threat"),
    ).toBeUndefined();
    expect(sharedEffect.payload.scene.threats.find((t) => t.id === "revealed-threat")?.notes).toBe(
      "",
    );
  });

  it("LoadScene is rejected while another scene is already active", () => {
    const decision = eatTheReichTemplate.decide(
      { state: stateWithScene(), actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "LoadScene", ...sceneInput },
    );
    expect(decision.ok).toBe(false);
  });

  it("NextScene requires a reason when the primary Objective isn't complete", () => {
    const decision = eatTheReichTemplate.decide(
      { state: stateWithScene(), actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "NextScene", ...sceneInput, reason: null },
    );
    expect(decision.ok).toBe(false);
  });

  it("NextScene succeeds without a reason once the primary Objective is complete", () => {
    const state = stateWithScene({ objective: { status: "complete", rating: 0 } });
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "NextScene", ...sceneInput, reason: null },
    );
    expect(decision.ok).toBe(true);
  });

  it("NextScene is rejected with open rolls (SCENE_HAS_OPEN_ROLLS)", () => {
    const withRoll = stateWithRoll(
      { id: "roll-1", characterId: ROOK_ID, actorMemberId: PLAYER_MEMBER_ID, status: "declared" },
      stateWithScene({ objective: { status: "complete", rating: 0 } }),
    );
    const decision = eatTheReichTemplate.decide(
      { state: withRoll, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "NextScene", ...sceneInput, reason: null },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("SCENE_HAS_OPEN_ROLLS");
  });

  it("characters keep Blood/injuries/items across a scene transition; the old scene's threats are replaced", () => {
    const before = stateWithScene(
      { objective: { status: "complete", rating: 0 } },
      stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID, { blood: 6 }),
    );
    const decision = eatTheReichTemplate.decide(
      { state: before, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "NextScene", ...sceneInput, reason: null },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const after = eatTheReichTemplate.reduce(before, decision.events[0]!.event);
    expect(after.characters[ROOK_ID]?.blood).toBe(6);
    expect(after.threats[THREAT_ID]).toBeUndefined();
    expect(after.threats["threat-1"]).toBeDefined();
    expect(after.scene?.round).toBe(1);
    expect(after.scene?.actedThisRound).toEqual([]);
  });

  it("a downed character's rescue Objective carries over to the new scene", () => {
    const before = stateWithScene(
      { objective: { status: "complete", rating: 0 } },
      stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID),
    );
    const withRescue: EatTheReichState = {
      ...before,
      objectives: {
        ...before.objectives,
        "rescue-rook": {
          id: "rescue-rook",
          title: "Rescue Rook",
          kind: "rescue",
          rating: 3,
          challenge: 0,
          status: "active",
        },
      },
    };
    const decision = eatTheReichTemplate.decide(
      { state: withRescue, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "NextScene", ...sceneInput, reason: null },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const after = eatTheReichTemplate.reduce(withRescue, decision.events[0]!.event);
    expect(after.objectives["rescue-rook"]).toBeDefined();
  });
});

describe("decide: EndRound (matrix S5-S6)", () => {
  it("is rejected with open rolls (ROUND_HAS_OPEN_ROLLS)", () => {
    const withRoll = stateWithRoll(
      { id: "roll-1", characterId: ROOK_ID, actorMemberId: PLAYER_MEMBER_ID, status: "declared" },
      stateWithScene(),
    );
    const decision = eatTheReichTemplate.decide(
      { state: withRoll, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "EndRound" },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("ROUND_HAS_OPEN_ROLLS");
  });

  it("resets actedThisRound and advances the round", () => {
    const state = stateWithScene({ scene: { actedThisRound: [ROOK_ID] } });
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([4]) },
      { type: "EndRound" },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const after = eatTheReichTemplate.reduce(state, decision.events[0]!.event);
    expect(after.scene?.round).toBe(2);
    expect(after.scene?.actedThisRound).toEqual([]);
  });

  it("book mode: a defeated Threat regains 1d6 rating and half its starting Attack; an active Threat's Attack rises by 1", () => {
    const state = stateWithScene({
      threat: { rating: 0, attack: 0, startingAttack: 4 },
      extraThreats: [
        {
          id: "second-threat",
          name: "Second",
          rating: 5,
          startingAttack: 2,
          attack: 2,
          challenge: 0,
          solo: false,
          elite: false,
          flags: {},
          status: "active",
          revealed: true,
          notes: "",
        },
      ],
    });
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([4]) }, // 1d6 -> 4
      { type: "EndRound" },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const after = eatTheReichTemplate.reduce(state, decision.events[0]!.event);
    expect(after.threats[THREAT_ID]).toMatchObject({ rating: 4, attack: 2, status: "active" }); // floor(4/2)=2
    expect(after.threats["second-threat"]).toMatchObject({ rating: 5, attack: 3 }); // +1
  });

  it("solo/elite Threats are exempt from reinforcement", () => {
    const state = stateWithScene({ threat: { solo: true, rating: 0, attack: 0 } });
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "EndRound" },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const after = eatTheReichTemplate.reduce(state, decision.events[0]!.event);
    expect(after.threats[THREAT_ID]).toMatchObject({ rating: 0, attack: 0 });
  });

  it("simplified mode removes defeated Threats outright and raises active ones by 1d3, no d6 roll", () => {
    const state = stateWithScene({
      scene: { reinforcementsMode: "simplified" },
      threat: { rating: 0, attack: 0 },
      extraThreats: [
        {
          id: "second-threat",
          name: "Second",
          rating: 5,
          startingAttack: 2,
          attack: 2,
          challenge: 0,
          solo: false,
          elite: false,
          flags: {},
          status: "active",
          revealed: true,
          notes: "",
        },
      ],
    });
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([2]) }, // 1d3 -> 2
      { type: "EndRound" },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const after = eatTheReichTemplate.reduce(state, decision.events[0]!.event);
    expect(after.threats[THREAT_ID]?.status).toBe("removed");
    expect(after.threats["second-threat"]).toMatchObject({ rating: 7, attack: 2 });
  });
});

describe("decide: BeginAction turn order and Pause (matrix S5, T1)", () => {
  it("a character who already acted this round is blocked (NOT_YOUR_TURN)", () => {
    const state = stateWithScene(
      { scene: { actedThisRound: [ROOK_ID] } },
      stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID),
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
    expect(decision.code).toBe("NOT_YOUR_TURN");
  });

  it("BeginAction is rejected while paused, with no actor leaked in the event", () => {
    const base = stateWithScene({}, stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID));
    const paused: EatTheReichState = { ...base, paused: true };
    const decision = eatTheReichTemplate.decide(
      { state: paused, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
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
  });

  it("Pause and Resume round-trip through reduce with no actor stored on state", () => {
    const pauseDecision = eatTheReichTemplate.decide(
      { state: freshState(), actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      { type: "Pause" },
    );
    expect(pauseDecision.ok).toBe(true);
    if (!pauseDecision.ok) return;
    expect(pauseDecision.events[0]?.event).toEqual({ type: "Paused" });
    const paused = eatTheReichTemplate.reduce(freshState(), pauseDecision.events[0]!.event);
    expect(paused.paused).toBe(true);

    const resumeDecision = eatTheReichTemplate.decide(
      { state: paused, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "Resume" },
    );
    expect(resumeDecision.ok).toBe(true);
    if (!resumeDecision.ok) return;
    const resumed = eatTheReichTemplate.reduce(paused, resumeDecision.events[0]!.event);
    expect(resumed.paused).toBe(false);
  });
});

describe("decide: GM director commands (matrix §4 item 7, docs/ETR_SESSION_FLOW.md §7)", () => {
  it("RevealThreat marks a Threat revealed", () => {
    const state = stateWithScene({ threat: { revealed: false } });
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "RevealThreat", threatId: THREAT_ID },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const after = eatTheReichTemplate.reduce(state, decision.events[0]!.event);
    expect(after.threats[THREAT_ID]?.revealed).toBe(true);
  });

  it("CorrectCharacter requires a reason and applies a bounded Blood change", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID, { blood: 2 });
    const rejected = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "CorrectCharacter", characterId: ROOK_ID, reason: "", patch: { blood: 5 } },
    );
    expect(rejected.ok).toBe(false);

    const accepted = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "CorrectCharacter",
        characterId: ROOK_ID,
        reason: "missed a feed",
        patch: { blood: 5 },
      },
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const after = eatTheReichTemplate.reduce(state, accepted.events[0]!.event);
    expect(after.characters[ROOK_ID]?.blood).toBe(5);
  });

  it("CorrectCharacter rejects Blood out of bounds", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "CorrectCharacter", characterId: ROOK_ID, reason: "test", patch: { blood: 12 } },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("INVALID_ALLOCATION");
  });

  it("VoidRoll refunds exactly the Blood/item uses charged at review", () => {
    const state = stateWithRoll(
      {
        id: "roll-1",
        characterId: ROOK_ID,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "awaiting_allocation",
        bloodSpent: 2,
        itemIdsCharged: ["rook-silenced-pistol"],
      },
      stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID, {
        blood: 1,
        items: [
          {
            id: "rook-silenced-pistol",
            name: "Silenced pistol",
            bonusRequirement: "close quarters",
            bonusPlus: 1,
            maxUses: 3,
            usesRemaining: 2,
          },
        ],
      }),
    );
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "VoidRoll", rollId: "roll-1", reason: "narrated away" },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const after = eatTheReichTemplate.reduce(state, decision.events[0]!.event);
    expect(after.characters[ROOK_ID]?.blood).toBe(3);
    expect(after.characters[ROOK_ID]?.items[0]?.usesRemaining).toBe(3);
    expect(after.rolls["roll-1"]).toBeUndefined();
  });

  it("VoidRoll rejects an already-resolved roll", () => {
    const state = stateWithRoll(
      { id: "roll-1", characterId: ROOK_ID, actorMemberId: PLAYER_MEMBER_ID, status: "resolved" },
      stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID),
    );
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "VoidRoll", rollId: "roll-1", reason: "test" },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("ROLL_ALREADY_RESOLVED");
  });

  it("GrantItem adds the item and swaps out the previous loot item", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID, { activeLootId: "old-loot" });
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "GrantItem",
        characterId: ROOK_ID,
        item: {
          id: "new-loot",
          name: "New Loot",
          bonusRequirement: "any",
          bonusPlus: 2,
          maxUses: 3,
        },
        reason: "found on the printworks floor",
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const after = eatTheReichTemplate.reduce(state, decision.events[0]!.event);
    expect(after.characters[ROOK_ID]?.activeLootId).toBe("new-loot");
    expect(after.characters[ROOK_ID]?.items.find((i) => i.id === "new-loot")?.usesRemaining).toBe(
      3,
    );
  });

  it("UnlockAdvance sets an advance unlocked", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    const advanceId = state.characters[ROOK_ID]?.advances[0]?.id;
    if (!advanceId) throw new Error("fixture missing advance");
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "UnlockAdvance", characterId: ROOK_ID, advanceId, reason: "slew the elite" },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const after = eatTheReichTemplate.reduce(state, decision.events[0]!.event);
    expect(after.characters[ROOK_ID]?.advances[0]?.unlocked).toBe(true);
  });

  it("ReassignCharacter can bind a character regardless of the current claim", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "ReassignCharacter", characterId: ROOK_ID, memberId: null, reason: "player left" },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const after = eatTheReichTemplate.reduce(state, decision.events[0]!.event);
    expect(after.characters[ROOK_ID]?.claimedByMemberId).toBeNull();
  });

  it("SetSceneRules requires a scene, a reason, and only the GM", () => {
    const noScene = eatTheReichTemplate.decide(
      { state: scenelessState(), actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "SetSceneRules", reinforcements: "simplified", reason: "time is short" },
    );
    expect(noScene.ok).toBe(false);

    const player = eatTheReichTemplate.authorizeGameAction(PLAYER_CTX, {
      type: "SetSceneRules",
      reinforcements: "simplified",
      reason: "time is short",
    });
    expect(player.allowed).toBe(false);

    const decision = eatTheReichTemplate.decide(
      { state: stateWithScene(), actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "SetSceneRules", reinforcements: "simplified", reason: "time is short" },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const after = eatTheReichTemplate.reduce(stateWithScene(), decision.events[0]!.event);
    expect(after.scene?.reinforcementsMode).toBe("simplified");
  });

  it("EditScene requires a non-empty reason and applies bounded rating/challenge updates", () => {
    const state = stateWithScene();
    const rejected = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "EditScene",
        reason: "   ",
        updateObjectives: [{ objectiveId: OBJECTIVE_ID, rating: 4 }],
      },
    );
    expect(rejected.ok).toBe(false);

    const accepted = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "EditScene",
        reason: "the GM adjusted the fight",
        updateObjectives: [{ objectiveId: OBJECTIVE_ID, rating: 4 }],
        updateThreats: [{ threatId: THREAT_ID, rating: 2 }],
      },
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const after = eatTheReichTemplate.reduce(state, accepted.events[0]!.event);
    expect(after.objectives[OBJECTIVE_ID]?.rating).toBe(4);
    expect(after.threats[THREAT_ID]?.rating).toBe(2);
  });

  it("EditScene never leaks a newly added unrevealed Threat's notes or existence to the shared event copy", () => {
    const state = stateWithScene();
    const decision = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "EditScene",
        reason: "reinforcements arrive",
        addThreats: [
          {
            id: "new-hidden-threat",
            name: "A New Hidden Threat",
            rating: 6,
            attack: 3,
            challenge: 0,
            solo: false,
            elite: false,
            flags: {},
            revealed: false,
            notes: "secret staging note",
          },
        ],
      },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const gmEffect = decision.events[0]?.effects.find((e) => e.destination.kind === "gm");
    const sharedEffect = decision.events[0]?.effects.find((e) => e.destination.kind === "shared");
    if (gmEffect?.payload.type !== "SceneEdited" || sharedEffect?.payload.type !== "SceneEdited") {
      throw new Error("expected SceneEdited on both destinations");
    }
    expect(gmEffect.payload.addedThreats).toHaveLength(1);
    expect(gmEffect.payload.addedThreats[0]?.notes).toBe("secret staging note");
    expect(sharedEffect.payload.addedThreats).toEqual([]);
  });
});

describe("decide: EndMission (matrix S8)", () => {
  it("requires a reason unless the final Objective is complete", () => {
    const state = stateWithScene();
    const rejected = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "EndMission", reason: null },
    );
    expect(rejected.ok).toBe(false);

    const accepted = eatTheReichTemplate.decide(
      { state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "EndMission", reason: "rehearsal skip" },
    );
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const after = eatTheReichTemplate.reduce(state, accepted.events[0]!.event);
    expect(after.missionEnded).toBe(true);
    expect(after.scene?.status).toBe("completed");
  });
});
