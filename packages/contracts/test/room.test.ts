import { describe, expect, it } from "vitest";
import {
  asCommandId,
  asMemberId,
  MAX_SECRET_ITERATIONS,
  parseAdmissionThrottleDocument,
  parseAuthorityAdmissionFields,
  parseHashedSecretDocument,
  parseRoomCodeDocument,
  parseUidBindingDocument,
  receiptIdFor,
  RoomDataError,
} from "../src/index.js";

describe("room persistence contracts", () => {
  it("uses the architecture's memberId_commandId receipt identifier", () => {
    expect(receiptIdFor(asMemberId("member-rook"), asCommandId("command-uuid"))).toBe(
      "member-rook_command-uuid",
    );
  });
});

const validAuthority = {
  roomStatus: "active",
  admissionStatus: "open",
  participantCount: 3,
  tableSeatClaimed: false,
  gmMemberId: "member-gm",
};

/**
 * Phase 2 PR 3 review finding 3: persisted documents are runtime-validated
 * and fail closed. Every malformed or missing field below must throw rather
 * than be read as the permissive value (active/open/0/false/"no binding"/
 * "valid secret"/"fresh window") a defensive default would produce.
 */
describe("parseAuthorityAdmissionFields (fails closed)", () => {
  it("accepts a well-formed document with a seated GM or an explicitly open (null) GM seat", () => {
    expect(parseAuthorityAdmissionFields(validAuthority)).toEqual({
      ...validAuthority,
      gmMemberId: asMemberId("member-gm"),
    });
    expect(
      parseAuthorityAdmissionFields({ ...validAuthority, gmMemberId: null }).gmMemberId,
    ).toBeNull();
  });

  it("an absent gmMemberId key never reads as an open GM seat (second pass T2/C4)", () => {
    const { gmMemberId: _dropped, ...withoutGm } = validAuthority;
    expect(() => parseAuthorityAdmissionFields(withoutGm)).toThrow(RoomDataError);
    expect(() =>
      parseAuthorityAdmissionFields({ ...validAuthority, gmMemberId: undefined }),
    ).toThrow(RoomDataError);
    expect(() => parseAuthorityAdmissionFields({ ...validAuthority, gmMemberId: "" })).toThrow(
      RoomDataError,
    );
  });

  it.each([
    ["missing document", undefined],
    ["non-object", "active"],
    ["array", []],
    ["unknown roomStatus never reads as active", { ...validAuthority, roomStatus: "paused" }],
    ["missing roomStatus", { ...validAuthority, roomStatus: undefined }],
    ["unknown admissionStatus never reads as open", { ...validAuthority, admissionStatus: "yes" }],
    ["missing admissionStatus", { ...validAuthority, admissionStatus: undefined }],
    ["string participantCount never reads as 0", { ...validAuthority, participantCount: "3" }],
    ["negative participantCount", { ...validAuthority, participantCount: -1 }],
    ["fractional participantCount", { ...validAuthority, participantCount: 2.5 }],
    ["NaN participantCount", { ...validAuthority, participantCount: Number.NaN }],
    [
      "missing tableSeatClaimed never reads as false",
      { ...validAuthority, tableSeatClaimed: undefined },
    ],
    ["truthy non-boolean tableSeatClaimed", { ...validAuthority, tableSeatClaimed: "yes" }],
    ["non-string gmMemberId", { ...validAuthority, gmMemberId: 42 }],
  ])("throws RoomDataError for %s", (_label, data) => {
    expect(() => parseAuthorityAdmissionFields(data)).toThrow(RoomDataError);
  });
});

describe("parseRoomCodeDocument (fails closed)", () => {
  it("accepts a well-formed index entry", () => {
    expect(parseRoomCodeDocument({ roomId: "room-1" })).toEqual({ roomId: "room-1" });
  });

  it.each([
    ["missing document", undefined],
    ["empty object", {}],
    ["empty roomId", { roomId: "" }],
    ["non-string roomId", { roomId: 7 }],
  ])("throws RoomDataError for %s", (_label, data) => {
    expect(() => parseRoomCodeDocument(data)).toThrow(RoomDataError);
  });
});

describe("parseUidBindingDocument (fails closed)", () => {
  it("accepts every declared capability", () => {
    for (const capability of ["player", "gm", "table"] as const) {
      expect(parseUidBindingDocument({ memberId: "member-1", capability })).toEqual({
        memberId: asMemberId("member-1"),
        capability,
      });
    }
  });

  it.each([
    ["missing document (must not read as 'no binding')", undefined],
    ["empty memberId", { memberId: "", capability: "player" }],
    ["missing memberId", { capability: "player" }],
    ["unknown capability", { memberId: "member-1", capability: "admin" }],
    ["missing capability", { memberId: "member-1" }],
  ])("throws RoomDataError for %s", (_label, data) => {
    expect(() => parseUidBindingDocument(data)).toThrow(RoomDataError);
  });
});

describe("parseHashedSecretDocument (fails closed)", () => {
  const valid = { hash: "abc", salt: "def", iterations: 210_000 };

  it("accepts a well-formed hash record", () => {
    expect(parseHashedSecretDocument(valid)).toEqual(valid);
  });

  it.each([
    ["missing document", undefined],
    ["empty hash", { ...valid, hash: "" }],
    ["missing salt", { hash: "abc", iterations: 1 }],
    ["zero iterations", { ...valid, iterations: 0 }],
    ["string iterations", { ...valid, iterations: "210000" }],
    ["fractional iterations", { ...valid, iterations: 1.5 }],
    [
      "iterations above the ceiling (CPU pinning)",
      { ...valid, iterations: MAX_SECRET_ITERATIONS + 1 },
    ],
  ])("throws RoomDataError for %s", (_label, data) => {
    expect(() => parseHashedSecretDocument(data)).toThrow(RoomDataError);
  });

  it("accepts an iteration count exactly at the ceiling", () => {
    expect(
      parseHashedSecretDocument({ ...valid, iterations: MAX_SECRET_ITERATIONS }).iterations,
    ).toBe(MAX_SECRET_ITERATIONS);
  });
});

describe("parseAdmissionThrottleDocument (fails closed)", () => {
  it("accepts a well-formed counter", () => {
    expect(parseAdmissionThrottleDocument({ windowStartMs: 1, count: 0 })).toEqual({
      windowStartMs: 1,
      count: 0,
    });
  });

  it.each([
    ["missing document", undefined],
    ["string window start", { windowStartMs: "1", count: 1 }],
    ["NaN window start", { windowStartMs: Number.NaN, count: 1 }],
    ["negative count", { windowStartMs: 1, count: -1 }],
    ["fractional count", { windowStartMs: 1, count: 0.5 }],
    ["missing count (must not read as a fresh window)", { windowStartMs: 1 }],
  ])("throws RoomDataError for %s", (_label, data) => {
    expect(() => parseAdmissionThrottleDocument(data)).toThrow(RoomDataError);
  });
});
