import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("firebase/app", () => ({
  getApps: vi.fn(() => []),
  getApp: vi.fn(),
  initializeApp: vi.fn((options: unknown) => ({ options })),
}));
vi.mock("firebase/app-check", () => ({
  initializeAppCheck: vi.fn(() => ({ app: {} })),
  ReCaptchaEnterpriseProvider: vi.fn().mockImplementation(function ReCaptchaEnterpriseProvider(
    siteKey: string,
  ) {
    return { siteKey };
  }),
}));

const firebaseEnvironment = {
  VITE_FIREBASE_API_KEY: "public-api-key",
  VITE_FIREBASE_AUTH_DOMAIN: "example.firebaseapp.com",
  VITE_FIREBASE_PROJECT_ID: "example-project",
  VITE_FIREBASE_APP_ID: "1:123:web:abc",
};

describe("bootstrapFirebase (application-startup seam)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("touches no Firebase service for a local-only build with no Firebase configuration", async () => {
    const { bootstrapFirebase } = await import("../../src/firebase/bootstrap.js");
    const { initializeApp } = await import("firebase/app");
    const { initializeAppCheck } = await import("firebase/app-check");
    expect(bootstrapFirebase({})).toBeNull();
    expect(bootstrapFirebase({ VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "key" })).toBeNull();
    expect(initializeApp).not.toHaveBeenCalled();
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it("initializes the app but leaves App Check off when no Enterprise site key is configured", async () => {
    const { bootstrapFirebase } = await import("../../src/firebase/bootstrap.js");
    const { initializeAppCheck } = await import("firebase/app-check");
    const bootstrap = bootstrapFirebase(firebaseEnvironment);
    expect(bootstrap).not.toBeNull();
    expect(bootstrap?.appCheck).toBeNull();
    expect(initializeAppCheck).not.toHaveBeenCalled();
  });

  it("initializes App Check monitoring on the same app, immediately at startup", async () => {
    const { bootstrapFirebase } = await import("../../src/firebase/bootstrap.js");
    const { initializeAppCheck } = await import("firebase/app-check");
    const bootstrap = bootstrapFirebase({
      ...firebaseEnvironment,
      VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "enterprise-site-key",
    });
    expect(bootstrap?.appCheck).not.toBeNull();
    expect(initializeAppCheck).toHaveBeenCalledTimes(1);
    expect(initializeAppCheck).toHaveBeenCalledWith(
      bootstrap?.app,
      expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
    );
    // Monitoring only: nothing here can request enforcement.
    const options = (initializeAppCheck as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(options).sort()).toEqual(["isTokenAutoRefreshEnabled", "provider"]);
  });
});
