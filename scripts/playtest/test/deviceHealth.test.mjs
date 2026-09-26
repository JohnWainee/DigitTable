import { describe, expect, it } from "vitest";

import {
  collectDeviceFailures,
  deviceFailureReasons,
  isGenuineNetworkFailure,
} from "../deviceHealth.mjs";

function device(name, overrides = {}) {
  return { name, consoleErrors: [], failedRequests: [], ...overrides };
}

describe("isGenuineNetworkFailure", () => {
  it("is true for a genuine network error, e.g. the staging smoke's net::ERR_NETWORK_CHANGED", () => {
    expect(
      isGenuineNetworkFailure({ errorText: "net::ERR_NETWORK_CHANGED", canceled: false }),
    ).toBe(true);
  });

  it("is false for a request the page itself canceled", () => {
    expect(isGenuineNetworkFailure({ errorText: "net::ERR_ABORTED", canceled: true })).toBe(false);
  });

  // Regression: --no-images/--block use Network.setBlockedURLs, and Chrome reports each
  // blocked image load as a non-canceled Network.loadingFailed with blockedReason: "inspector"
  // and an empty errorText — verified live against a real Chrome instance while fixing this.
  // Without this check, every --no-images run would fail on its own deliberately blocked images.
  it("is false for a request this harness deliberately blocked via Network.setBlockedURLs", () => {
    expect(
      isGenuineNetworkFailure({ errorText: "", canceled: false, blockedReason: "inspector" }),
    ).toBe(false);
  });

  // A real CSP/mixed-content block is a genuine app failure, not something this harness
  // caused — only "inspector" (this script's own Network.setBlockedURLs) is exempted.
  it("is true for a request blocked for a reason other than this harness's own blocking", () => {
    expect(
      isGenuineNetworkFailure({
        errorText: "net::ERR_BLOCKED_BY_CSP",
        canceled: false,
        blockedReason: "csp",
      }),
    ).toBe(true);
  });
});

describe("deviceFailureReasons", () => {
  it("reports no reasons for a clean device", () => {
    expect(deviceFailureReasons(device("gm"))).toEqual([]);
  });

  it("surfaces a console error even with no failed requests", () => {
    const reasons = deviceFailureReasons(device("player", { consoleErrors: ["boom"] }));
    expect(reasons).toEqual(["1 console error(s)"]);
  });

  // Regression: a real staging smoke run recorded net::ERR_NETWORK_CHANGED in
  // failedRequests while every step still passed, and two-device-smoke.mjs's report.ok
  // computation never looked at failedRequests at all, so the run printed
  // "ALL STEPS PASSED" with a live network failure sitting unexamined in report.json.
  it("surfaces a failed request even with no console errors", () => {
    const reasons = deviceFailureReasons(
      device("table", { failedRequests: ["net::ERR_NETWORK_CHANGED"] }),
    );
    expect(reasons).toEqual(["1 failed request(s)"]);
  });

  it("surfaces both kinds of failure together", () => {
    const reasons = deviceFailureReasons(
      device("gm", { consoleErrors: ["e1", "e2"], failedRequests: ["net::ERR_NETWORK_CHANGED"] }),
    );
    expect(reasons).toEqual(["2 console error(s)", "1 failed request(s)"]);
  });
});

describe("collectDeviceFailures", () => {
  it("returns an empty list when every device is clean", () => {
    expect(collectDeviceFailures([device("gm"), device("player"), device("table")])).toEqual([]);
  });

  it("flattens failures across every device, naming each one, so a run can never silently pass with one", () => {
    const devices = [
      device("gm"),
      device("player", { failedRequests: ["net::ERR_NETWORK_CHANGED"] }),
      device("table", { consoleErrors: ["boom"] }),
    ];
    expect(collectDeviceFailures(devices)).toEqual([
      "player: 1 failed request(s)",
      "table: 1 console error(s)",
    ]);
  });
});
