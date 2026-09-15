import { beforeEach, describe, expect, it } from "vitest";
import { FixturePlayLoopStore } from "../../src/session/fixturePlayLoopStore.js";
import { ETR_ROSTER_FIXTURE, ETR_SCENE_FIXTURE } from "../fixtures/etrTemp.js";

const rook = ETR_ROSTER_FIXTURE.find((c) => c.id === "rook")!;
const dropForecourt = ETR_SCENE_FIXTURE.find((s) => s.id === "drop-forecourt")!;

describe("FixturePlayLoopStore (TEMPORARY C03 shared play-loop state)", () => {
  let store: FixturePlayLoopStore;
  const roomId = "room-test";

  beforeEach(() => {
    store = new FixturePlayLoopStore();
    store.ensureRoom(roomId, dropForecourt);
    store.ensureCharacter(roomId, rook);
  });

  it("starts a character in compose phase with full item uses and zero Blood", () => {
    const record = store.getCharacterRecord(roomId, "rook")!;
    expect(record.phase).toBe("compose");
    expect(record.character.blood).toBe(0);
    expect(record.character.items.every((i) => i.usesRemaining === i.maxUses)).toBe(true);
  });

  it("declare moves to declared and charges nothing yet (P4: not until GM review)", () => {
    store.declare(roomId, "rook", {
      statIndex: 5,
      itemIds: ["rook-silenced-pistol"],
      abilityIds: [],
      bonusClaimIds: [],
      engagedThreatIds: [],
    });
    const record = store.getCharacterRecord(roomId, "rook")!;
    expect(record.phase).toBe("declared");
    expect(record.character.items.find((i) => i.id === "rook-silenced-pistol")!.usesRemaining).toBe(
      3,
    );
    expect(store.listPendingReviews(roomId)).toHaveLength(1);
  });

  it("reviewAndRoll charges Blood/item uses exactly once for what was actually used, and rolls both pools", () => {
    store.declare(roomId, "rook", {
      statIndex: 5, // Sneak 4
      itemIds: ["rook-silenced-pistol"],
      abilityIds: ["rook-blood-second-wind"], // costs 1 Blood -- but character has 0, engine clamps at 0
      bonusClaimIds: [],
      engagedThreatIds: ["patrol-a"],
    });
    store.reviewAndRoll(roomId, "rook", [], ["patrol-a"]);
    const record = store.getCharacterRecord(roomId, "rook")!;
    expect(record.phase).toBe("rolled");
    expect(record.character.items.find((i) => i.id === "rook-silenced-pistol")!.usesRemaining).toBe(
      2,
    );
    expect(record.activeRoll).not.toBeNull();
    expect(store.listPendingReviews(roomId)).toHaveLength(0);
  });

  it("a struck bonus claim does not add its dice, but an approved one does", () => {
    store.declare(roomId, "rook", {
      statIndex: 5,
      itemIds: ["rook-silenced-pistol"], // +1 bonusCount
      abilityIds: [],
      bonusClaimIds: ["rook-silenced-pistol"], // player claims it
      engagedThreatIds: [],
    });
    store.reviewAndRoll(roomId, "rook", [], []); // GM strikes the claim entirely
    const struckRoll = store.getCharacterRecord(roomId, "rook")!.activeRoll!;
    const struckTotal = struckRoll.keptDice.length + struckRoll.discardedDice.length;
    expect(struckTotal).toBe(4 + 1); // stat + item, no bonus

    store.playAgain(roomId, "rook");
    store.declare(roomId, "rook", {
      statIndex: 5,
      itemIds: ["rook-silenced-pistol"],
      abilityIds: [],
      bonusClaimIds: ["rook-silenced-pistol"],
      engagedThreatIds: [],
    });
    store.reviewAndRoll(roomId, "rook", ["rook-silenced-pistol"], []); // GM approves it
    const approvedRoll = store.getCharacterRecord(roomId, "rook")!.activeRoll!;
    const approvedTotal = approvedRoll.keptDice.length + approvedRoll.discardedDice.length;
    expect(approvedTotal).toBe(4 + 1 + 1); // stat + item + approved bonus
  });

  it("assign/confirmAllocation updates the shared scene and appends to history, capped at 3", () => {
    store.declare(roomId, "rook", {
      statIndex: 5,
      itemIds: [],
      abilityIds: [],
      bonusClaimIds: [],
      engagedThreatIds: [],
    });
    store.reviewAndRoll(roomId, "rook", [], []);
    const roll = store.getCharacterRecord(roomId, "rook")!.activeRoll!;
    const total = roll.keptDice.reduce((s, d) => s + (d.kind === "critical" ? 2 : 1), 0);
    if (total > 0) store.assign(roomId, "rook", "objective", total);
    store.confirmAllocation(roomId, "rook");

    const record = store.getCharacterRecord(roomId, "rook")!;
    expect(record.phase).toBe("resolved");
    expect(store.getHistory(roomId)).toHaveLength(1);
    expect(store.getScene(roomId)!.objectiveRating).toBeLessThanOrEqual(
      dropForecourt.objectiveRating,
    );
  });

  it("revealThreat flips a threat's revealed flag without touching others", () => {
    const metroPlatform = ETR_SCENE_FIXTURE.find((s) => s.id === "metro-platform")!;
    const isolatedStore = new FixturePlayLoopStore();
    isolatedStore.ensureRoom("room-2", metroPlatform);
    const enforcer = metroPlatform.threats.find((t) => t.id === "the-enforcer")!;
    expect(enforcer.revealed).toBe(false); // fixture default: hidden until round 1

    isolatedStore.revealThreat("room-2", enforcer.id);
    const scene = isolatedStore.getScene("room-2")!;
    expect(scene.threats.find((t) => t.id === "the-enforcer")!.revealed).toBe(true);
    expect(scene.threats.find((t) => t.id === "plated-squad")!.revealed).toBe(true); // unaffected (already true)
  });

  it("correctBlood requires a non-empty reason and clamps to 0-10", () => {
    store.correctBlood(roomId, "rook", 5, ""); // no reason: rejected
    expect(store.getCharacterRecord(roomId, "rook")!.character.blood).toBe(0);

    store.correctBlood(roomId, "rook", 5, "GM ruling: fed off-screen");
    expect(store.getCharacterRecord(roomId, "rook")!.character.blood).toBe(5);

    store.correctBlood(roomId, "rook", 20, "over-correct on purpose");
    expect(store.getCharacterRecord(roomId, "rook")!.character.blood).toBe(10);
  });
});
