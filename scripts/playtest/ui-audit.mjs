#!/usr/bin/env node
// Real-browser UI/UX audit for the reskin (issue #14, sonnet-d). Drives the REAL app (live mode
// against the local Firebase emulators, exactly like scripts/playtest/two-device-smoke.mjs) through
// one full session, and at every meaningful screen state, at every viewport in VIEWPORTS:
//
//   * captures a full-page screenshot (before/after evidence),
//   * checks horizontal overflow,
//   * checks every interactive control: >= 44px practical touch target, fully inside the viewport
//     horizontally, and >= 16px type for text-entry controls (below that iOS zooms the page),
//   * runs axe-core (WCAG 2.x A/AA + best-practice, INCLUDING colour contrast, which jsdom cannot).
//
// It then audits the one modal pop-out (the GM correction sheet) separately: containment inside the
// viewport at phone/landscape/tablet/desktop sizes; an emulated on-screen keyboard; real-Chrome
// pinch-zoom (both Emulation.setPageScaleFactor and a synthesized two-finger gesture, which proves the
// sheet does not disable page zoom); emulated safe-area insets (notch, home indicator) at a width where
// they actually constrain the sheet; 200% text on a 320px phone; internal scrolling to the last
// control; and prefers-reduced-motion on/off (motion must exist when allowed and be absent when not).
//
// KNOWN LIMIT (recorded, not hidden): the "keyboard" emulation shrinks the LAYOUT viewport, which is
// what Chrome Android's `interactive-widget=resizes-content` does; there the visual-viewport hook
// correctly does nothing. The iOS-Safari case (visual viewport shrinks while the layout viewport does
// not) cannot be produced by headless Chrome (Emulation.setVisibleSizeOverride no longer exists). Its
// mechanism is covered in jsdom (apps/web/test/shared/SheetDialog.test.tsx) and, as far as the
// sheet's *use* of the --vv-* variables goes, in a real engine by the pinch-zoom scenarios. A physical
// iPhone pass remains open (CLAUDE_HANDOFF.md).
//
// No npm dependency beyond axe-core (already a transitive dependency of jest-axe): launches the
// machine's Google Chrome headless and speaks CDP over Node 22's built-in WebSocket.
//
// Usage:
//   node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4174 --label after \
//     --out docs/evidence/sonnet-d-reskin/after [--port 9350] [--shots]
//
// `--shots` writes screenshots (default on; pass --no-shots to skip). Writes report.json and exits
// 1 if any hard check fails. `--tolerate-baseline` records failures without failing the exit code
// (used to record the pre-reskin "before" numbers).

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
}
const BASE = arg("base", "http://127.0.0.1:4174").replace(/\/$/, "");
const OUT = arg("out", "ui-audit-run");
const LABEL = arg("label", "run");
const PORT = Number(arg("port", "9350"));
const SHOTS = !args.includes("--no-shots");
const TOLERATE = args.includes("--tolerate-baseline");
const MODAL_ONLY = args.includes("--modal-only"); // skip the per-state sweep (fast iteration on the pop-out)
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
mkdirSync(OUT, { recursive: true });

const require = createRequire(import.meta.url);
let AXE_SOURCE;
try {
  AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
} catch {
  console.error(
    "axe-core not found. It is installed as a dependency of jest-axe: run `npm ci` at the repo root.",
  );
  process.exit(2);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** name, width, height, mobile emulation */
const VIEWPORTS = [
  { name: "phone-small", width: 320, height: 568, mobile: true },
  { name: "phone", width: 375, height: 812, mobile: true },
  { name: "phone-landscape", width: 812, height: 375, mobile: true },
  { name: "tablet", width: 768, height: 1024, mobile: true },
  { name: "desktop", width: 1280, height: 800, mobile: false },
  { name: "table", width: 1920, height: 1080, mobile: false },
];
const byName = Object.fromEntries(VIEWPORTS.map((v) => [v.name, v]));

const report = {
  label: LABEL,
  base: BASE,
  startedAt: new Date().toISOString(),
  states: [],
  modal: [],
  reducedMotion: null,
  routes: [],
  failures: [],
  console: {},
};

function fail(scope, message) {
  report.failures.push({ scope, message });
  console.log(`FAIL ${scope}: ${message}`);
}

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

const devices = [];

async function openDevice(cdp, name, vp) {
  const { browserContextId } = await cdp.send("Target.createBrowserContext", {
    disposeOnDetach: true,
  });
  const { targetId } = await cdp.send("Target.createTarget", {
    url: "about:blank",
    browserContextId,
  });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const device = { name, cdp, sessionId, vp, consoleErrors: [], failedRequests: [] };
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
    } else if (message.method === "Network.loadingFailed" && !message.params.canceled) {
      device.failedRequests.push(message.params.errorText);
    }
  });
  for (const domain of ["Page", "Runtime", "Network"])
    await cdp.send(`${domain}.enable`, {}, sessionId);
  await applyViewport(device, vp);
  devices.push(device);
  return device;
}

