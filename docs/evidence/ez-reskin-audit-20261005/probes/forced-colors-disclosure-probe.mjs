#!/usr/bin/env node
// Element-level probe: what does forced colors (Windows High Contrast) do to the "Why?" disclosure marker?
//
// Chrome's `Emulation.setEmulatedMedia` with `forced-colors: active` really recolours the page (colours, shadows
// and backgrounds are overridden by the UA), so a computed style under it is evidence. This injects the app's own
// `<details><summary>` markup into the landing page (the stylesheet is global, so it picks up the real
// `summary`, `summary::before` and `details[open]` rules), reads the computed colours of the label and of its
// `::before` marker, optionally layers one candidate rule on top, and screenshots the result at 3x.
//
// For each palette (dark: Chrome's default forced palette; light: forced-colors + prefers-color-scheme: light)
// it prints one line per candidate. Against an UNFIXED bundle the `none` candidate shows the marker painted in
// the Canvas colour (rgb(0, 0, 0) on black, rgb(255, 255, 255) on white); against the FIXED bundle `none` already
// shows LinkText. `currentcolor` is included to show it does NOT survive the override.
//
// Usage: node forced-colors-disclosure-probe.mjs --base http://127.0.0.1:48173 --out DIR [--port 48936]
// No npm dependency; Node's built-in WebSocket speaks CDP to the machine's Google Chrome.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const BASE = arg("base", "http://127.0.0.1:4173").replace(/\/$/, "");
const OUT = arg("out", "forced-colors-disclosure");
const PORT = Number(arg("port", "48936"));
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profile = mkdtempSync(join(tmpdir(), "digitable-fc-disclosure-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let ws;
for (let attempt = 0; attempt < 60 && !ws; attempt += 1) {
  try {
    const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    ws = socket;
  } catch {
    await sleep(250);
  }
}
if (!ws) {
  chrome.kill();
  console.error("Chrome DevTools endpoint never came up");
  process.exit(2);
}
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  const waiter = message.id === undefined ? undefined : pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    nextId += 1;
    pending.set(nextId, { resolve, reject });
    ws.send(JSON.stringify({ id: nextId, method, params, sessionId }));
  });

try {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width: 390, height: 844, deviceScaleFactor: 1, mobile: true },
    sessionId,
  );
  const ev = async (expression) =>
    (
      await send(
        "Runtime.evaluate",
        { expression, returnByValue: true, awaitPromise: true },
        sessionId,
      )
    ).result.value;

  const INJECT = `(() => {
    const host = document.createElement("div");
    host.id = "zz";
    host.style.cssText = "padding:16px;position:relative;z-index:5";
    host.innerHTML = '<details open><summary>Why?</summary><p>Pool detail</p></details>';
    document.body.appendChild(host);
    const summary = host.querySelector("summary");
    const label = getComputedStyle(summary);
    return { labelColor: label.color, markerBackground: getComputedStyle(summary, "::before").backgroundColor };
  })()`;
  const candidates = [
    ["none", ""],
    ["CanvasText", "summary::before { background: CanvasText; }"],
    ["LinkText", "summary::before { background: LinkText; }"],
    ["currentcolor", "summary::before { background: currentcolor; }"],
  ];
  const palettes = [
    ["dark", [{ name: "forced-colors", value: "active" }]],
    [
      "light",
      [
        { name: "forced-colors", value: "active" },
        { name: "prefers-color-scheme", value: "light" },
      ],
    ],
  ];
  for (const [palette, features] of palettes) {
    await send("Emulation.setEmulatedMedia", { features }, sessionId);
    for (const [label, css] of candidates) {
      // A hash-only navigation does not reload the page, so styles injected for the previous candidate would
      // linger and contaminate this one: leave the document first to force a real load every time.
      await send("Page.navigate", { url: "about:blank" }, sessionId);
      await sleep(150);
      await send("Page.navigate", { url: `${BASE}/#/` }, sessionId);
      await sleep(1200);
      const before = await ev(INJECT);
      await ev(`(() => {
        const style = document.createElement("style");
        style.textContent = ${JSON.stringify(`@media (forced-colors: active) { ${css} }`)};
        document.head.appendChild(style);
        return true;
      })()`);
      await sleep(150);
      const markerAfter = await ev(
        `getComputedStyle(document.querySelector("#zz summary"), "::before").backgroundColor`,
      );
      console.log(
        `${palette.padEnd(5)} candidate=${label.padEnd(12)} label=${before.labelColor} marker(before candidate)=${before.markerBackground} marker(with candidate)=${markerAfter}`,
      );
      const rect = await ev(
        `(() => { const r = document.querySelector("#zz").getBoundingClientRect(); return [r.left, r.top + scrollY, r.width, r.height]; })()`,
      );
      const shot = await send(
        "Page.captureScreenshot",
        {
          format: "png",
          clip: {
            x: rect[0],
            y: rect[1],
            width: Math.min(rect[2], 390),
            height: Math.min(rect[3], 110),
            scale: 3,
          },
        },
        sessionId,
      );
      writeFileSync(join(OUT, `why-${palette}-${label}.png`), Buffer.from(shot.data, "base64"));
    }
  }
} finally {
  ws.close();
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(0);
