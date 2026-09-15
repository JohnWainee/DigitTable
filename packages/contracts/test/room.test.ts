import { describe, expect, it } from "vitest";
import {
  asCommandId,
  asMemberId,
  asTemplateId,
  MAX_SECRET_ITERATIONS,
  parseAdmissionThrottleDocument,
  parseAuthorityAdmissionFields,
  parseAuthorityRecord,
  parseCommandReceiptDocument,
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

describe("parseCommandReceiptDocument (board task A04)", () => {
  const acceptedReceipt = {
    receiptId: "member-rook_command-1",
    memberId: "member-rook",
    commandId: "command-1",
    status: "accepted",
    acceptedSequence: 3,
    roomRevision: 2,
  };
  const rejectedReceipt = {
    receiptId: "member-rook_command-2",
    memberId: "member-rook",
    commandId: "command-2",
    status: "rejected",
    acceptedSequence: null,
    roomRevision: 1,
    code: "ROLL_ALREADY_RESOLVED",
    message: "This roll has already been resolved.",
  };

  it("accepts a well-formed accepted receipt", () => {
    expect(parseCommandReceiptDocument(acceptedReceipt)).toMatchObject({
      status: "accepted",
      acceptedSequence: 3,
      roomRevision: 2,
    });
  });

  it("accepts a well-formed rejected receipt, carrying code and message", () => {
    expect(parseCommandReceiptDocument(rejectedReceipt)).toMatchObject({
      status: "rejected",
      code: "ROLL_ALREADY_RESOLVED",
      message: "This roll has already been resolved.",
    });
  });

  it("fails closed on a rejected receipt missing its code", () => {
    const { code: _omit, ...malformed } = rejectedReceipt;
    expect(() => parseCommandReceiptDocument(malformed)).toThrow(RoomDataError);
  });

  it("fails closed on a rejected receipt with a code outside StableErrorCode", () => {
    expect(() =>
      parseCommandReceiptDocument({ ...rejectedReceipt, code: "NOT_A_REAL_CODE" }),
    ).toThrow(RoomDataError);
  });

  it("fails closed on an unrecognized status", () => {
    expect(() => parseCommandReceiptDocument({ ...acceptedReceipt, status: "pending" })).toThrow(
      RoomDataError,
    );
  });

  it("fails closed on a missing document", () => {
    expect(() => parseCommandReceiptDocument(undefined)).toThrow(RoomDataError);
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

describe("parseAuthorityRecord (board task A04, fails closed)", () => {
  const fakeTemplate = {
    manifest: { templateId: asTemplateId("fixture-template"), currentSchemaVersion: 1 },
    schemas: {
      parseState: (value: unknown): { readonly count: number } => {
        if (
          typeof value !== "object" ||
          value === null ||
          typeof (value as { count?: unknown }).count !== "number"
        ) {
          throw new Error("bad state");
        }
        return value as { readonly count: number };
      },
    },
  };
  const validRecord = {
    ...validAuthority,
    platformVersion: "0.0.0",
    templateId: "fixture-template",
    templateVersion: "0.1.0",
    schemaVersion: 1,
    roomRevision: 4,
    nextSequence: 7,
    state: { count: 2 },
  };

  it("accepts a well-formed record, delegating state to the template's parser", () => {
    const record = parseAuthorityRecord(validRecord, fakeTemplate);
    expect(record).toMatchObject({
      platformVersion: "0.0.0",
      templateId: "fixture-template",
      roomRevision: 4,
      nextSequence: 7,
      state: { count: 2 },
    });
  });

  it("rejects a templateId that does not match the template being loaded", () => {
    expect(() =>
      parseAuthorityRecord({ ...validRecord, templateId: "other-template" }, fakeTemplate),
    ).toThrow(RoomDataError);
  });

  it("rejects a schemaVersion that does not match currentSchemaVersion exactly (no migration attempted here)", () => {
    expect(() => parseAuthorityRecord({ ...validRecord, schemaVersion: 2 }, fakeTemplate)).toThrow(
      RoomDataError,
    );
  });

  it("rejects malformed state via the template's own parseState, never defaulting it", () => {
    expect(() =>
      parseAuthorityRecord({ ...validRecord, state: { wrong: "shape" } }, fakeTemplate),
    ).toThrow(RoomDataError);
  });

  it.each([
    ["missing platformVersion", { ...validRecord, platformVersion: undefined }],
    ["negative roomRevision", { ...validRecord, roomRevision: -1 }],
    ["fractional nextSequence", { ...validRecord, nextSequence: 1.5 }],
    ["nextSequence below 1", { ...validRecord, nextSequence: 0 }],
    // Reuses parseAuthorityAdmissionFields's own fail-closed checks.
    ["unknown roomStatus", { ...validRecord, roomStatus: "paused" }],
  ])("throws RoomDataError for %s", (_label, data) => {
    expect(() => parseAuthorityRecord(data, fakeTemplate)).toThrow(RoomDataError);
  });
});
