#!/usr/bin/env node
// Real-browser probe: does the GM correction sheet survive a viewport change while it holds input?
//
// A phone rotates, a tablet enters split view, a desktop window is resized, and a browser's dynamic
// chrome changes the layout viewport, all while a GM is half-way through a correction. ui-audit.mjs sizes
// the sheet at each viewport but opens a FRESH sheet per size, so it cannot see whether one live sheet
// keeps its state and its containment across the change. This drives the REAL app (live mode against the
// Firebase emulators) and, with ONE sheet left open and a reason typed, a Blood delta stepped and focus in
// the reason field, resizes the page 390x844 -> 844x390 -> 768x1024 -> 1280x800 -> 320x568 -> 390x844 and
// at every size asserts:
//
//   A. the sheet is still open and still the same one (typed reason and Blood preview preserved);
//   B. the sheet and its backdrop (at most 16px short of the layout width: the page's ~15px stable scrollbar gutter, documented in
//      styles.css) sit inside the layout viewport (no horizontal overflow, no off-screen
//      edge), and root scrolling is locked behind it (`html.sheet-open`);
//   C. the footer's Apply and Cancel are reachable: after scrolling the sheet to its end both are fully
//      inside the viewport and at least 44px tall;
//   D. focus is still inside the dialog.
//   F. Back with the sheet open closes only the sheet (the console stays mounted; before the fix it left
//      the route and lost the typed reason). Run against a pre-fix bundle this is the negative control.
//   E. Escape closes the sheet and leaves no dead history entry (the very next Back leaves the route).
//
// Usage (needs the emulators and a build served by `vite preview`, see docs/RUNBOOK.md):
//   node scripts/playtest/sheet-viewport-probe.mjs --base http://127.0.0.1:4173 [--port 9380] [--shots DIR]
//
// LIMIT: a CDP metrics override resizes the LAYOUT viewport only (what Chrome Android's
// interactive-widget=resizes-content does); it cannot shrink the visual viewport alone the way iOS Safari's
// keyboard does (see ios-simulator/README.md). No npm dependency; Node's WebSocket speaks CDP.

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
const PORT = Number(arg("port", "9380"));
const SHOTS = arg("shots", "");
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id === undefined) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
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

const profile = mkdtempSync(join(tmpdir(), "digitable-viewport-probe-"));
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

