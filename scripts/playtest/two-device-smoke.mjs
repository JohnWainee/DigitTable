#!/usr/bin/env node
// Drives the REAL running app (live mode against the Firebase emulators) as three isolated
// browser "devices" — GM (desktop), player (phone emulation), table (large display) — through
// one full session loop, over whatever origin you give it. Point --base at the LAN address
// (http://192.168.x.y:4173) to exercise the same insecure-context conditions a phone sees.
//
// No npm dependency: launches the machine's Google Chrome headless and speaks the Chrome
// DevTools Protocol over Node 22's built-in WebSocket (same approach as the C05 screenshots).
//
// Usage:
//   node scripts/playtest/two-device-smoke.mjs --base http://192.168.4.56:4173 \
//     --out docs/evidence/today-qwen/two-device-run [--no-images] [--reload]
//
// Writes report.json (per-step pass/fail, console errors, secure-context facts) and
// full-page JPEG screenshots. Exit code 1 if any step fails.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectDeviceFailures, isGenuineNetworkFailure } from "./deviceHealth.mjs";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
}
const BASE = arg("base", "http://localhost:4173").replace(/\/$/, "");
const OUT = arg("out", "two-device-run");
const NO_IMAGES = args.includes("--no-images");
const BLOCK = arg("block", "").split(",").filter(Boolean);
const ROUTES_ONLY = args.includes("--routes-only");
const DO_RELOAD = args.includes("--reload");
const PORT = Number(arg("port", "9333"));
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = [];
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== undefined) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        if (message.error) waiter.reject(new Error(`${message.error.message}`));
        else waiter.resolve(message.result);
      } else {
        for (const listener of this.listeners) listener(message);
      }
    };
  }
  static async connect(port) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        const ws = new WebSocket(version.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.onopen = resolve;
          ws.onerror = reject;
        });
        return new Cdp(ws);
      } catch {
        await sleep(250);
      }
    }
    throw new Error("Chrome DevTools endpoint never came up");
  }
  send(method, params = {}, sessionId) {
    const id = (this.nextId += 1);
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

const report = {
  base: BASE,
  startedAt: new Date().toISOString(),
  noImages: NO_IMAGES,
  blocked: BLOCK,
  devices: {},
  steps: [],
  overflows: [],
};
let shotCounter = 0;
const allDevices = [];

async function openDevice(cdp, name, { width, height, mobile }) {
  const { browserContextId } = await cdp.send("Target.createBrowserContext", {
    disposeOnDetach: true,
  });
  const { targetId } = await cdp.send("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const device = { name, sessionId, width, height, consoleErrors: [], failedRequests: [] };
  cdp.listeners.push((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Runtime.exceptionThrown") {
      device.consoleErrors.push(
        message.params.exceptionDetails.exception?.description ??
          message.params.exceptionDetails.text,
      );
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      device.consoleErrors.push(
        message.params.args.map((a) => a.value ?? a.description ?? "").join(" "),
      );
    } else if (
      message.method === "Network.loadingFailed" &&
      isGenuineNetworkFailure(message.params)
    ) {
      device.failedRequests.push(message.params.errorText);
    }
  });
  for (const domain of ["Page", "Runtime", "Network"])
    await cdp.send(`${domain}.enable`, {}, sessionId);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile },
    sessionId,
  );
  if (mobile) await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true }, sessionId);
  const blocked = NO_IMAGES ? ["*.png", "*.webp", "*.jpg"] : BLOCK;
  if (blocked.length > 0) await cdp.send("Network.setBlockedURLs", { urls: blocked }, sessionId);
  device.cdp = cdp;
  allDevices.push(device);
  return device;
}

async function ev(device, expression) {
  const result = await device.cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    device.sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function goto(device, path) {
  await device.cdp.send("Page.navigate", { url: `${BASE}/${path}` }, device.sessionId);
  await waitFor(device, `document.readyState === "complete"`, 20000, `load ${path}`);
}

async function waitFor(device, expression, timeoutMs = 20000, label = expression) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await ev(device, `Boolean(${expression})`)) return;
    } catch {
      /* page navigating */
    }
    await sleep(150);
  }
  throw new Error(`[${device.name}] timed out waiting for: ${label}`);
}

const textMatch = (selector, pattern) =>
  `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e => ${pattern}.test(e.textContent.trim()) && !e.disabled)`;

// The app deliberately serializes ordinary commands per seat (a second one is refused while the
// first is still being confirmed), so wait for the "awaiting confirmation" line to clear first.
async function settle(device) {
  try {
    await waitFor(device, `!document.body.textContent.includes("awaiting confirmation")`, 10000);
  } catch {
    /* fall through: the click below will surface the real state */
  }
}

