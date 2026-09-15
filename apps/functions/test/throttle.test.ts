import { describe, expect, it } from "vitest";
import {
  ADMISSION_THROTTLE_LIMITS,
  ADMISSION_THROTTLE_WINDOW_MS,
  decideThrottle,
  throttleDocumentPaths,
  throttleKey,
} from "../src/throttle.js";

const START = 1_700_000_000_000;
const MAX = ADMISSION_THROTTLE_LIMITS.code;

describe("decideThrottle (fixed window, pure)", () => {
  it("opens a fresh window on the first attempt", () => {
    expect(decideThrottle(null, START, MAX)).toEqual({
      allowed: true,
      next: { windowStartMs: START, count: 1 },
    });
  });

  it("counts attempts within the window and allows exactly the cap", () => {
    expect(decideThrottle({ windowStartMs: START, count: MAX - 1 }, START + 10, MAX)).toEqual({
      allowed: true,
      next: { windowStartMs: START, count: MAX },
    });
  });

  it("denies the attempt after the cap without writing anything", () => {
    expect(decideThrottle({ windowStartMs: START, count: MAX }, START + 10, MAX)).toEqual({
      allowed: false,
      next: null,
    });
    expect(decideThrottle({ windowStartMs: START, count: MAX + 5 }, START + 10, MAX)).toEqual({
      allowed: false,
      next: null,
    });
  });

  it("resets exactly at window expiry, not one millisecond before", () => {
    const saturated = { windowStartMs: START, count: MAX };
    expect(decideThrottle(saturated, START + ADMISSION_THROTTLE_WINDOW_MS - 1, MAX).allowed).toBe(
      false,
    );
    expect(decideThrottle(saturated, START + ADMISSION_THROTTLE_WINDOW_MS, MAX)).toEqual({
      allowed: true,
      next: { windowStartMs: START + ADMISSION_THROTTLE_WINDOW_MS, count: 1 },
    });
  });

  it("honors a per-bucket cap", () => {
    const atCodeCap = { windowStartMs: START, count: ADMISSION_THROTTLE_LIMITS.code };
    expect(decideThrottle(atCodeCap, START, ADMISSION_THROTTLE_LIMITS.code).allowed).toBe(false);
    expect(decideThrottle(atCodeCap, START, ADMISSION_THROTTLE_LIMITS.uid).allowed).toBe(true);
  });
});

describe("throttleKey / throttleDocumentPaths", () => {
  it("yields a fixed-length hex ID for any input, so no hostile value can form an invalid path", () => {
    for (const value of ["a/b/c", ".", "..", "__proto__", "", "x".repeat(5_000), "2001:db8::1"]) {
      expect(throttleKey(value)).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(throttleKey("ROOM-CODE")).not.toBe(throttleKey("room-code"));
  });

  it("never stores the submitted code or address as a document ID", () => {
    const paths = throttleDocumentPaths({ roomCode: "ROOM-CODE", ip: "203.0.113.5", uid: "uid-1" });
    for (const path of Object.values(paths)) {
      expect(path).not.toContain("ROOM-CODE");
      expect(path).not.toContain("203.0.113.5");
      expect(path).not.toContain("uid-1");
      expect(path.split("/")).toHaveLength(4);
      expect(path.startsWith("admissionThrottle/")).toBe(true);
    }
    expect(paths.code).toMatch(/^admissionThrottle\/code-[0-9a-f]{64}\/byIp\/[0-9a-f]{64}$/);
    expect(paths.ip).toMatch(/^admissionThrottle\/ip-[0-9a-f]{64}\/scope\/all$/);
    expect(paths.uid).toMatch(/^admissionThrottle\/uid-[0-9a-f]{64}\/scope\/all$/);
  });

  it("keys the per-IP bucket independently of the code, and the per-UID bucket independently of both", () => {
    const a = throttleDocumentPaths({ roomCode: "AAAA", ip: "203.0.113.5", uid: "uid-1" });
    const b = throttleDocumentPaths({ roomCode: "BBBB", ip: "203.0.113.5", uid: "uid-2" });
    expect(a.code).not.toBe(b.code);
    expect(a.ip).toBe(b.ip);
    expect(a.uid).not.toBe(b.uid);
  });
});
