import { describe, expect, it } from "vitest";
import { asRoomId } from "@digitable/contracts";
import { resumeRoute } from "../../src/landing/resumeRoute.js";
import type { LocalOwnershipRecord } from "../../src/session/ownership.js";

function record(capability: LocalOwnershipRecord["capability"]): LocalOwnershipRecord {
  return {
    roomId: asRoomId("room-1"),
    roomCode: "ABC234",
    memberId: "member-1",
    capability,
    recoveryCode: null,
    displayName: "Nadia",
    sessionName: "Rooftop Drop",
  };
}

describe("resumeRoute", () => {
  it("sends a GM to the director console and the table seat to the table display", () => {
    expect(resumeRoute(record("gm"))).toBe("/room/room-1/gm");
    expect(resumeRoute(record("table"))).toBe("/room/room-1/table");
  });

  it("sends a player to the dashboard, which itself sends an unclaimed player on to the picker", () => {
    expect(resumeRoute(record("player"))).toBe("/room/room-1/player");
  });
});
