import { beforeEach, describe, expect, it } from "vitest";
import { asMemberId, asRoomId } from "@digitable/contracts";
import {
  ownershipFromAcceptedWithNames,
  readOwnershipRecord,
  writeOwnershipRecord,
} from "../../src/session/ownership.js";

const STORAGE_KEY = "digitable.etr.ownership.v2";

describe("local ownership credential hygiene", () => {
  beforeEach(() => window.localStorage.clear());

  it("never persists a newly issued recovery code", () => {
    const record = ownershipFromAcceptedWithNames(
      {
        ok: true,
        roomId: asRoomId("room-1"),
        roomCode: "ROOM01",
        memberId: asMemberId("member-1"),
        capability: "player",
        recoveryCode: "SECRET-RECOVERY-CODE",
        roomRevision: 0,
      },
      "Player",
      "Session",
    );
    writeOwnershipRecord(record);

    const raw = window.localStorage.getItem(STORAGE_KEY)!;
    expect(raw).not.toContain("SECRET-RECOVERY-CODE");
    expect(readOwnershipRecord()?.recoveryCode).toBeNull();
  });

  it("scrubs a recovery code from a legacy stored record on read", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        roomId: "room-1",
        roomCode: "ROOM01",
        memberId: "member-1",
        capability: "player",
        recoveryCode: "LEGACY-SECRET",
        displayName: "Player",
        sessionName: "Session",
      }),
    );

    expect(readOwnershipRecord()?.recoveryCode).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toContain("LEGACY-SECRET");
  });
});
