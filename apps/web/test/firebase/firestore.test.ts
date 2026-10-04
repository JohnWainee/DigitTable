import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/firestore", () => ({
  getFirestore: vi.fn(() => ({ kind: "default" })),
  initializeFirestore: vi.fn(() => ({ kind: "emulator-long-polling" })),
  connectFirestoreEmulator: vi.fn(),
}));

const emulator = { host: "127.0.0.1", port: 8080 };

describe("getRoomFirestore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the SDK's default transport for a deployed project (no emulator host)", async () => {
    const { getRoomFirestore } = await import("../../src/firebase/firestore.js");
    const { getFirestore, initializeFirestore, connectFirestoreEmulator } =
      await import("firebase/firestore");
    const app = { name: "deployed" } as never;
    expect(getRoomFirestore(app)).toEqual({ kind: "default" });
    expect(getFirestore).toHaveBeenCalledWith(app);
    expect(initializeFirestore).not.toHaveBeenCalled();
    expect(connectFirestoreEmulator).not.toHaveBeenCalled();
  });

  it("forces long polling against the emulator (iOS Simulator Safari received updates only by the 30 s poll without it)", async () => {
    const { getRoomFirestore } = await import("../../src/firebase/firestore.js");
    const { getFirestore, initializeFirestore, connectFirestoreEmulator } =
      await import("firebase/firestore");
    const app = { name: "emulated" } as never;
    const db = getRoomFirestore(app, emulator);
    expect(initializeFirestore).toHaveBeenCalledWith(app, { experimentalForceLongPolling: true });
    expect(connectFirestoreEmulator).toHaveBeenCalledWith(db, "127.0.0.1", 8080);
    expect(getFirestore).not.toHaveBeenCalled();
  });

  it("creates and connects the emulator instance once per app, whatever the call count", async () => {
    const { getRoomFirestore } = await import("../../src/firebase/firestore.js");
    const { initializeFirestore, connectFirestoreEmulator } = await import("firebase/firestore");
    const app = { name: "emulated-repeat" } as never;
    const first = getRoomFirestore(app, emulator);
    const second = getRoomFirestore(app, emulator);
    expect(second).toBe(first);
    expect(initializeFirestore).toHaveBeenCalledTimes(1);
    expect(connectFirestoreEmulator).toHaveBeenCalledTimes(1);
  });

  it("gives each app its own emulator instance", async () => {
    const { getRoomFirestore } = await import("../../src/firebase/firestore.js");
    const { initializeFirestore } = await import("firebase/firestore");
    getRoomFirestore({ name: "one" } as never, emulator);
    getRoomFirestore({ name: "two" } as never, emulator);
    expect(initializeFirestore).toHaveBeenCalledTimes(2);
  });
});
