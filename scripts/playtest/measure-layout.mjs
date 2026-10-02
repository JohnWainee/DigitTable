// Layout probe: loads a local HTML file in headless Chrome at each emulated phone/tablet/desktop
// width and prints the JSON its #out element holds, plus a full-page screenshot per width.
// Used for docs/evidence/reskin-mobile-oct02b (repro-before.html / repro-after.html).
//   node scripts/playtest/measure-layout.mjs <absolute file.html> <out-prefix> 320,375,768,1280
// CHROME_PATH overrides the macOS Google Chrome default; CDP_PORT overrides 9377.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [file, prefix, widthsArg] = process.argv.slice(2);
const PORT = Number(process.env.CDP_PORT ?? 9377);
const widths = widthsArg.split(",").map(Number);
const chrome = spawn(
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`,
    "--disable-gpu",
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    if (targets.find((t) => t.type === "page")) break;
  } catch {}
  await sleep(200);
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? d.error);
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const i = ++id;
    pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
await send("Page.enable");
for (const w of widths) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w,
    height: 800,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await send("Page.navigate", { url: `file://${file}` });
  await sleep(700);
  const r = await send("Runtime.evaluate", {
    expression: "document.getElementById('out').textContent",
    returnByValue: true,
  });
  console.log(w, r.result?.value);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(`${prefix}-${w}.png`, Buffer.from(shot.data, "base64"));
}
chrome.kill();
process.exit(0);