const results = [];
let exitCode = 0;
try {
  const cdp = await Cdp.connect(PORT);
  const { browserContextId } = await cdp.send("Target.createBrowserContext", {
    disposeOnDetach: true,
  });
  const { targetId } = await cdp.send("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  for (const domain of ["Page", "Runtime"]) await cdp.send(`${domain}.enable`, {}, sessionId);
  await cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
    sessionId,
  );
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true }, sessionId);

  const ev = async (expression) => {
    const result = await cdp.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
      );
    }
    return result.result.value;
  };
  const waitFor = async (expression, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        if (await ev(`Boolean(${expression})`)) return;
      } catch {
        /* page navigating */
      }
      await sleep(150);
    }
    throw new Error(`timed out waiting for: ${expression}`);
  };
  const click = async (selector, pattern) => {
    const finder = `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e => ${pattern}.test(e.textContent.trim()) && !e.disabled)`;
    await waitFor(finder);
    await ev(
      `(() => { const el = ${finder}; el.scrollIntoView({ block: "center" }); el.click(); return true; })()`,
    );
  };
  const setInput = async (selector, value) => {
    await waitFor(`document.querySelector(${JSON.stringify(selector)})`);
    await ev(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
  };
  const navigate = async (hash) => {
    await cdp.send("Page.navigate", { url: `${BASE}/${hash}` }, sessionId);
    await waitFor(`document.readyState === "complete"`);
  };
  const snapshot = () =>
    ev(`({
      hash: location.hash,
      dialog: !!document.querySelector('[role="dialog"]'),
      console: document.body.textContent.includes("Scene director"),
      reason: document.querySelector("#correction-reason")?.value ?? null,
    })`);
  const back = async () => {
    await ev(`history.back()`);
    await sleep(900);
  };
  const openSheet = async () => {
    await click("button", /^Correct$/);
    await waitFor(`document.querySelector('[role="dialog"]')`);
  };
  const record = (name, ok, detail) => {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : ` ${JSON.stringify(detail)}`}`);
  };

  await navigate("#/");
  await navigate("#/create");
  await setInput("#session-name", "Viewport Probe");
  await setInput("#passphrase", "probe-pass-1");
  await setInput("#creator-display-name", "Gamemaster");
  await click("button", /^Create session$/);
  await waitFor(`document.querySelector(".reveal-card")`, 30000);
  await ev(`document.querySelector("#wrote-down").click()`);
  await click("button", /ready.*continue/i);
  await click("button", /Open the director console/);
  await waitFor(`document.body.textContent.includes("Scene director")`, 30000);
  await click("button", /^Load scene$/);
  await waitFor(`document.body.textContent.includes("round 1")`, 30000);
  const route = (await snapshot()).hash;

  await openSheet();
  await setInput("#correction-reason", "typed across a resize");
  await ev(
    `document.querySelector('[role="dialog"] button[aria-label="Increase Blood change"]').click()`,
  );
  await ev(`document.querySelector("#correction-reason").focus()`);
  const preview = () =>
    ev(
      `document.querySelector('[role="dialog"] [role="status"]')?.textContent.replace(/\\s+/g," ").trim()`,
    );
  const basePreview = await preview();
  const shot = async (name) => {
    if (!SHOTS) return;
    const { data } = await cdp.send(
      "Page.captureScreenshot",
      { format: "jpeg", quality: 70 },
      sessionId,
    );
    writeFileSync(join(SHOTS, `${name}.jpg`), Buffer.from(data, "base64"));
  };

  const SIZES = [
    ["phone-landscape 844x390", 844, 390, true],
    ["tablet 768x1024", 768, 1024, true],
    ["desktop 1280x800", 1280, 800, false],
    ["table 1920x1080", 1920, 1080, false],
    ["phone-small 320x568", 320, 568, true],
    ["phone 390x844", 390, 844, true],
  ];
  for (const [name, width, height, mobile] of SIZES) {
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 2, mobile },
      sessionId,
    );
    await sleep(500);
    const state = await ev(`(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return { open: false };
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const inside = (r) => r.left >= -0.5 && r.right <= vw + 0.5 && r.top >= -0.5 && r.bottom <= vh + 0.5;
      const sheet = dialog.getBoundingClientRect();
      const backdrop = dialog.parentElement.getBoundingClientRect();
      const scroller = dialog.querySelector(".sheet-body");
      for (const el of [scroller, dialog]) el.scrollTop = el.scrollHeight;
      const buttons = [...dialog.querySelectorAll(".sheet-footer button")].map((b) => {
        const r = b.getBoundingClientRect();
        return { text: b.textContent.trim(), inside: inside(r), h: Math.round(r.height), w: Math.round(r.width) };
      });
      return {
        open: true,
        reason: document.querySelector("#correction-reason")?.value,
        sheetInside: inside(sheet),
        sheetRect: [sheet.left, sheet.top, sheet.right, sheet.bottom].map(Math.round),
        backdropRect: [backdrop.left, backdrop.top, backdrop.width, backdrop.height].map(Math.round),
        vvStyle: dialog.parentElement.getAttribute('style'),
        visual: window.visualViewport ? [visualViewport.width, visualViewport.height, visualViewport.scale, visualViewport.offsetTop].map(Math.round) : null,
        backdropCovers: backdrop.width >= vw - 16 && backdrop.width <= vw + 1 && backdrop.height >= vh - 1 && backdrop.height <= vh + 1,
        pageOverflowX: document.documentElement.scrollWidth > vw + 1,
        rootLocked: document.documentElement.classList.contains("sheet-open") && getComputedStyle(document.documentElement).overflow === "hidden",
        buttons,
        focusInside: dialog.contains(document.activeElement),
        vw, vh,
      };
    })()`);
    await shot(`sheet-${name.split(" ")[0]}`);
    const status = await preview();
    const ok =
      state.open &&
      state.reason === "typed across a resize" &&
      Boolean(basePreview) &&
      status === basePreview &&
      state.rootLocked &&
      state.sheetInside &&
      state.backdropCovers &&
      !state.pageOverflowX &&
      state.buttons.length === 2 &&
      state.buttons.every((b) => b.inside && b.h >= 44) &&
      state.focusInside;
    record(`${name}: one live sheet keeps state, containment, reachable actions, focus`, ok, {
      state,
      status,
      basePreview,
    });
  }

  // F. Back with the sheet open (still at 390x844 with the typed reason) closes only the sheet.
  await shot("sheet-before-back");
  await back();
  await shot("after-back");
  const afterF = await snapshot();
  record(
    "F. Back with the sheet open closes only the sheet (console still mounted, same route)",
    !afterF.dialog && afterF.console && afterF.hash === route,
    { afterF },
  );
  if (afterF.hash !== route) throw new Error("Back left the route; later scenarios do not apply");
  await openSheet();

  // E. Escape closes and leaves no dead history entry.
  await ev(
    `document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`,
  );
  await waitFor(`!document.querySelector('[role="dialog"]')`);
  await sleep(300);
  const afterEsc = await snapshot();
  await back();
  const afterBack = await snapshot();
  record(
    "E. Escape closes the sheet; the very next Back leaves the route (no dead entry)",
    !afterEsc.dialog && afterEsc.hash === route && afterBack.hash !== route,
    { afterEsc, afterBack },
  );

  exitCode = results.every((r) => r.ok) ? 0 : 1;
} catch (error) {
  console.error(String(error));
  exitCode = 2;
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(exitCode);
