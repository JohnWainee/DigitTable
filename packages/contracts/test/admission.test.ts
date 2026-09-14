import { describe, expect, it } from "vitest";
import {
  parseAdmitMemberInput,
  parseClaimSeatInput,
  stableError,
  type AdmissionCommand,
} from "../src/index.js";

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

describe("parseAdmitMemberInput", () => {
  const valid = {
    roomCode: "ABCD-1234",
    passphrase: "correct horse",
    requestedCapability: "player",
    displayName: "Rook",
  };

  it("accepts a well-formed player request", () => {
    expect(parseAdmitMemberInput(valid)).toEqual(valid);
  });

  it("accepts a well-formed table request", () => {
    const input = { ...valid, requestedCapability: "table" };
    expect(parseAdmitMemberInput(input)).toEqual(input);
  });

  it('privilege escalation: rejects a requested capability of "gm" even though the field is a plain string', () => {
    expect(() => parseAdmitMemberInput({ ...valid, requestedCapability: "gm" })).toThrow();
  });

  it("rejects an unrecognized capability string", () => {
    expect(() => parseAdmitMemberInput({ ...valid, requestedCapability: "referee" })).toThrow();
  });

  it("rejects a non-object payload", () => {
    expect(() => parseAdmitMemberInput("not an object")).toThrow();
    expect(() => parseAdmitMemberInput(null)).toThrow();
  });

  it("rejects an oversized room code, passphrase, or display name", () => {
    expect(() => parseAdmitMemberInput({ ...valid, roomCode: "x".repeat(100) })).toThrow();
    expect(() => parseAdmitMemberInput({ ...valid, passphrase: "x".repeat(1000) })).toThrow();
    expect(() => parseAdmitMemberInput({ ...valid, displayName: "x".repeat(100) })).toThrow();
  });

  it("rejects a too-short room code or passphrase", () => {
    expect(() => parseAdmitMemberInput({ ...valid, roomCode: "ab" })).toThrow();
    expect(() => parseAdmitMemberInput({ ...valid, passphrase: "ab" })).toThrow();
  });

  it("rejects non-string fields even when otherwise well-shaped", () => {
    expect(() => parseAdmitMemberInput({ ...valid, roomCode: 1234 })).toThrow();
    expect(() => parseAdmitMemberInput({ ...valid, displayName: ["Rook"] })).toThrow();
  });
});

describe("parseClaimSeatInput", () => {
  const valid = { roomCode: "ABCD-1234", passphrase: "correct horse", displayName: "Director" };

  it("accepts a well-formed claim request", () => {
    expect(parseClaimSeatInput(valid)).toEqual(valid);
  });

  it("never accepts a requestedCapability field at all — GM claim has no capability choice", () => {
    const parsed = parseClaimSeatInput({ ...valid, requestedCapability: "gm" });
    expect(parsed).not.toHaveProperty("requestedCapability");
  });

  it("rejects a non-object payload", () => {
    expect(() => parseClaimSeatInput(42)).toThrow();
  });

  it("rejects a missing passphrase", () => {
    const { passphrase: _passphrase, ...withoutPassphrase } = valid;
    expect(() => parseClaimSeatInput(withoutPassphrase)).toThrow();
  });
});
