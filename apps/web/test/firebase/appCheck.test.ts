import { describe, expect, it, vi } from "vitest";

vi.mock("firebase/app-check", () => ({
  initializeAppCheck: vi.fn(() => ({ app: {} })),
  ReCaptchaEnterpriseProvider: vi.fn().mockImplementation(function ReCaptchaEnterpriseProvider(
    siteKey: string,
  ) {
    return { kind: "enterprise", siteKey };
  }),
  ReCaptchaV3Provider: vi.fn().mockImplementation(function ReCaptchaV3Provider(siteKey: string) {
    return { kind: "v3", siteKey };
  }),
}));

const app = { name: "[DEFAULT]" } as never;

describe("initializeMonitoringAppCheck", () => {
  it("stays off without an explicit site key, rather than silently running unprotected", async () => {
    const { initializeMonitoringAppCheck } = await import("../../src/firebase/appCheck.js");
    expect(initializeMonitoringAppCheck(app, {})).toBeNull();
    expect(
      initializeMonitoringAppCheck(app, { VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "" }),
    ).toBeNull();
  });

  it("initializes App Check with the reCAPTCHA Enterprise provider, never the classic v3 one", async () => {
    const { initializeMonitoringAppCheck } = await import("../../src/firebase/appCheck.js");
    const { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } =
      await import("firebase/app-check");
    const result = initializeMonitoringAppCheck(app, {
      VITE_RECAPTCHA_ENTERPRISE_SITE_KEY: "enterprise-site-key",
    });
    expect(result).not.toBeNull();
    expect(ReCaptchaEnterpriseProvider).toHaveBeenCalledWith("enterprise-site-key");
    expect(ReCaptchaV3Provider).not.toHaveBeenCalled();
    expect(initializeAppCheck).toHaveBeenCalledWith(
      app,
      expect.objectContaining({
        provider: expect.objectContaining({ kind: "enterprise" }) as unknown,
        isTokenAutoRefreshEnabled: true,
      }),
    );
  });
});
