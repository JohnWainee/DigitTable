import { describe, expect, it } from "vitest";
import { asCommandId, asMemberId, receiptIdFor } from "../src/index.js";

describe("room persistence contracts", () => {
  it("uses the architecture's memberId_commandId receipt identifier", () => {
    expect(receiptIdFor(asMemberId("member-rook"), asCommandId("command-uuid"))).toBe(
      "member-rook_command-uuid",
    );
  });
});
