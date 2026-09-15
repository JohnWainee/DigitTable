import { describe, expect, it } from "vitest";
import {
  SessionInputError,
  asRoomId,
  idleSessionRequest,
  ownershipFromAccepted,
  parseCreateRoomInput,
  viewerRouteForCapability,
  type RoomAdmissionAccepted,
} from "../src/index.js";

function acceptedFixture(overrides: Partial<RoomAdmissionAccepted> = {}): RoomAdmissionAccepted {
  return {
    ok: true,
    roomId: asRoomId("room-fixture-0001"),
    roomCode: "ABCD-1234",
    memberId: "member-gm",
    capability: "gm",
    recoveryCode: "recovery-secret",
    roomRevision: 0,
    ...overrides,
  };
}

describe("viewerRouteForCapability", () => {
  it("routes each capability to its own screen", () => {
    expect(viewerRouteForCapability("player")).toBe("player");
    expect(viewerRouteForCapability("gm")).toBe("gm");
    expect(viewerRouteForCapability("table")).toBe("table");
  });
});

describe("ownershipFromAccepted", () => {
  it("carries the recovery code through for a newly created seat", () => {
    const ownership = ownershipFromAccepted(acceptedFixture());
    expect(ownership.recoveryCode).toBe("recovery-secret");
    expect(ownership.capability).toBe("gm");
  });

  it("carries a null recovery code for a reclaim (never re-mints one)", () => {
    const ownership = ownershipFromAccepted(acceptedFixture({ recoveryCode: null }));
    expect(ownership.recoveryCode).toBeNull();
  });
});

describe("idleSessionRequest", () => {
  it("starts idle", () => {
    expect(idleSessionRequest()).toEqual({ status: "idle" });
  });
});

describe("parseCreateRoomInput", () => {
  const valid = {
    requestId: "request-00000001",
    sessionName: "Paris Cell",
    passphrase: "correct-horse",
    creatorDisplayName: "Rook",
  };

  it("accepts a well-formed payload", () => {
    expect(parseCreateRoomInput(valid)).toEqual(valid);
  });

  it("rejects a non-object payload", () => {
    expect(() => parseCreateRoomInput("nope")).toThrow(SessionInputError);
  });

  it("rejects a request ID that is too short", () => {
    expect(() => parseCreateRoomInput({ ...valid, requestId: "short" })).toThrow(SessionInputError);
  });

  it("rejects a session name over the length bound", () => {
    expect(() => parseCreateRoomInput({ ...valid, sessionName: "x".repeat(61) })).toThrow(
      SessionInputError,
    );
  });

  it("rejects an empty session name", () => {
    expect(() => parseCreateRoomInput({ ...valid, sessionName: "" })).toThrow(SessionInputError);
  });

  it("rejects a passphrase under the minimum length", () => {
    expect(() => parseCreateRoomInput({ ...valid, passphrase: "abc" })).toThrow(SessionInputError);
  });

  it("rejects a display name with no visible character", () => {
    expect(() => parseCreateRoomInput({ ...valid, creatorDisplayName: "   " })).toThrow(
      SessionInputError,
    );
  });

  it("rejects a missing field rather than defaulting it", () => {
    const { sessionName: _omit, ...missingSessionName } = valid;
    expect(() => parseCreateRoomInput(missingSessionName)).toThrow(SessionInputError);
  });
});
