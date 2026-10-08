#!/usr/bin/env node
// Real-Chrome probe: under Windows High Contrast / forced colors, is the disclosure ("Why?") marker
// still visible and distinct from the surface it sits on?
//
// The marker is a clipped solid-colour box (`summary::before`). In forced-colors mode the browser
// replaces non-transparent `background-color` with the `Canvas` system colour, so an unprotected
// marker paints Canvas on Canvas and vanishes: the open/closed state indicator disappears. The probe
// loads the built app (any route; only the stylesheet matters), injects a real `<details>`, emulates
// `forced-colors: active` through CDP, and reports the computed colours plus a screenshot.
//
// Usage (needs a build served by `vite preview`; no emulators required):
//   node scripts/playtest/forced-colors-probe.mjs --base http://127.0.0.1:4173 [--port 9380]
//        [--shot out.png] [--expect-failures]
//
// `--expect-failures` is the negative control: exits 0 only if the marker is indistinguishable (run it
// against a bundle built without the fix to prove the probe can fail). Exit 1 otherwise on failure.
// LIMIT: Chrome's emulation is an approximation of Windows High Contrast (it uses its own system-colour
// palette); a real Windows high-contrast theme and screen reader pass remain open.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const BASE = arg("base", "http://127.0.0.1:4173").replace(/\/$/, "");
const PORT = Number(arg("port", "9380"));
const SHOT = arg("shot", "");
const EXPECT_FAILURES = args.includes("--expect-failures");
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(join(tmpdir(), "forced-colors-probe-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let socket;
let nextId = 0;
const pending = new Map();
async function connect() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const target = await (
        await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })
      ).json();
      socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
      });
      socket.onmessage = (message) => {
        const data = JSON.parse(message.data);
        if (data.id && pending.has(data.id)) {
          pending.get(data.id)(data);
          pending.delete(data.id);
        }
      };
      return;
    } catch {
      await sleep(200);
    }
  }
  throw new Error("Chrome did not start");
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
async function evaluate(expression) {
  const response = await send("Runtime.evaluate", { expression, returnByValue: true });
  if (response.result.exceptionDetails) {
    throw new Error(JSON.stringify(response.result.exceptionDetails));
  }
  return response.result.result.value;
}

let exitCode = 0;
try {
  await connect();
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 375,
    height: 400,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await send("Page.navigate", { url: `${BASE}/` });
  await sleep(1500);
  await evaluate(`(() => {
    const host = document.createElement("main");
    host.id = "fc-probe";
    host.innerHTML = '<details id="d"><summary id="s">Why?</summary><p>Because.</p></details>' +
      '<details id="o" open><summary id="so">Why?</summary><p>Because.</p></details>';
    document.body.prepend(host);
  })()`);

  const read = async () =>
    evaluate(`(() => {
      const bg = (el, pseudo) => getComputedStyle(el, pseudo).backgroundColor;
      const forced = matchMedia("(forced-colors: active)").matches;
      const details = document.getElementById("d");
      const summary = document.getElementById("s");
      return {
        forced,
        marker: bg(summary, "::before"),
        markerOpen: bg(document.getElementById("so"), "::before"),
        detailsSurface: bg(details),
        summarySurface: bg(summary),
        markerColor: getComputedStyle(summary).color,
      };
    })()`);

  await send("Emulation.setEmulatedMedia", {
    features: [{ name: "forced-colors", value: "active" }],
  });
  await sleep(300);
  const forced = await read();
  if (SHOT) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(SHOT, Buffer.from(shot.result.data, "base64"));
  }

  // Compare colour channels only: a half-alpha Canvas surface and an opaque Canvas marker are the same
  // colour to the eye, so a string comparison would call them different.
  const channels = (css) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).join(",");
  const visible = (marker) =>
    marker !== "rgba(0, 0, 0, 0)" && channels(marker) !== channels(forced.detailsSurface);
  const checks = [
    ["forced-colors emulation is active", forced.forced === true],
    ["closed marker differs from the surface it sits on", visible(forced.marker)],
    ["open marker differs from the surface it sits on", visible(forced.markerOpen)],
  ];
  console.log(JSON.stringify(forced));
  const failed = checks.filter(([, ok]) => !ok);
  for (const [name, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (EXPECT_FAILURES) {
    const intended = failed.some(([name]) => name.startsWith("closed marker"));
    console.log(
      intended ? "negative control: failed as intended" : "negative control: DID NOT FAIL",
    );
    exitCode = intended ? 0 : 1;
  } else {
    exitCode = failed.length === 0 ? 0 : 1;
  }
} finally {
  chrome.kill();
  await sleep(500); // let Chrome release the profile directory before removing it
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // a leftover temp profile is harmless
  }
}
process.exit(exitCode);