async function clickText(device, selector, pattern, timeoutMs = 20000) {
  if (selector === "button") await settle(device);
  const finder = textMatch(selector, pattern);
  await waitFor(device, finder, timeoutMs, `${selector} matching ${pattern}`);
  await ev(
    device,
    `(() => { const el = ${finder}; el.scrollIntoView({ block: "center" }); el.click(); return true; })()`,
  );
}

async function setInput(device, selector, value) {
  await waitFor(device, `document.querySelector(${JSON.stringify(selector)})`, 15000, selector);
  await ev(
    device,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
  );
}

async function overflowPx(device) {
  return ev(device, `document.documentElement.scrollWidth - document.documentElement.clientWidth`);
}

async function shot(device, label) {
  shotCounter += 1;
  // Images are loading="lazy": scroll the whole page once so below-the-fold art loads like it would for a real user.
  await ev(
    device,
    `(async () => { const step = Math.max(200, innerHeight - 100); for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } scrollTo(0, 0); })()`,
  );
  await sleep(500);
  const overflow = await overflowPx(device);
  if (overflow > 1)
    report.overflows.push({ device: device.name, label, width: device.width, overflow });
  const metrics = await device.cdp.send("Page.getLayoutMetrics", {}, device.sessionId);
  const width = Math.ceil(metrics.cssContentSize.width);
  const height = Math.min(Math.ceil(metrics.cssContentSize.height), 5000);
  const { data } = await device.cdp.send(
    "Page.captureScreenshot",
    {
      format: "jpeg",
      quality: 72,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    },
    device.sessionId,
  );
  const file = `${String(shotCounter).padStart(2, "0")}-${device.name}-${label}-${device.width}x${device.height}${NO_IMAGES ? "-noimg" : ""}.jpg`;
  writeFileSync(join(OUT, file), Buffer.from(data, "base64"));
  return file;
}

async function step(name, fn) {
  const startedAt = Date.now();
  try {
    const detail = await fn();
    report.steps.push({ name, ok: true, ms: Date.now() - startedAt, detail: detail ?? null });
    console.log(`PASS ${name}`);
  } catch (error) {
    const context = {};
    for (const device of allDevices) {
      try {
        context[device.name] = {
          alerts: await ev(
            device,
            `[...document.querySelectorAll('[role=alert], .error-message')].map(e => e.textContent.trim())`,
          ),
          screenshot: await shot(device, "FAILED"),
        };
      } catch {
        /* device unavailable */
      }
    }
    report.steps.push({
      name,
      ok: false,
      ms: Date.now() - startedAt,
      error: String(error.message),
      context,
    });
    console.log(`FAIL ${name}: ${error.message}`);
    throw error;
  }
}

const ROUTES = [
  "#/",
  "#/create",
  "#/join",
  "#/table",
  "#/claim/no-such-room",
  "#/room/no-such-room/player",
  "#/room/no-such-room/gm",
  "#/room/no-such-room/table",
  "#/definitely/not/a/route",
];
const VIEWPORTS = [
  [375, 812],
  [768, 1024],
  [1280, 800],
  [1920, 1080],
];

async function setViewport(device, width, height) {
  const mobile = width < 700;
  await device.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 1, mobile },
    device.sessionId,
  );
  device.width = width;
  device.height = height;
  await sleep(250);
}

