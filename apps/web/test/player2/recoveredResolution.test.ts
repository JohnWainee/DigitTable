import { describe, expect, it } from "vitest";
import { asCommandId, type RoomCommandResult } from "@digitable/contracts";
import type { EatTheReichEvent } from "@digitable/template-eat-the-reich";
import { findRecoveredActionResolution } from "../../src/player2/PlayerDashboardScreen.js";

const resolved: Extract<EatTheReichEvent, { type: "ActionResolved" }> = {
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

function recovered(
  events: readonly EatTheReichEvent[] = [resolved],
): RoomCommandResult<EatTheReichEvent> {
  return {
    status: "accepted",
    commandId: asCommandId("11111111-1111-4111-8111-111111111111"),
    roomRevision: 8,
    sharedEvents: events,
  };
}

describe("recovered action resolution", () => {
  it("matches the server-authored character after the resolved roll has left the projection", () => {
    expect(findRecoveredActionResolution(recovered(), "rook", null)).toEqual(resolved);
  });

  it("does not present another character's or an already dismissed resolution", () => {
    const result = recovered();
    expect(findRecoveredActionResolution(result, "vesper", null)).toBeUndefined();
    expect(findRecoveredActionResolution(result, "rook", result.commandId)).toBeUndefined();
  });
});
