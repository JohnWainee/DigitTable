import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/app", () => ({ getApp: vi.fn(() => ({})) }));
vi.mock("firebase/app-check", () => ({
  initializeAppCheck: vi.fn(() => ({ app: {} })),
  ReCaptchaV3Provider: vi.fn().mockImplementation(function ReCaptchaV3Provider(siteKey: string) {
    return { siteKey };
  }),
}));

describe("initializeMonitoringAppCheck", () => {
  it("stays off without an explicit site key, rather than silently running unprotected", async () => {
    const { initializeMonitoringAppCheck } = await import("../../src/firebase/appCheck.js");
    expect(initializeMonitoringAppCheck({})).toBeNull();
  });

  it("initializes App Check (monitoring mode) when a site key is provided", async () => {
    const { initializeMonitoringAppCheck } = await import("../../src/firebase/appCheck.js");
    const { initializeAppCheck } = await import("firebase/app-check");
    const result = initializeMonitoringAppCheck({ VITE_RECAPTCHA_SITE_KEY: "site-key" });
    expect(result).not.toBeNull();
    expect(initializeAppCheck).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ isTokenAutoRefreshEnabled: true }),
    );
  });
});
