import { describe, expect, it } from "vitest";
import {
  asCommandId,
  asMemberId,
  memberEventPartitionId,
  receiptDocumentId,
} from "../src/index.js";

describe("receiptDocumentId", () => {
  it("joins memberId and commandId with an underscore (third-pass review R6)", () => {
    const memberId = asMemberId("member-rook");
    const commandId = asCommandId("11111111-1111-4111-8111-111111111111");
    expect(receiptDocumentId(memberId, commandId)).toBe(
      "member-rook_11111111-1111-4111-8111-111111111111",
    );
  });
});

describe("memberEventPartitionId", () => {
  it("prefixes the member ID to disambiguate from the reserved shared/gm partition IDs", () => {
    expect(memberEventPartitionId(asMemberId("member-rook"))).toBe("member-member-rook");
  });
});
