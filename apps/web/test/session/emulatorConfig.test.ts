import { describe, expect, it } from "vitest";
import { emulatorConfigFor } from "../../src/session/emulatorConfig.js";

describe("emulatorConfigFor", () => {
  it("returns undefined unless the emulator flag is exactly 'true'", () => {
    expect(emulatorConfigFor({}, "localhost")).toBeUndefined();
    expect(emulatorConfigFor({ VITE_FIREBASE_USE_EMULATOR: "false" }, "localhost")).toBeUndefined();
    expect(emulatorConfigFor({ VITE_FIREBASE_USE_EMULATOR: "1" }, "localhost")).toBeUndefined();
  });

  it("targets the page's own host so a phone on the LAN reaches the laptop's emulators", () => {
    expect(emulatorConfigFor({ VITE_FIREBASE_USE_EMULATOR: "true" }, "192.168.1.20")).toEqual({
      auth: { url: "http://192.168.1.20:9099" },
      functions: { host: "192.168.1.20", port: 5001 },
      firestore: { host: "192.168.1.20", port: 8080 },
    });
  });

  it("lets VITE_EMULATOR_HOST override the page host", () => {
    const config = emulatorConfigFor(
      { VITE_FIREBASE_USE_EMULATOR: "true", VITE_EMULATOR_HOST: "10.0.0.5" },
      "192.168.1.20",
    );
    expect(config?.functions.host).toBe("10.0.0.5");
    expect(config?.auth.url).toBe("http://10.0.0.5:9099");
  });

  it("falls back to 127.0.0.1 when there is no page hostname or override", () => {
    expect(emulatorConfigFor({ VITE_FIREBASE_USE_EMULATOR: "true" }, undefined)?.firestore).toEqual(
      {
        host: "127.0.0.1",
        port: 8080,
      },
    );
  });

  it("accepts a bracketed IPv6 page hostname and rejects an override carrying a scheme or port", () => {
    expect(emulatorConfigFor({ VITE_FIREBASE_USE_EMULATOR: "true" }, "[::1]")?.auth.url).toBe(
      "http://[::1]:9099",
    );
    for (const bad of ["http://10.0.0.5", "10.0.0.5:9099", "host name", "a/b"]) {
      expect(() =>
        emulatorConfigFor({ VITE_FIREBASE_USE_EMULATOR: "true", VITE_EMULATOR_HOST: bad }, "x"),
      ).toThrow(/VITE_EMULATOR_HOST/);
    }
  });
});
