import { describe, expect, it } from "vitest";
import { clientIpFrom, UNKNOWN_CLIENT_IP } from "../src/clientIp.js";

describe("clientIpFrom", () => {
  it("prefers the framework-resolved request IP", () => {
    expect(clientIpFrom({ ip: "203.0.113.5", forwardedFor: "198.51.100.9" })).toBe("203.0.113.5");
  });

  it("falls back to the first X-Forwarded-For entry, trimmed, string or array", () => {
    expect(clientIpFrom({ ip: undefined, forwardedFor: " 198.51.100.9 , 10.0.0.1" })).toBe(
      "198.51.100.9",
    );
    expect(clientIpFrom({ ip: "", forwardedFor: ["198.51.100.7, 10.0.0.1", "x"] })).toBe(
      "198.51.100.7",
    );
  });

  it("buckets an unresolvable caller as unknown rather than exempting it", () => {
    expect(clientIpFrom({ ip: undefined, forwardedFor: undefined })).toBe(UNKNOWN_CLIENT_IP);
    expect(clientIpFrom({ ip: "", forwardedFor: " , " })).toBe(UNKNOWN_CLIENT_IP);
  });
});