async function auditRoutes(cdp) {
  const anon = await openDevice(cdp, "anon", { width: 1280, height: 800, mobile: false });
  const results = [];
  for (const route of ROUTES) {
    await goto(anon, route);
    await sleep(900);
    const heading = await ev(anon, `document.querySelector("h1, h2")?.textContent ?? null`);
    const alert = await ev(anon, `document.querySelector("[role=alert]")?.textContent ?? null`);
    const actionable = await ev(anon, `document.querySelectorAll("button, a[href], input").length`);
    const overflow = {};
    for (const [w, h] of VIEWPORTS) {
      await setViewport(anon, w, h);
      overflow[`${w}`] = await overflowPx(anon);
    }
    await setViewport(anon, 1280, 800);
    results.push({ route, heading, alert, actionable, overflow });
  }
  return results;
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "digitable-playtest-"));
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
  let cdp;
  let failed = false;
  try {
    cdp = await Cdp.connect(PORT);
    if (ROUTES_ONLY) {
      await step("signed-out route audit across four viewports", async () => {
        const results = await auditRoutes(cdp);
        report.routeAudit = results;
        const bad = results.filter(
          (r) => r.actionable === 0 || Object.values(r.overflow).some((v) => v > 1),
        );
        if (bad.length > 0)
          throw new Error(`routes with no controls or overflow: ${JSON.stringify(bad)}`);
        return results;
      });
      return;
    }
    const gm = await openDevice(cdp, "gm", { width: 1280, height: 800, mobile: false });
    const player = await openDevice(cdp, "player", { width: 375, height: 812, mobile: true });
    const table = await openDevice(cdp, "table", { width: 1920, height: 1080, mobile: false });
    const codes = {};

    await step("landing renders on every device", async () => {
      for (const device of [gm, player, table]) {
        await goto(device, "#/");
        await waitFor(
          device,
          `document.querySelector("h1")?.textContent.includes("Eat the Reich")`,
        );
        report.devices[device.name] = await ev(
          device,
          `({ origin: location.origin, isSecureContext, hasRandomUUID: typeof crypto.randomUUID === "function", userAgent: navigator.userAgent.slice(0, 80), heroImage: (() => { const i = document.querySelector(".hero-art-image"); return i ? { currentSrc: i.currentSrc || i.src, naturalWidth: i.naturalWidth } : null; })() })`,
        );
      }
      await shot(gm, "landing");
      await shot(player, "landing");
      return report.devices;
    });

    await step("GM creates a session and receives the one-time codes", async () => {
      await goto(gm, "#/create");
      await setInput(gm, "#session-name", "Smoke Session");
      await setInput(gm, "#passphrase", "smoke-pass-1");
      await setInput(gm, "#creator-display-name", "Gamemaster");
      await shot(gm, "create-form");
      await clickText(gm, "button", /^Create session$/);
      await waitFor(gm, `document.querySelector(".reveal-card")`, 30000, "secrets reveal card");
      const pairs = await ev(
        gm,
        `[...document.querySelectorAll(".reveal-card dt")].map(dt => [dt.textContent.trim(), dt.nextElementSibling.textContent.trim()])`,
      );
      for (const [key, value] of pairs) codes[key] = value;
      if (!codes["Room code"] || !codes["Table code"]) throw new Error("missing codes");
      await shot(gm, "secrets-reveal");
      await ev(gm, `document.querySelector("#wrote-down").click()`);
      await clickText(gm, "button", /ready.*continue/i);
      await clickText(gm, "button", /Open the director console/);
      await waitFor(
        gm,
        `document.body.textContent.includes("Scene director")`,
        30000,
        "director console",
      );
      return { roomCode: codes["Room code"] };
    });

    await step("GM loads the opening scene", async () => {
      await clickText(gm, "button", /^Load scene$/);
      await waitFor(gm, `document.body.textContent.includes("round 1")`, 30000, "scene loaded");
      await shot(gm, "scene-loaded");
    });

    await step("GM console fits a phone width with the opening scene loaded", async () => {
      // The edit-target <select> is sized by its longest option, which differs per scene, so the
      // final all-devices overflow step (run after the scene advances) cannot stand in for this.
      const original = [gm.width, gm.height];
      await setViewport(gm, 375, 812);
      const overflow = await overflowPx(gm);
      await setViewport(gm, ...original);
      if (overflow > 1) throw new Error(`GM console overflows by ${overflow}px at 375px`);
      return { overflow };
    });

    await step("player joins on a phone-sized device with plain-http crypto limits", async () => {
      await goto(player, "#/join");
      await setInput(player, "#room-code", codes["Room code"]);
      await setInput(player, "#join-passphrase", "smoke-pass-1");
      await setInput(player, "#join-display-name", "Ada");
      await clickText(player, "button", /^Join session$/);
      await waitFor(
        player,
        `document.querySelector(".reveal-card")`,
        30000,
        "player recovery reveal",
      );
      codes.playerRecovery = await ev(
        player,
        `document.querySelector(".reveal-code").textContent.trim()`,
      );
      await shot(player, "join-reveal");
      await clickText(player, "button", /wrote it down/);
      await waitFor(player, `document.querySelector(".roster-grid")`, 30000, "roster grid");
      await shot(player, "claim-roster");
    });

    await step("player claims the first available character", async () => {
      await clickText(player, "button", /^Claim$/);
      await clickText(player, "button", /Continue to your dashboard/);
      await waitFor(
        player,
        `document.body.textContent.includes("Choose an action")`,
        30000,
        "compose step",
      );
      await shot(player, "compose");
    });

    await step("table display connects with the separate table code", async () => {
      await goto(table, "#/table");
      await setInput(table, "#table-room-code", codes["Room code"]);
      await setInput(table, "#table-code", codes["Table code"]);
      await clickText(table, "button", /^Connect display$/);
      await clickText(table, "button", /Open the table display/, 30000);
      await waitFor(table, `document.querySelector(".scene-card")`, 30000, "table scene card");
      await shot(table, "table-idle");
      return {
        tableSceneImage: await ev(
          table,
          `(() => { const i = document.querySelector(".scene-card-art-image"); return i ? { currentSrc: i.currentSrc || i.src, complete: i.complete, naturalWidth: i.naturalWidth } : null; })()`,
        ),
        landingHeroImage: report.devices.gm.heroImage ?? null,
      };
    });

    await step("GM sees the claimed character (cross-device propagation)", async () => {
      await waitFor(
        gm,
        `/Characters claimed: 1\\//.test(document.body.textContent)`,
        30000,
        "GM sees 1 claimed",
      );
      await shot(gm, "gm-claimed");
    });

    await step("player declares an action and the GM sees it pending", async () => {
      await clickText(player, "button", /^Declare action$/);
      await waitFor(
        player,
        `document.body.textContent.includes("Declared")`,
        30000,
        "declared state",
      );
      await shot(player, "declared");
      await waitFor(gm, `${textMatch("button", "/^Roll it$/")}`, 30000, "GM Roll it button");
      await shot(gm, "gm-pending");
      await waitFor(
        table,
        `document.body.textContent.includes("is acting")`,
        30000,
        "table shows acting",
      );
    });

    await step("GM rolls; player allocates every die and confirms", async () => {
      await clickText(gm, "button", /^Roll it$/);
      await waitFor(
        player,
        `document.body.textContent.includes("Your roll")`,
        30000,
        "player allocation panel",
      );
      await ev(
        player,
        `document.querySelectorAll("fieldset.allocation-die-group").forEach(g => g.querySelector("input[type=radio]")?.click())`,
      );
      await shot(player, "allocation");
      await clickText(player, "button", /^Confirm allocation$/);
      await waitFor(
        player,
        `document.body.textContent.includes("Resolved") || document.body.textContent.includes("injury")`,
        30000,
        "resolution",
      );
      if (await ev(player, `document.body.textContent.includes("Choose an injury")`)) {
        await ev(player, `document.querySelector("input[type=radio]").click()`);
        await clickText(player, "button", /confirm|choose|apply/i);
        await waitFor(
          player,
          `document.body.textContent.includes("Resolved")`,
          30000,
          "resolved after injury",
        );
      }
      await shot(player, "resolved");
    });

    await step("player continues; table shows the roll outcome state", async () => {
      await clickText(player, "button", /^Back to scene$/);
      await waitFor(
        player,
        `document.body.textContent.includes("acted this round")`,
        30000,
        "acted-this-round guard",
      );
      await shot(table, "table-after-roll");
    });

    await step("GM pauses; player and table both reflect it; GM resumes", async () => {
      await clickText(gm, "button", /^Pause$/);
      await waitFor(table, `document.body.textContent.includes("Paused")`, 30000, "table paused");
      await waitFor(player, `document.body.textContent.includes("Paused")`, 30000, "player paused");
      await shot(player, "paused");
      await clickText(gm, "button", /^Resume$/);
      await waitFor(table, `!document.body.textContent.includes("Paused")`, 30000, "table resumed");
    });

    await step("GM ends the round, advances the scene with a reason; devices follow", async () => {
      await clickText(gm, "button", /^End round/);
      await waitFor(gm, `document.body.textContent.includes("round 2")`, 30000, "round 2");
      const before = await ev(table, `document.querySelector(".scene-card h2")?.textContent`);
      await setInput(gm, "#scene-reason", "Playtest smoke: skipping ahead");
      await clickText(gm, "button", /^Advance scene$/);
      await waitFor(
        table,
        `document.querySelector(".scene-card h2")?.textContent !== ${JSON.stringify(before)}`,
        30000,
        "table scene changed",
      );
      await shot(table, "table-next-scene");
      await shot(gm, "gm-next-scene");
    });

    await step(
      "every device layout has no horizontal overflow at 375/768/1024/1280/1920",
      async () => {
        const table2 = {};
        for (const device of [gm, player, table]) {
          const original = [device.width, device.height];
          table2[device.name] = {};
          for (const [w, h] of [
            [375, 812],
            [768, 1024],
            [1024, 768],
            [1280, 800],
            [1920, 1080],
          ]) {
            await setViewport(device, w, h);
            table2[device.name][w] = await overflowPx(device);
          }
          await setViewport(device, ...original);
        }
        report.responsiveOverflow = table2;
        const bad = Object.entries(table2).flatMap(([d, byWidth]) =>
          Object.entries(byWidth)
            .filter(([, v]) => v > 1)
            .map(([w, v]) => `${d}@${w}: ${v}px`),
        );
        if (bad.length > 0) throw new Error(`horizontal overflow: ${bad.join(", ")}`);
        return table2;
      },
    );

    // Review F4-F7 (docs/reviews/2026-09-18-staging-independent-playtest-review.md).
    await step("page title, GM invite copy, and unauthorized-seat guidance", async () => {
      const title = await ev(gm, `document.title`);
      if (/fixture/i.test(title)) throw new Error(`live build title mentions fixture: "${title}"`);
      const invite = await ev(gm, `document.querySelector(".invite-panel")?.textContent ?? ""`);
      if (/neither is shown/i.test(invite)) throw new Error(`invite copy is stale: "${invite}"`);
      if (!/passphrase is shown only when you create/i.test(invite)) {
        throw new Error(`invite copy does not explain the passphrase: "${invite}"`);
      }
      const roomId = await ev(player, `location.hash.match(/room\\/([^/]+)\\/player/)?.[1] ?? ""`);
      if (!roomId) throw new Error("could not read the room id from the player route");
      await goto(player, `#/room/${roomId}/gm`);
      await waitFor(
        player,
        `document.body.textContent.includes("player seat")`,
        15000,
        "GM guidance",
      );
      const guidance = await ev(player, `document.body.textContent`);
      if (/can.t do that from this seat/i.test(guidance))
        throw new Error("terse GM refusal is back");
      if ((await ev(player, `document.querySelectorAll("h1").length`)) !== 1) {
        throw new Error("unauthorized GM page must have exactly one h1");
      }
      await shot(player, "gm-route-as-player");
      await clickText(player, "button", /^Go to your dashboard$/);
      await waitFor(player, `location.hash.endsWith("/player")`, 15000, "back on the dashboard");
    });

    await step("landing Resume goes straight to the claimed dashboard with one h1", async () => {
      await goto(player, "#/");
      // Record every route the click passes through; a `/claim/` entry means Resume detoured via the picker.
      await ev(
        player,
        `(() => { window.__hashLog = [location.hash]; window.addEventListener("hashchange", () => window.__hashLog.push(location.hash)); return true; })()`,
      );
      await clickText(player, "button", /^Resume session$/);
      await waitFor(
        player,
        `location.hash.endsWith("/player") && document.querySelector("h1")?.textContent === "Player dashboard"`,
        30000,
        "dashboard after Resume",
      );
      await waitFor(
        player,
        `document.body.textContent.includes("Choose an action") || document.body.textContent.includes("Declared")`,
        30000,
        "dashboard content after Resume",
      );
      const h1s = await ev(player, `document.querySelectorAll("h1").length`);
      if (h1s !== 1) throw new Error(`expected exactly one h1 on the player dashboard, saw ${h1s}`);
      const hashLog = await ev(player, `window.__hashLog`);
      if (hashLog.some((hash) => hash.includes("/claim/"))) {
        throw new Error(`Resume passed through the character picker: ${hashLog.join(" -> ")}`);
      }
      await shot(player, "resume-dashboard");
    });

    if (DO_RELOAD) {
      await step("player reload restores the seat and dashboard without re-joining", async () => {
        await ev(player, `location.reload()`);
        await waitFor(player, `document.readyState === "complete"`, 20000);
        await waitFor(
          player,
          `document.body.textContent.includes("Choose an action")`,
          30000,
          "dashboard after reload",
        );
        await shot(player, "after-reload");
      });
    }
  } catch {
    failed = true;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.deviceFailures = collectDeviceFailures(allDevices);
    report.ok = !failed && report.steps.every((s) => s.ok) && report.deviceFailures.length === 0;
    report.consoleByDevice = Object.fromEntries(
      allDevices.map((d) => [
        d.name,
        { consoleErrors: d.consoleErrors, failedRequests: d.failedRequests },
      ]),
    );
    writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
    try {
      cdp?.ws.close();
    } catch {
      /* ignore */
    }
    chrome.kill();
    for (const reason of report.deviceFailures) console.log(`FAIL device: ${reason}`);
    console.log(report.ok ? "ALL STEPS PASSED" : "SMOKE FAILED");
    process.exit(report.ok ? 0 : 1);
  }
}

main();
