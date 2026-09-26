// Shared by two-device-smoke.mjs and ui-audit.mjs so a browser device's captured console
// exceptions and genuine failed network requests (see the `Network.loadingFailed`
// listener in each script) always turn into a reported failure instead of being recorded
// in report.json but never checked. Pure and dependency-free so it can be unit tested
// without a real Chrome instance.

// A `Network.loadingFailed` event is a real failure only when the browser neither canceled
// the request itself nor blocked it on this script's own behalf. `blockedReason: "inspector"`
// is CDP's report for a request `Network.setBlockedURLs` (--no-images/--block) blocked —
// deliberate, not a network problem, and (unlike a cancellation) not always paired with an
// empty errorText, so it must be checked as its own condition rather than folded into it.
// Only "inspector" is excluded, not every `blockedReason` — this harness never triggers a CSP
// or mixed-content block, and if the app ever does, that's a real failure worth surfacing, not
// something to swallow just because it happens to share the same CDP field.
export function isGenuineNetworkFailure(params) {
  return !params.canceled && params.blockedReason !== "inspector";
}

// Reasons never repeat the device's own name — callers that report per-device (ui-audit.mjs's
// `fail(scope, message)`) already carry it in the scope, and callers that report a single flat
// list across every device (two-device-smoke.mjs) add it themselves via collectDeviceFailures.
export function deviceFailureReasons(device) {
  const reasons = [];
  if (device.consoleErrors.length > 0) {
    reasons.push(`${device.consoleErrors.length} console error(s)`);
  }
  if (device.failedRequests.length > 0) {
    reasons.push(`${device.failedRequests.length} failed request(s)`);
  }
  return reasons;
}

export function collectDeviceFailures(devices) {
  return devices.flatMap((device) =>
    deviceFailureReasons(device).map((reason) => `${device.name}: ${reason}`),
  );
}
