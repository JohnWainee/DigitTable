import { describe, expect, it } from "vitest";
import { type AdmissionCommand, stableError } from "../src/index.js";

describe("admission contracts", () => {
  it("does not let an admission payload assert a room or stable member identity", () => {
    const command: AdmissionCommand = {
      type: "AdmitMember",
      input: {
        roomCode: "ABCD-1234",
        passphrase: "private phrase",
        requestedCapability: "player",
        displayName: "Rook",
      },
    };
    expect(command.input).not.toHaveProperty("roomId");
    expect(command.input).not.toHaveProperty("memberId");
  });

  it("exposes admission-specific failures without overloading role errors", () => {
    expect(stableError("ROOM_FULL", "The room has no open seats.").code).toBe("ROOM_FULL");
    expect(stableError("ADMISSION_CLOSED", "Admission is closed.").code).toBe("ADMISSION_CLOSED");
  });
});
