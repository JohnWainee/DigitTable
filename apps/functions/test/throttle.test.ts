import { describe, expect, it } from "vitest";
import {
  ADMISSION_THROTTLE_MAX_ATTEMPTS,
  ADMISSION_THROTTLE_WINDOW_MS,
  decideThrottle,
  throttleDocumentPath,
  throttleSegment,
} from "../src/throttle.js";

const START = 1_700_000_000_000;

describe("decideThrottle (fixed window, pure)", () => {
  it("opens a fresh window on the first attempt", () => {
    expect(decideThrottle(null, START)).toEqual({
      allowed: true,
      remaining: ADMISSION_THROTTLE_MAX_ATTEMPTS - 1,
      next: { windowStartMs: START, count: 1 },
    });
  });

  it("counts attempts within the window and allows exactly the cap", () => {
    const atCapMinusOne = { windowStartMs: START, count: ADMISSION_THROTTLE_MAX_ATTEMPTS - 1 };
    expect(decideThrottle(atCapMinusOne, START + 10)).toEqual({
      allowed: true,
      remaining: 0,
      next: { windowStartMs: START, count: ADMISSION_THROTTLE_MAX_ATTEMPTS },
    });
  });

  it("denies the attempt after the cap without writing anything", () => {
    const atCap = { windowStartMs: START, count: ADMISSION_THROTTLE_MAX_ATTEMPTS };
    expect(decideThrottle(atCap, START + 10)).toEqual({ allowed: false, remaining: 0, next: null });
    const overCap = { windowStartMs: START, count: ADMISSION_THROTTLE_MAX_ATTEMPTS + 5 };
    expect(decideThrottle(overCap, START + 10)).toEqual({
      allowed: false,
      remaining: 0,
      next: null,
    });
  });

  it("resets exactly at window expiry, not one millisecond before", () => {
    const saturated = { windowStartMs: START, count: ADMISSION_THROTTLE_MAX_ATTEMPTS };
    expect(decideThrottle(saturated, START + ADMISSION_THROTTLE_WINDOW_MS - 1).allowed).toBe(false);
    const reset = decideThrottle(saturated, START + ADMISSION_THROTTLE_WINDOW_MS);
    expect(reset).toEqual({
      allowed: true,
      remaining: ADMISSION_THROTTLE_MAX_ATTEMPTS - 1,
      next: { windowStartMs: START + ADMISSION_THROTTLE_WINDOW_MS, count: 1 },
    });
  });
});

describe("throttleSegment / throttleDocumentPath", () => {
  it("never yields a path separator, a bare dot ID, or a reserved __name__ ID", () => {
    expect(throttleSegment("a/b/c")).toBe("a_b_c");
    expect(throttleSegment(".")).toBe("x_.");
    expect(throttleSegment("..")).toBe("x_..");
    expect(throttleSegment("__proto__")).toBe("x___proto__");
    expect(throttleSegment("")).toBe("empty");
    expect(throttleSegment("2001:db8::1")).toBe("2001:db8::1");
  });

  it("keys by submitted room code and caller IP under the service-only collection", () => {
    expect(throttleDocumentPath("ROOM-CODE", "203.0.113.5")).toBe(
      "admissionThrottle/ROOM-CODE/byIp/203.0.113.5",
    );
    expect(throttleDocumentPath("../x", "unknown")).toBe("admissionThrottle/.._x/byIp/unknown");
  });
});
