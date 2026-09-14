import {
  asCommandId,
  type CommandId,
  type RoomRepository,
  type ViewerContext,
} from "@digitable/contracts";
import { ACTION_ID, GEAR_SILENCED_TOOL, THREAT_ID } from "@digitable/template-eat-the-reich";
import { describe, expect, it } from "vitest";
import {
  InMemoryRoomRepository,
  PLAYER_MEMBER_ID,
  ROOM_ID,
} from "../../src/repository/InMemoryRoomRepository.js";

const PLAYER_VIEWER: ViewerContext = {
  roomId: ROOM_ID,
  viewerId: PLAYER_MEMBER_ID,
  capability: "player",
};

function newCommandId(): CommandId {
  return asCommandId(globalThis.crypto.randomUUID());
}

describe("InMemoryRoomRepository", () => {
  it("starts with the placeholder character bound to the local player seat and no active roll", () => {
    const repository = new InMemoryRoomRepository();
    const projection = repository.getPlayerProjection();
    expect(projection.view.self?.memberId).toBe(PLAYER_MEMBER_ID);
    expect(projection.view.activeRoll).toBeNull();
  });

  it("runs BeginAction through the real template pipeline and reaches awaiting_opposition", async () => {
    const repository = new InMemoryRoomRepository();
    const result = await repository.beginAction(newCommandId(), THREAT_ID, ACTION_ID, [
      GEAR_SILENCED_TOOL,
    ]);
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected acceptance");
    expect(result.sharedEvents.some((event) => event.type === "ActionRolled")).toBe(true);

    const projection = repository.getPlayerProjection();
    expect(projection.view.activeRoll?.status).toBe("awaiting_opposition");
  });

  it("never leaks the hidden difficulty modifier into the player's own projection", async () => {
    const repository = new InMemoryRoomRepository();
    await repository.beginAction(newCommandId(), THREAT_ID, ACTION_ID, []);
    const projection = repository.getPlayerProjection();
    expect(projection.view.activeRoll).not.toHaveProperty("hiddenDifficultyModifier");
    const threat = projection.view.threats.find((candidate) => candidate.id === THREAT_ID);
    expect(threat).not.toHaveProperty("hiddenDifficultyModifier");
    expect(threat).not.toHaveProperty("hiddenIntel");
  });

  it("resolves the full opposed action end to end via the GM's submitOpposition command", async () => {
    const repository = new InMemoryRoomRepository();
    const begin = await repository.beginAction(newCommandId(), THREAT_ID, ACTION_ID, [
      GEAR_SILENCED_TOOL,
    ]);
    expect(begin.status).toBe("accepted");
    if (begin.status !== "accepted") throw new Error("expected acceptance");
    const rolled = begin.sharedEvents.find((event) => event.type === "ActionRolled");
    if (!rolled || rolled.type !== "ActionRolled") throw new Error("expected ActionRolled");

    const opposition = await repository.submitOpposition(newCommandId(), rolled.rollId, 0);
    expect(opposition.status).toBe("accepted");

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

    const resolve = await repository.allocateResults(newCommandId(), rolled.rollId, allocations);
    expect(resolve.status).toBe("accepted");
    if (resolve.status !== "accepted") throw new Error("expected acceptance");
    expect(resolve.sharedEvents.some((event) => event.type === "ActionResolved")).toBe(true);

    const finalProjection = repository.getPlayerProjection();
    expect(finalProjection.view.activeRoll).toBeNull();
  });

  it("rejects an unknown allocation option instead of silently ignoring it", async () => {
    const repository = new InMemoryRoomRepository();
    const begin = await repository.beginAction(newCommandId(), THREAT_ID, ACTION_ID, []);
    if (begin.status !== "accepted") throw new Error("expected acceptance");
    const rolled = begin.sharedEvents.find((event) => event.type === "ActionRolled");
    if (!rolled || rolled.type !== "ActionRolled") throw new Error("expected ActionRolled");
    await repository.submitOpposition(newCommandId(), rolled.rollId, 0);

    const result = await repository.allocateResults(newCommandId(), rolled.rollId, [
      { optionId: "not-a-real-option", uses: 1 },
    ]);
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("expected rejection");
    expect(result.code).toBe("INVALID_ALLOCATION");
  });

  it("notifies subscribers on every accepted command", async () => {
    const repository = new InMemoryRoomRepository();
    let notifications = 0;
    const unsubscribe = repository.subscribe(() => {
      notifications += 1;
    });
    await repository.beginAction(newCommandId(), THREAT_ID, ACTION_ID, []);
    expect(notifications).toBe(1);
    unsubscribe();
    repository.reset();
    expect(notifications).toBe(1);
  });

  it("reset() returns to a fresh initial state", async () => {
    const repository = new InMemoryRoomRepository();
    await repository.beginAction(newCommandId(), THREAT_ID, ACTION_ID, []);
    expect(repository.getPlayerProjection().view.activeRoll).not.toBeNull();
    repository.reset();
    expect(repository.getPlayerProjection().view.activeRoll).toBeNull();
  });

  describe("commandId is a caller-supplied outbox concern (Phase 2 preflight review, finding P1)", () => {
    it("retrying the same commandId after acceptance returns the original result without re-deciding", async () => {
      const repository = new InMemoryRoomRepository();
      const commandId = newCommandId();
      const first = await repository.beginAction(commandId, THREAT_ID, ACTION_ID, []);
      expect(first.status).toBe("accepted");
      if (first.status !== "accepted") throw new Error("expected acceptance");

      const projectionAfterFirst = repository.getPlayerProjection();

      const retry = await repository.beginAction(commandId, THREAT_ID, ACTION_ID, []);
      expect(retry.status).toBe("accepted");
      expect(retry.commandId).toBe(first.commandId);
      if (retry.status !== "accepted") throw new Error("expected acceptance");
      expect(retry.roomRevision).toBe(first.roomRevision);
      // `runCommand`'s `priorReceipt` short-circuit (packages/engine/src/runCommand.ts)
      // does not re-emit event envelopes on retry — `AcceptedCommandReceipt` records only
      // the accepted sequence numbers, not the event payloads — so a resubmission's
      // `sharedEvents` is empty rather than a duplicate of the original. Reconstructing a
      // retry's events from storage is Phase 2 PR 7's (client reconnect/outbox) job.
      expect(retry.sharedEvents).toEqual([]);
      // The important guarantee: no second decision was made and no further randomness was
      // drawn, so the room's revision (and therefore its projection) is unchanged by the retry.
      expect(repository.getPlayerProjection()).toStrictEqual(projectionAfterFirst);
    });

    it("two different commandIds are treated as two independent commands", async () => {
      const repository = new InMemoryRoomRepository();
      const begin = await repository.beginAction(newCommandId(), THREAT_ID, ACTION_ID, []);
      if (begin.status !== "accepted") throw new Error("expected acceptance");
      const rolled = begin.sharedEvents.find((event) => event.type === "ActionRolled");
      if (!rolled || rolled.type !== "ActionRolled") throw new Error("expected ActionRolled");

      const first = await repository.submitOpposition(newCommandId(), rolled.rollId, 0);
      const second = await repository.submitOpposition(newCommandId(), rolled.rollId, 0);
      expect(first.status).toBe("accepted");
      // The roll is already resolved-for-opposition by the first command, so a second,
      // distinctly-commandId'd submission is rejected rather than silently replayed.
      expect(second.status).toBe("rejected");
    });
  });

  describe("RoomRepository contract conformance (Phase 2 PR 1, finding P8)", () => {
    // Typechecked structurally: InMemoryRoomRepository must satisfy the shared
    // interface a future FirebaseRoomRepository will also implement.
    function asRoomRepository(
      repository: InMemoryRoomRepository,
    ): RoomRepository<
      Parameters<InMemoryRoomRepository["attemptCommandAsTable"]>[1],
      unknown,
      unknown
    > {
      return repository;
    }

    it("dispatch() honors a caller-supplied commandId and returns the accepted/rejected shape", async () => {
      const repository = asRoomRepository(new InMemoryRoomRepository());
      const commandId = newCommandId();

      const result = await repository.dispatch(PLAYER_MEMBER_ID, {
        commandId,
        payload: {
          type: "BeginAction",
          actorMemberId: PLAYER_MEMBER_ID,
          threatId: THREAT_ID,
          actionId: ACTION_ID,
          gearIds: [],
        },
      });

      expect(result.commandId).toBe(commandId);
      expect(result.status).toBe("accepted");
    });

    it("getProjection() and subscribeToProjection() serve the same viewer-scoped projections the convenience getters do", async () => {
      const inMemory = new InMemoryRoomRepository();
      const repository = asRoomRepository(inMemory);

      const updates: unknown[] = [];
      const unsubscribe = repository.subscribeToProjection(PLAYER_VIEWER, (projection) =>
        updates.push(projection),
      );

      const fetched = await repository.getProjection(PLAYER_VIEWER);
      expect(fetched).toStrictEqual(inMemory.getPlayerProjection());

      await repository.dispatch(PLAYER_MEMBER_ID, {
        commandId: newCommandId(),
        payload: {
          type: "BeginAction",
          actorMemberId: PLAYER_MEMBER_ID,
          threatId: THREAT_ID,
          actionId: ACTION_ID,
          gearIds: [],
        },
      });

      expect(updates).toHaveLength(1);
      expect(updates[0]).toStrictEqual(inMemory.getPlayerProjection());
      unsubscribe();
    });
  });
});
