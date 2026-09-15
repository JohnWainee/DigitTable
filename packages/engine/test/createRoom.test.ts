import { describe, expect, it } from "vitest";
import { asRoomId, type CreateRoomReceiptDocument } from "@digitable/contracts";
import { decideCreateRoom } from "../src/index.js";

const receipt: CreateRoomReceiptDocument = {
  roomId: asRoomId("room-fixture"),
  roomCode: "ABCDE-FGHJK",
  memberId: "member-gm-fixture",
  uid: "uid-fixture",
};

describe("decideCreateRoom", () => {
  it("creates when no receipt exists for this request", () => {
    expect(decideCreateRoom(null)).toEqual({ outcome: "create" });
  });

  it("replays the existing receipt when one already exists for this request", () => {
    expect(decideCreateRoom(receipt)).toEqual({ outcome: "replay", receipt });
  });
});
