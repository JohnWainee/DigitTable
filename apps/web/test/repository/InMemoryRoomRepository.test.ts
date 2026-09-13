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

  it("resolves the full opposed action end to end via the GM's submitOpposition command", () => {
    const repository = new InMemoryRoomRepository();
    const begin = repository.beginAction(THREAT_ID, ACTION_ID, [GEAR_SILENCED_TOOL]);
    expect(begin.ok).toBe(true);
    const rolled = begin.sharedEvents.find((event) => event.type === "ActionRolled");
    if (!rolled || rolled.type !== "ActionRolled") throw new Error("expected ActionRolled");

    const opposition = repository.submitOpposition(rolled.rollId, 0);
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
    repository.submitOpposition(rolled.rollId, 0);

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

  describe("GM and table surfaces (Phase 1C)", () => {
    it("gives the GM projection full threat detail and the table projection none", () => {
      const repository = new InMemoryRoomRepository();
      const gmThreat = repository
        .getGmProjection()
        .view.threats.find((candidate) => candidate.id === THREAT_ID);
      expect(gmThreat).toHaveProperty("hiddenDifficultyModifier");
      expect(gmThreat).toHaveProperty("hiddenIntel");

      const tableThreat = repository
        .getTableProjection()
        .view.threats.find((candidate) => candidate.id === THREAT_ID);
      expect(tableThreat).not.toHaveProperty("hiddenDifficultyModifier");
      expect(tableThreat).not.toHaveProperty("hiddenIntel");
    });

    it("never binds a character to the GM or table viewer", () => {
      const repository = new InMemoryRoomRepository();
      expect(repository.getGmProjection().view.self).toBeNull();
      expect(repository.getTableProjection().view.self).toBeNull();
    });

    it("reveals the un-redacted player faces and hidden modifier to the GM once a hidden adjustment applies", () => {
      const repository = new InMemoryRoomRepository();
      repository.beginAction(THREAT_ID, ACTION_ID, []);

      const gmRoll = repository.getGmProjection().view.activeRoll;
      expect(gmRoll?.playerFaces).not.toBeNull();
      expect(typeof gmRoll?.hiddenDifficultyModifier).toBe("number");

      const tableRoll = repository.getTableProjection().view.activeRoll;
      expect(tableRoll).not.toHaveProperty("hiddenDifficultyModifier");
    });

    it("resolves the full opposed action across player and GM dispatch calls on one shared room", () => {
      const repository = new InMemoryRoomRepository();
      const begin = repository.beginAction(THREAT_ID, ACTION_ID, []);
      const rolled = begin.sharedEvents.find((event) => event.type === "ActionRolled");
      if (!rolled || rolled.type !== "ActionRolled") throw new Error("expected ActionRolled");

      expect(repository.getGmProjection().view.activeRoll?.status).toBe("awaiting_opposition");
      expect(repository.getTableProjection().view.activeRoll?.status).toBe("awaiting_opposition");

      const opposition = repository.submitOpposition(rolled.rollId, 1);
      expect(opposition.ok).toBe(true);

      expect(repository.getPlayerProjection().view.activeRoll?.status).toBe("awaiting_allocation");
      expect(repository.getTableProjection().view.activeRoll?.status).toBe("awaiting_allocation");
    });

    it("rejects push dice outside the template's valid range, surfaced through the GM dispatch result", () => {
      const repository = new InMemoryRoomRepository();
      const begin = repository.beginAction(THREAT_ID, ACTION_ID, []);
      const rolled = begin.sharedEvents.find((event) => event.type === "ActionRolled");
      if (!rolled || rolled.type !== "ActionRolled") throw new Error("expected ActionRolled");

      const result = repository.submitOpposition(rolled.rollId, 99);
      expect(result.ok).toBe(false);
      expect(result.code).toBe("INVALID_ALLOCATION");
    });

    it("rejects a command attributed to the table capability through the same dispatch path", () => {
      const repository = new InMemoryRoomRepository();
      const result = repository.attemptCommandAsTable({
        type: "SubmitOpposition",
        rollId: "roll-1",
        pushDice: 0,
      });
      expect(result.ok).toBe(false);
      expect(result.code).toBe("ROLE_FORBIDDEN");
    });

    it("broadcasts a dispatch failure to error subscribers regardless of which role attempted it", () => {
      const repository = new InMemoryRoomRepository();
      const failures: { capability: string; code?: string }[] = [];
      repository.subscribeToErrors((failure) => failures.push(failure));

      repository.attemptCommandAsTable({ type: "SubmitOpposition", rollId: "roll-1", pushDice: 0 });

      expect(failures).toHaveLength(1);
      expect(failures[0]?.capability).toBe("table");
      expect(failures[0]?.code).toBe("ROLE_FORBIDDEN");
    });

    it("reflects the current committed state for a surface mounted mid-flow, not a stale snapshot", () => {
      const repository = new InMemoryRoomRepository();
      repository.beginAction(THREAT_ID, ACTION_ID, []);

      // Simulates a GM/table surface mounting after the player has already begun an action:
      // getGmProjection()/getTableProjection() always read the live authority, never a cached
      // value from construction time.
      expect(repository.getGmProjection().view.activeRoll?.status).toBe("awaiting_opposition");
      expect(repository.getTableProjection().view.activeRoll?.status).toBe("awaiting_opposition");
    });
  });
});
