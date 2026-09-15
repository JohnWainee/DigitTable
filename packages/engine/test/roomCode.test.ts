import { describe, expect, it } from "vitest";
import { ROOM_CODE_PATTERN, generateRoomCode } from "../src/index.js";

describe("generateRoomCode", () => {
  it("produces a code matching the room-code pattern used at admission", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateRoomCode();
      expect(code).toMatch(ROOM_CODE_PATTERN);
      expect(code.length).toBeGreaterThanOrEqual(4);
      expect(code.length).toBeLessThanOrEqual(32);
    }
  });

  it("is in two hyphenated groups of five symbols", () => {
    const code = generateRoomCode();
    expect(code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  });

  it("is not deterministic across calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRoomCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