async function applyViewport(device, vp) {
  await device.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.mobile,
    },
    device.sessionId,
  );
  await device.cdp.send(
    "Emulation.setTouchEmulationEnabled",
    { enabled: vp.mobile },
    device.sessionId,
  );
  device.vp = vp;
  await sleep(200);
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

async function waitFor(device, expression, timeoutMs = 30000, label = expression) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await ev(device, `Boolean(${expression})`)) return;
    } catch {
      /* navigating */
    }
    await sleep(150);
  }
  throw new Error(`[${device.name}] timed out waiting for: ${label}`);
}

async function goto(device, path) {
  await device.cdp.send("Page.navigate", { url: `${BASE}/${path}` }, device.sessionId);
  await waitFor(device, `document.readyState === "complete"`, 20000, `load ${path}`);
  await sleep(350);
}

const textMatch = (selector, pattern) =>
  `[...document.querySelectorAll(${JSON.stringify(selector)})].find(e => ${pattern}.test(e.textContent.trim()) && !e.disabled)`;

async function settle(device) {
  try {
    await waitFor(device, `!document.body.textContent.includes("awaiting confirmation")`, 10000);
  } catch {
    /* the click will surface the real state */
  }
}

async function clickText(device, selector, pattern, timeoutMs = 30000) {
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

async function screenshot(device, file, { fullPage = true } = {}) {
  if (!SHOTS) return null;
  await ev(
    device,
    `(async () => { const step = Math.max(200, innerHeight - 100); for (let y = 0; y < document.documentElement.scrollHeight; y += step) { scrollTo(0, y); await new Promise(r => setTimeout(r, 80)); } scrollTo(0, 0); })()`,
  );
  await sleep(350);
  const params = { format: "jpeg", quality: 70 };
  if (fullPage) {
    const metrics = await device.cdp.send("Page.getLayoutMetrics", {}, device.sessionId);
    const width = Math.ceil(metrics.cssContentSize.width);
    const height = Math.min(Math.ceil(metrics.cssContentSize.height), 6000);
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width, height, scale: 1 };
  }
  const { data } = await device.cdp.send("Page.captureScreenshot", params, device.sessionId);
  writeFileSync(join(OUT, file), Buffer.from(data, "base64"));
  return file;
}

/** In-page geometry audit of every interactive control. Runs against whatever is on screen. */
const CONTROL_AUDIT = `(() => {
  const vw = document.documentElement.clientWidth;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[inert]");
  };
  const describe = (el) => {
    const id = el.id ? "#" + el.id : "";
    const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\\s+/).join(".") : "";
    const text = (el.getAttribute("aria-label") || el.textContent || el.value || "").trim().slice(0, 32);
    return el.tagName.toLowerCase() + id + cls + (text ? ' "' + text + '"' : "");
  };
  const issues = [];
  let count = 0;
  const selector = 'button, a[href], select, textarea, input, summary, [role="spinbutton"], [role="button"]';
  for (const el of document.querySelectorAll(selector)) {
    if (!visible(el) || el.closest("svg")) continue;
    count += 1;
    const isCheck = el.matches('input[type="checkbox"], input[type="radio"]');
    const box = isCheck ? el.closest("label") || el : el;
    const r = box.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const found = [];
    if (Math.min(r.width, r.height) < 43.5) found.push("target " + Math.round(r.width) + "x" + Math.round(r.height));
    if (r.right > vw + 0.5 || r.left < -0.5) found.push("outside viewport (" + Math.round(r.left) + ".." + Math.round(r.right) + " of " + vw + ")");
    if (el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea') && parseFloat(cs.fontSize) < 16) found.push("font-size " + cs.fontSize);
    if (found.length) issues.push({ control: describe(el), problems: found });
  }
  const de = document.documentElement;
  return { controls: count, overflowPx: de.scrollWidth - de.clientWidth, issues };
})()`;

