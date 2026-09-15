import { STABLE_ERROR_CODES } from "@digitable/contracts";
import { describe, expect, it } from "vitest";
import { grpcCodeFor } from "../src/httpsErrors.js";

describe("grpcCodeFor", () => {
  it("maps every stable error code without throwing", () => {
    for (const code of STABLE_ERROR_CODES) {
      expect(typeof grpcCodeFor(code)).toBe("string");
    }
  });

  it("chooses statuses a client can act on, never a success-shaped one", () => {
    expect(grpcCodeFor("AUTH_REQUIRED")).toBe("unauthenticated");
    expect(grpcCodeFor("INVALID_PASSPHRASE")).toBe("permission-denied");
    expect(grpcCodeFor("GM_SEAT_TAKEN")).toBe("permission-denied");
    expect(grpcCodeFor("RATE_LIMITED")).toBe("resource-exhausted");
    expect(grpcCodeFor("ROOM_FULL")).toBe("resource-exhausted");
    expect(grpcCodeFor("ROOM_NOT_FOUND")).toBe("not-found");
    expect(grpcCodeFor("ROOM_DATA_INVALID")).toBe("internal");
    for (const code of STABLE_ERROR_CODES) {
      expect(grpcCodeFor(code)).not.toBe("ok");
    }
  });
});
