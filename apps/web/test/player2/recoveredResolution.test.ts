import { describe, expect, it } from "vitest";
import type { EatTheReichEvent } from "@digitable/template-eat-the-reich";
import type { PresentationItem } from "../../src/session/useRoomProjection.js";
import { selectOwnResolution } from "../../src/session/presentationQueue.js";

type ActionResolved = Extract<EatTheReichEvent, { type: "ActionResolved" }>;

const resolved: ActionResolved = {
  type: "ActionResolved",
  rollId: "roll-rook-1",
  characterId: "rook",
  allocations: [],
  objectiveDeltas: [],
  threatDeltas: [],
  bloodDelta: 0,
  itemRestoreDeltas: [],
  injuryClearedCount: 0,
  remainingAttackSuccessesAfterAllocation: 0,
  attackBumpThreatId: null,
  injuryMark: null,
  injuryChoicePendingMode: null,
};

function queued(event: EatTheReichEvent, eventId: string, sequence: number): PresentationItem {
  return {
    eventId,
    commandId: `cmd-${eventId}`,
    sequence,
    roomRevision: sequence,
    payload: event,
    partitions: ["shared"],
    attackSuccessesRolled: 3,
  };
}

describe("recovered action resolution selection", () => {
  it("matches the server-authored character after the resolved roll has left the projection", () => {
    const selection = selectOwnResolution([queued(resolved, "event-1", 8)], "rook");
    expect(selection?.event).toEqual(resolved);
    expect(selection?.attackSuccessesRolled).toBe(3);
    expect(selection?.eventIds).toEqual(["event-1"]);
  });

  it("does not present another character's resolution", () => {
    const queue = [queued(resolved, "event-1", 8)];
    expect(selectOwnResolution(queue, "vesper")).toBeNull();
  });

  it("does not return a dismissed (acknowledged, now absent) resolution", () => {
    expect(selectOwnResolution([], "rook")).toBeNull();
  });
});