async function runAxe(device) {
  if (!(await ev(device, `typeof axe !== "undefined"`))) {
    await ev(device, AXE_SOURCE.replace(/\n\/\/# sourceMappingURL=.*$/, ""));
  }
  return ev(
    device,
    `axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] },
      resultTypes: ["violations"],
    }).then(r => r.violations.map(v => ({
      id: v.id, impact: v.impact, tags: v.tags.filter(t => t.startsWith("wcag") || t === "best-practice"),
      help: v.help, nodes: v.nodes.slice(0, 4).map(n => (n.target || []).join(" ") + " :: " + (n.failureSummary || "").split("\\n").slice(1, 3).join(" ").slice(0, 160)),
      count: v.nodes.length,
    })))`,
  );
}

function isHardAxe(violation) {
  // Best-practice rules are reported but only WCAG rules fail the run.
  return violation.tags.some((t) => t.startsWith("wcag"));
}

/**
 * Screenshot + audit one on-screen state at every viewport, then restore the device's own viewport.
 * `axeViewports` limits the (slower) axe pass to a representative subset.
 */
async function captureState(device, state, { axeViewports = ["phone", "tablet", "desktop"] } = {}) {
  if (MODAL_ONLY) return;
  const original = device.vp;
  for (const vp of VIEWPORTS) {
    await applyViewport(device, vp);
    await sleep(250);
    const audit = await ev(device, CONTROL_AUDIT);
    const file = await screenshot(device, `${device.name}-${state}-${vp.name}.jpg`);
    const entry = {
      surface: device.name,
      state,
      viewport: vp.name,
      size: `${vp.width}x${vp.height}`,
      controls: audit.controls,
      overflowPx: audit.overflowPx,
      controlIssues: audit.issues,
      screenshot: file,
    };
    if (axeViewports.includes(vp.name)) {
      entry.axe = await runAxe(device);
      for (const v of entry.axe.filter(isHardAxe)) {
        fail(
          `${device.name}/${state}@${vp.name}`,
          `axe ${v.id} (${v.impact}) x${v.count}: ${v.nodes[0]}`,
        );
      }
    }
    if (audit.overflowPx > 1) {
      fail(`${device.name}/${state}@${vp.name}`, `horizontal overflow ${audit.overflowPx}px`);
    }
    for (const issue of audit.issues) {
      fail(`${device.name}/${state}@${vp.name}`, `${issue.control}: ${issue.problems.join("; ")}`);
    }
    report.states.push(entry);
  }
  await applyViewport(device, original);
}

// ---------- modal (correction sheet) audit ----------

const MODAL_GEOMETRY = `(() => {
  const vv = window.visualViewport;
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return { open: false };
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
  const body = dialog.querySelector(".sheet-body") || dialog;
  const apply = [...dialog.querySelectorAll("button")].find(b => /apply correction/i.test(b.textContent));
  const cancel = [...dialog.querySelectorAll("button")].find(b => /cancel/i.test(b.textContent));
  const reason = dialog.querySelector("#correction-reason");
  const cs = getComputedStyle(dialog);
  return {
    open: true,
    layout: { innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth },
    visual: vv ? { offsetTop: vv.offsetTop, offsetLeft: vv.offsetLeft, width: vv.width, height: vv.height, scale: vv.scale } : null,
    dialog: box(dialog),
    apply: box(apply),
    cancel: box(cancel),
    reason: box(reason),
    body: { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollTop: body.scrollTop, overflowY: getComputedStyle(body).overflowY },
    rootLocked: document.documentElement.classList.contains("sheet-open") && getComputedStyle(document.documentElement).overflow === "hidden",
    pageOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    animationName: cs.animationName,
    background: cs.backgroundColor,
    inertSiblings: (() => { const sibs = [...document.body.children].filter(c => !c.contains(dialog) && c.tagName !== "SCRIPT"); return sibs.length > 0 && sibs.every(c => c.hasAttribute("inert")); })(),
    activeIsInside: dialog.contains(document.activeElement),
  };
})()`;

function within(box, frame, tolerance = 1) {
  return (
    box &&
    box.left >= frame.left - tolerance &&
    box.right <= frame.right + tolerance &&
    box.top >= frame.top - tolerance &&
    box.bottom <= frame.bottom + tolerance
  );
}

async function openCorrection(gm) {
  const finder = `[...document.querySelectorAll(".roster-panel-list li")].find(li => /^rook/i.test(li.textContent.trim()))?.querySelector("button")`;
  await waitFor(gm, finder, 20000, "Rook's Correct button");
  await ev(
    gm,
    `(() => { const b = ${finder}; b.scrollIntoView({ block: "center" }); b.focus(); b.click(); return true; })()`,
  );
  await waitFor(gm, `document.querySelector('[role="dialog"]')`, 10000, "correction dialog");
  await sleep(350);
}

async function closeCorrection(gm) {
  await ev(
    gm,
    `[...document.querySelectorAll('[role="dialog"] button')].find(b => /cancel/i.test(b.textContent))?.click()`,
  );
  await waitFor(gm, `!document.querySelector('[role="dialog"]')`, 10000, "dialog closed");
}

async function auditModal(gm) {
  await applyViewport(gm, byName["desktop"]);
  const cases = [
    { name: "phone-small", ...byName["phone-small"] },
    { name: "phone", ...byName["phone"] },
    { name: "phone-landscape", ...byName["phone-landscape"] },
    { name: "phone-667x375", width: 667, height: 375, mobile: true },
    { name: "tablet", ...byName["tablet"] },
    { name: "desktop", ...byName["desktop"] },
  ];
  for (const vp of cases) {
    await applyViewport(gm, vp);
    await openCorrection(gm);
    const record = { viewport: vp.name, size: `${vp.width}x${vp.height}`, checks: {} };
    const geo = await ev(gm, MODAL_GEOMETRY);
    record.geometry = geo;
    const frame = { left: 0, top: 0, right: vp.width, bottom: vp.height };
    record.checks.dialogInsideViewport = within(geo.dialog, frame);
    record.checks.actionsVisibleWithoutScrolling =
      within(geo.apply, frame) && within(geo.cancel, frame);
    record.checks.noPageOverflow = geo.pageOverflowPx <= 1;
    record.checks.actionTargets44 =
      geo.apply?.height >= 43.5 && geo.cancel?.height >= 43.5 && geo.apply?.width >= 43.5;
    // Scroll the sheet body to its end; the last control must then be reachable and visible.
    if (geo.body.scrollHeight > geo.body.clientHeight) {
      await ev(
        gm,
        `(() => { const b = document.querySelector('[role="dialog"] .sheet-body') || document.querySelector('[role="dialog"]'); b.scrollTop = b.scrollHeight; })()`,
      );
      await sleep(150);
    }
    const end = await ev(gm, MODAL_GEOMETRY);
    record.checks.reasonReachableAfterScroll = within(end.reason, {
      left: 0,
      top: 0,
      right: vp.width,
      bottom: end.apply ? end.apply.top + 1 : vp.height,
    });
    record.checks.rootScrollLocked = geo.rootLocked;
    record.checks.backgroundInert = geo.inertSiblings;
    record.checks.focusInsideDialog = geo.activeIsInside;
    record.screenshot = await screenshot(gm, `gm-correction-sheet-${vp.name}.jpg`, {
      fullPage: false,
    });

    // Emulated on-screen keyboard: shrink the viewport (what Chrome Android's
    // interactive-widget=resizes-content does) with the reason field focused.
    if (vp.mobile) {
      await ev(gm, `document.querySelector("#correction-reason").focus()`);
      const keyboardHeight = Math.round(vp.height * 0.45);
      const shrunk = { ...vp, height: vp.height - keyboardHeight };
      await applyViewport(gm, shrunk);
      await sleep(400);
      const kb = await ev(gm, MODAL_GEOMETRY);
      const kbFrame = { left: 0, top: 0, right: shrunk.width, bottom: shrunk.height };
      record.keyboard = {
        size: `${shrunk.width}x${shrunk.height}`,
        checks: {
          dialogInsideViewport: within(kb.dialog, kbFrame),
          focusedFieldVisible: within(kb.reason, kbFrame),
          actionsVisible: within(kb.apply, kbFrame) && within(kb.cancel, kbFrame),
          noPageOverflow: kb.pageOverflowPx <= 1,
        },
      };
      record.keyboard.screenshot = await screenshot(gm, `gm-correction-keyboard-${vp.name}.jpg`, {
        fullPage: false,
      });
      await applyViewport(gm, vp);
    }
    for (const [k, v] of Object.entries(record.checks)) {
      if (!v) fail(`modal@${vp.name}`, `${k} failed`);
    }
    for (const [k, v] of Object.entries(record.keyboard?.checks ?? {})) {
      if (!v) fail(`modal-keyboard@${vp.name}`, `${k} failed`);
    }
    report.modal.push(record);
    await closeCorrection(gm);
    // Focus must return to the trigger, and the background must no longer be inert.
    const afterClose = await ev(
      gm,
      `({ focusOnTrigger: document.activeElement?.tagName === "BUTTON" && /correct/i.test(document.activeElement.textContent), anyInert: [...document.body.children].some(c => c.hasAttribute("inert")), rootLocked: document.documentElement.classList.contains("sheet-open") })`,
    );
    record.afterClose = afterClose;
    if (!afterClose.focusOnTrigger) fail(`modal@${vp.name}`, "focus did not return to trigger");
    if (afterClose.anyInert) fail(`modal@${vp.name}`, "background still inert after close");
    if (afterClose.rootLocked) fail(`modal@${vp.name}`, "root scroll lock left on after close");
  }

  // ---- Scenarios that layout-viewport resizing cannot reach. Each MUST execute at least one check;
  // an exception, or an emulation this Chrome cannot perform, is a FAILURE and never a silent skip. ----
  async function scenario(name, viewport, body, { informational = false } = {}) {
    const record = {
      viewport: viewport.name,
      size: `${viewport.width}x${viewport.height}`,
      scenario: name,
      checks: {},
      notes: [],
    };
    try {
      await applyViewport(gm, viewport);
      await body(record);
    } catch (error) {
      fail(`modal-${name}`, `scenario threw: ${error.message}`);
      record.notes.push(`threw: ${error.message}`);
    }
    if (Object.keys(record.checks).length === 0) fail(`modal-${name}`, "no checks were executed");
    record.informational = informational;
    for (const [k, v] of Object.entries(record.checks)) {
      if (v) continue;
      if (informational) console.log(`INFO modal-${name}: ${k} failed (recorded, not gating)`);
      else fail(`modal-${name}`, `${k} failed`);
    }
    report.modal.push(record);
    // Best-effort cleanup so one scenario cannot leak state into the next.
    for (const [method, params] of [
      ["Emulation.setPageScaleFactor", { pageScaleFactor: 1 }],
      ["Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, left: 0, right: 0, bottom: 0 } }],
    ]) {
      try {
        await gm.cdp.send(method, params, gm.sessionId);
      } catch {
        /* not applied in this scenario */
      }
    }
    await ev(gm, `document.documentElement.style.fontSize = ""`);
    if (await ev(gm, `Boolean(document.querySelector('[role="dialog"]'))`))
      await closeCorrection(gm);
  }

  const frameOf = (vp) => ({ left: 0, top: 0, right: vp.width, bottom: vp.height });

  await scenario("zoom-emulated", byName["phone"], async (record) => {
    await openCorrection(gm);
    await gm.cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1.6 }, gm.sessionId);
    await sleep(500);
    const zoom = await ev(gm, MODAL_GEOMETRY);
    const v = zoom.visual;
    record.geometry = zoom;
    record.checks.pageScaleApplied = Boolean(v && v.scale > 1.01);
    if (!record.checks.pageScaleApplied) return;
    const frame = {
      left: v.offsetLeft,
      top: v.offsetTop,
      right: v.offsetLeft + v.width,
      bottom: v.offsetTop + v.height,
    };
    record.checks.dialogInsideVisualViewportWhenZoomed = within(zoom.dialog, frame, 2);
    record.checks.actionsInsideVisualViewportWhenZoomed =
      within(zoom.apply, frame, 2) && within(zoom.cancel, frame, 2);
  });

  await scenario("pinch-gesture", byName["phone"], async (record) => {
    await openCorrection(gm);
    const before = await ev(gm, `visualViewport.scale`);
    await gm.cdp.send(
      "Input.synthesizePinchGesture",
      { x: 187, y: 400, scaleFactor: 2, relativeSpeed: 400, gestureSourceType: "touch" },
      gm.sessionId,
    );
    await sleep(700);
    const after = await ev(gm, `visualViewport.scale`);
    record.scaleBefore = before;
    record.scaleAfter = after;
    // With the sheet open, a two-finger pinch must still zoom the page (WCAG 1.4.4).
    record.checks.pinchZoomStillWorksWithSheetOpen = after > before * 1.2;
  });

  for (const [name, vp, insets, expect] of [
    [
      "safe-area-landscape-constrained",
      { name: "phone-667x375", width: 667, height: 375, mobile: true },
      { top: 0, left: 47, right: 47, bottom: 21 },
      "sides",
    ],
    [
      "safe-area-landscape-812",
      byName["phone-landscape"],
      { top: 0, left: 47, right: 47, bottom: 21 },
      "sides",
    ],
    ["safe-area-portrait", byName["phone"], { top: 47, left: 0, right: 0, bottom: 34 }, "vertical"],
  ]) {
    await scenario(name, vp, async (record) => {
      await gm.cdp.send("Emulation.setSafeAreaInsetsOverride", { insets }, gm.sessionId);
      await openCorrection(gm);
      const geo = await ev(gm, MODAL_GEOMETRY);
      const footerPad = await ev(
        gm,
        `parseFloat(getComputedStyle(document.querySelector(".sheet-footer")).paddingBottom)`,
      );
      record.geometry = geo;
      record.footerPaddingBottom = footerPad;
      record.checks.dialogInsideViewport = within(geo.dialog, frameOf(vp));
      record.checks.footerClearsHomeIndicator = footerPad >= insets.bottom + 4;
      if (expect === "sides") {
        record.checks.sheetClearOfLeftInset = geo.dialog.left >= insets.left - 1;
        record.checks.sheetClearOfRightInset = geo.dialog.right <= vp.width - insets.right + 1;
        // The width must actually constrain the sheet, otherwise this check proves nothing.
        record.sheetWidth = geo.dialog.width;
      } else {
        record.checks.sheetClearOfTopInset = geo.dialog.top >= insets.top - 1;
      }
      record.screenshot = await screenshot(gm, `gm-correction-${name}.jpg`, { fullPage: false });
    });
  }

  // Text scaling: what a browser "font size: large/very large" does to every rem. 320px at 150% and
  // 375px at 200% are gating. 320px at 200% is recorded but NOT gating: at that size the (unchanged,
  // rem-padded) panels behind the sheet leave under 70px for a check-box row and overflow the page,
  // which widens the layout viewport; that limit is the console's, not the sheet's, and is listed in
  // the handoff.
  for (const [vp, px, informational] of [
    [byName["phone-small"], 24, false],
    [byName["phone"], 32, false],
    [byName["phone-small"], 32, true],
  ]) {
    await scenario(
      `text-${px === 24 ? "150" : "200"}-${vp.name}`,
      vp,
      async (record) => {
        await ev(gm, `document.documentElement.style.fontSize = "${px}px"`);
        await openCorrection(gm);
        const frame = frameOf(vp);
        const geo = await ev(gm, MODAL_GEOMETRY);
        record.geometry = geo;
        record.checks.dialogInsideViewport = within(geo.dialog, frame);
        record.checks.noPageOverflow = geo.pageOverflowPx <= 1;
        if (geo.pageOverflowPx > 1) {
          record.offenders = await ev(
            gm,
            `(() => { const w = document.documentElement.clientWidth; return [...document.querySelectorAll("body *")].filter(e => (e.getBoundingClientRect().right > w + 1 || e.scrollWidth > e.clientWidth + 1) && getComputedStyle(e).display !== "none").slice(0, 10).map(e => e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.split(" ").join(".") : "") + " right=" + Math.round(e.getBoundingClientRect().right) + " sw=" + e.scrollWidth + "/" + e.clientWidth + " :: " + (e.textContent || "").trim().slice(0, 30)); })()`,
          );
        }
        record.checks.bodyKeepsRoom = geo.body.clientHeight >= 96;
        // The action row may scroll on its own at this size, but its buttons must be reachable.
        await ev(
          gm,
          `(() => { const f = document.querySelector(".sheet-footer"); f.scrollTop = f.scrollHeight; })()`,
        );
        const end = await ev(gm, MODAL_GEOMETRY);
        record.checks.actionsReachable = within(end.apply, frame) && within(end.cancel, frame);
        await ev(
          gm,
          `(() => { const b = document.querySelector(".sheet-body"); b.scrollTop = b.scrollHeight; })()`,
        );
        const bottom = await ev(gm, MODAL_GEOMETRY);
        record.checks.reasonReachable = within(bottom.reason, frame);
        record.textPx = px;
        record.screenshot = await screenshot(
          gm,
          `gm-correction-text-${px === 24 ? "150" : "200"}-${vp.name}.jpg`,
          { fullPage: false },
        );
      },
      { informational },
    );
  }
  await applyViewport(gm, byName["desktop"]);
}

async function auditReducedMotion(gm) {
  const result = { allowed: {}, reduced: {} };
  async function probe() {
    await openCorrection(gm);
    const probeResult = await ev(
      gm,
      `(() => {
        const sheet = document.querySelector(".sheet") || document.querySelector('[role="dialog"]');
        const backdrop = document.querySelector(".sheet-backdrop") || sheet.parentElement;
        const cs = getComputedStyle(sheet);
        const bs = getComputedStyle(backdrop);
        const anyLongTransition = [...document.querySelectorAll("button, input, select, .scene-card-art-image")].some(e => {
          const t = getComputedStyle(e).transitionDuration.split(",").map(parseFloat);
          return t.some(d => d > 0.05);
        });
        return { sheetAnimation: cs.animationName, sheetDuration: cs.animationDuration, backdropAnimation: bs.animationName, anyLongTransition, matches: matchMedia("(prefers-reduced-motion: reduce)").matches };
      })()`,
    );
    await closeCorrection(gm);
    return probeResult;
  }
  await gm.cdp.send(
    "Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] },
    gm.sessionId,
  );
  result.allowed = await probe();
  await gm.cdp.send(
    "Emulation.setEmulatedMedia",
    { features: [{ name: "prefers-reduced-motion", value: "reduce" }] },
    gm.sessionId,
  );
  result.reduced = await probe();
  await gm.cdp.send("Emulation.setEmulatedMedia", { features: [] }, gm.sessionId);
  report.reducedMotion = result;
  if (result.allowed.matches) fail("reduced-motion", "no-preference was not emulated");
  // Positive control: with motion allowed the entrance animation must exist (else the reduced check proves nothing).
  if (result.allowed.sheetAnimation === "none" || result.allowed.backdropAnimation === "none")
    fail(
      "reduced-motion",
      `no entrance animation when motion is allowed: ${JSON.stringify(result.allowed)}`,
    );
  if (!result.reduced.matches) fail("reduced-motion", "reduce preference was not emulated");
  if (result.reduced.sheetAnimation !== "none" || result.reduced.backdropAnimation !== "none")
    fail("reduced-motion", `sheet still animates under reduce: ${JSON.stringify(result.reduced)}`);
  if (result.reduced.anyLongTransition)
    fail("reduced-motion", "a transition longer than 50ms remains under reduce");
}

// ---------- flow ----------

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "digitable-ui-audit-"));
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
  try {
    cdp = await Cdp.connect(PORT);
    const gm = await openDevice(cdp, "gm", byName["desktop"]);
    const player = await openDevice(cdp, "player", byName["phone"]);
    const table = await openDevice(cdp, "table", byName["table"]);
    const anon = await openDevice(cdp, "anon", byName["desktop"]);
    const codes = {};

    // Signed-out routes.
    for (const [name, path] of [
      ["landing", "#/"],
      ["create-form", "#/create"],
      ["join-form", "#/join"],
      ["table-join-form", "#/table"],
    ]) {
      await goto(anon, path);
      await captureState(anon, name);
    }
    for (const path of [
      "#/claim/no-such-room",
      "#/room/no-such-room/gm",
      "#/room/no-such-room/player",
    ]) {
      await goto(anon, path);
      await sleep(900);
      await captureState(anon, `route-${path.replace(/[^a-z]+/gi, "-").replace(/^-|-$/g, "")}`, {
        axeViewports: ["phone"],
      });
    }

    // GM creates the session.
    await goto(gm, "#/create");
    await setInput(gm, "#session-name", "UI Audit Session");
    await setInput(gm, "#passphrase", "audit-pass-1");
    await setInput(gm, "#creator-display-name", "Gamemaster");
    await clickText(gm, "button", /^Create session$/);
    await waitFor(gm, `document.querySelector(".reveal-card")`, 30000, "secrets reveal card");
    const pairs = await ev(
      gm,
      `[...document.querySelectorAll(".reveal-card dt")].map(dt => [dt.textContent.trim(), dt.nextElementSibling.textContent.trim()])`,
    );
    for (const [key, value] of pairs) codes[key] = value;
    await captureState(gm, "secrets-reveal");
    await ev(gm, `document.querySelector("#wrote-down").click()`);
    await clickText(gm, "button", /ready.*continue/i);
    await clickText(gm, "button", /Open the director console/);
    await waitFor(gm, `document.body.textContent.includes("Scene director")`, 30000, "console");
    await captureState(gm, "console-empty");

    await clickText(gm, "button", /^Load scene$/);
    await waitFor(gm, `document.body.textContent.includes("round 1")`, 30000, "scene loaded");

    // Player joins and claims.
    await goto(player, "#/join");
    await setInput(player, "#room-code", codes["Room code"]);
    await setInput(player, "#join-passphrase", "audit-pass-1");
    await setInput(player, "#join-display-name", "Ada");
    await captureState(player, "join-filled");
    await clickText(player, "button", /^Join session$/);
    await waitFor(player, `document.querySelector(".reveal-card")`, 30000, "player reveal");
    await captureState(player, "join-reveal");
    await clickText(player, "button", /wrote it down/);
    await waitFor(player, `document.querySelector(".roster-grid")`, 30000, "roster");
    await captureState(player, "claim-roster");
    await clickText(player, "button", /^Claim$/);
    await clickText(player, "button", /Continue to your dashboard/);
    await waitFor(
      player,
      `document.body.textContent.includes("Choose an action")`,
      30000,
      "compose",
    );
    await captureState(player, "compose");

    // Disclosure: "Why?" opened.
    await ev(player, `document.querySelector("details summary").click()`);
    await sleep(250);
    await captureState(player, "compose-why-open", { axeViewports: ["phone"] });
    await ev(player, `document.querySelector("details summary").click()`);

    // Table connects.
    await goto(table, "#/table");
    await setInput(table, "#table-room-code", codes["Room code"]);
    await setInput(table, "#table-code", codes["Table code"]);
    await clickText(table, "button", /^Connect display$/);
    await clickText(table, "button", /Open the table display/, 30000);
    await waitFor(table, `document.querySelector(".scene-card")`, 30000, "table scene");
    await captureState(table, "idle");

    // GM console with the scene loaded and one claimed character; run the modal/select audit here.
    await waitFor(
      gm,
      `/Characters claimed: 1\\//.test(document.body.textContent)`,
      30000,
      "claimed",
    );
    await captureState(gm, "console-scene-loaded");

    // Player declares; GM sees pending.
    await clickText(player, "button", /^Declare action$/);
    await waitFor(player, `document.body.textContent.includes("Declared")`, 30000, "declared");
    await captureState(player, "declared", { axeViewports: ["phone"] });
    await waitFor(gm, `${textMatch("button", "/^Roll it$/")}`, 30000, "Roll it");
    await captureState(gm, "console-pending");

    await auditModal(gm);
    await auditReducedMotion(gm);

    // GM rolls; player allocates.
    await applyViewport(gm, byName["desktop"]);
    await clickText(gm, "button", /^Roll it$/);
    await waitFor(player, `document.body.textContent.includes("Your roll")`, 30000, "allocation");
    await captureState(player, "allocation");
    await ev(
      player,
      `document.querySelectorAll("fieldset.allocation-die-group").forEach(g => g.querySelector("input[type=radio]")?.click())`,
    );
    await captureState(player, "allocation-assigned", { axeViewports: ["phone"] });
    await clickText(player, "button", /^Confirm allocation$/);
    await waitFor(
      player,
      `document.body.textContent.includes("Resolved") || document.body.textContent.includes("injury")`,
      30000,
      "resolution",
    );
    if (await ev(player, `document.body.textContent.includes("Choose an injury")`)) {
      await captureState(player, "injury-choice", { axeViewports: ["phone"] });
      await ev(player, `document.querySelector("input[type=radio]").click()`);
      await clickText(player, "button", /confirm|choose|apply/i);
      await waitFor(player, `document.body.textContent.includes("Resolved")`, 30000, "resolved");
    }
    await captureState(player, "resolved");
    await clickText(player, "button", /^Back to scene$/);
    await waitFor(player, `document.body.textContent.includes("acted this round")`, 30000, "acted");
    await captureState(table, "after-roll");

    // Paused surface, then the next scene on GM and table.
    await clickText(gm, "button", /^Pause$/);
    await waitFor(player, `document.body.textContent.includes("Paused")`, 30000, "player paused");
    await captureState(player, "paused", { axeViewports: ["phone"] });
    await clickText(gm, "button", /^Resume$/);
    await clickText(gm, "button", /^End round/);
    await waitFor(gm, `document.body.textContent.includes("round 2")`, 30000, "round 2");
    await setInput(gm, "#scene-reason", "UI audit: skipping ahead");
    await clickText(gm, "button", /^Advance scene$/);
    await waitFor(
      table,
      `!document.querySelector(".scene-card h2")?.textContent.includes("Forecourt")`,
      30000,
      "table next scene",
    );
    await captureState(table, "next-scene");
    await captureState(gm, "console-next-scene");
  } catch (error) {
    fail("flow", String(error.message));
  } finally {
    for (const device of devices) {
      report.console[device.name] = {
        consoleErrors: device.consoleErrors,
        failedRequests: device.failedRequests,
      };
      if (device.consoleErrors.length > 0)
        fail(`console/${device.name}`, `${device.consoleErrors.length} console error(s)`);
    }
    report.finishedAt = new Date().toISOString();
    report.ok = report.failures.length === 0;
    report.summary = {
      states: report.states.length,
      controlsAudited: report.states.reduce((n, s) => n + s.controls, 0),
      controlIssues: report.states.reduce((n, s) => n + s.controlIssues.length, 0),
      overflowStates: report.states.filter((s) => s.overflowPx > 1).length,
      axeHardViolations: report.states.reduce(
        (n, s) => n + (s.axe ?? []).filter(isHardAxe).length,
        0,
      ),
      axeBestPractice: report.states.flatMap((s) =>
        (s.axe ?? [])
          .filter((v) => !isHardAxe(v))
          .map((v) => `${s.surface}/${s.state}@${s.viewport}: ${v.id}`),
      ),
      failures: report.failures.length,
    };
    writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2) + "\n");
    try {
      cdp?.ws.close();
    } catch {
      /* ignore */
    }
    chrome.kill();
    console.log(JSON.stringify(report.summary, null, 2));
    console.log(report.ok ? "UI AUDIT PASSED" : "UI AUDIT FOUND PROBLEMS");
    process.exit(report.ok || TOLERATE ? 0 : 1);
  }
}

main();
