import { ACTION_ID, GEAR_SILENCED_TOOL, THREAT_ID } from "@digitable/template-eat-the-reich";
import { describe, expect, it } from "vitest";
import {
  InMemoryRoomRepository,
  PLAYER_MEMBER_ID,
} from "../../src/repository/InMemoryRoomRepository.js";

describe("InMemoryRoomRepository", () => {
  it("starts with the placeholder character bound to the local player seat and no active roll", () => {
    const repository = new InMemoryRoomRepository();
    const projection = repository.getPlayerProjection();
    expect(projection.view.self?.memberId).toBe(PLAYER_MEMBER_ID);
    expect(projection.view.activeRoll).toBeNull();
  });

  it("runs BeginAction through the real template pipeline and reaches awaiting_opposition", () => {
    const repository = new InMemoryRoomRepository();
    const result = repository.beginAction(THREAT_ID, ACTION_ID, [GEAR_SILENCED_TOOL]);
    expect(result.ok).toBe(true);
    expect(result.sharedEvents.some((event) => event.type === "ActionRolled")).toBe(true);

    const projection = repository.getPlayerProjection();
    expect(projection.view.activeRoll?.status).toBe("awaiting_opposition");
  });

  it("never leaks the hidden difficulty modifier into the player's own projection", () => {
    const repository = new InMemoryRoomRepository();
    repository.beginAction(THREAT_ID, ACTION_ID, []);
    const projection = repository.getPlayerProjection();
    expect(projection.view.activeRoll).not.toHaveProperty("hiddenDifficultyModifier");
    const threat = projection.view.threats.find((candidate) => candidate.id === THREAT_ID);
    expect(threat).not.toHaveProperty("hiddenDifficultyModifier");
    expect(threat).not.toHaveProperty("hiddenIntel");
  });

  it("resolves the full opposed action end to end via the local GM stand-in", () => {
    const repository = new InMemoryRoomRepository();
    const begin = repository.beginAction(THREAT_ID, ACTION_ID, [GEAR_SILENCED_TOOL]);
    expect(begin.ok).toBe(true);
    const rolled = begin.sharedEvents.find((event) => event.type === "ActionRolled");
    if (!rolled || rolled.type !== "ActionRolled") throw new Error("expected ActionRolled");

    const opposition = repository.simulateOpposition(rolled.rollId);
    expect(opposition.ok).toBe(true);

    const afterOpposition = repository.getPlayerProjection();
    const activeRoll = afterOpposition.view.activeRoll;
    expect(activeRoll?.status).toBe("awaiting_allocation");
    const netSuccesses = activeRoll?.netSuccesses ?? 0;

    const options = repository.validAllocations({
      rollId: rolled.rollId,
      status: "awaiting_allocation",
      netSuccesses,
    });

    const allocations =
      netSuccesses > 0 && options.length > 0
        ? [{ optionId: options[0]!.id, uses: Math.min(1, options[0]!.maxUses) }]
        : [];

    const resolve = repository.allocateResults(rolled.rollId, allocations);
    expect(resolve.ok).toBe(true);
    expect(resolve.sharedEvents.some((event) => event.type === "ActionResolved")).toBe(true);

    const finalProjection = repository.getPlayerProjection();
    expect(finalProjection.view.activeRoll).toBeNull();
  });

  it("rejects an unknown allocation option instead of silently ignoring it", () => {
    const repository = new InMemoryRoomRepository();
    const begin = repository.beginAction(THREAT_ID, ACTION_ID, []);
    const rolled = begin.sharedEvents.find((event) => event.type === "ActionRolled");
    if (!rolled || rolled.type !== "ActionRolled") throw new Error("expected ActionRolled");
    repository.simulateOpposition(rolled.rollId);

    const result = repository.allocateResults(rolled.rollId, [
      { optionId: "not-a-real-option", uses: 1 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INVALID_ALLOCATION");
  });

  it("notifies subscribers on every accepted command", () => {
    const repository = new InMemoryRoomRepository();
    let notifications = 0;
    const unsubscribe = repository.subscribe(() => {
      notifications += 1;
    });
    repository.beginAction(THREAT_ID, ACTION_ID, []);
    expect(notifications).toBe(1);
    unsubscribe();
    repository.reset();
    expect(notifications).toBe(1);
  });

  it("reset() returns to a fresh initial state", () => {
    const repository = new InMemoryRoomRepository();
    repository.beginAction(THREAT_ID, ACTION_ID, []);
    expect(repository.getPlayerProjection().view.activeRoll).not.toBeNull();
    repository.reset();
    expect(repository.getPlayerProjection().view.activeRoll).toBeNull();
  });
});
