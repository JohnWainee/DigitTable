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
  keyboard: [],
  validation: [],
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
    } else if (
      message.method === "Log.entryAdded" &&
      message.params.entry.level === "error" &&
      message.params.entry.source !== "network"
    ) {
      // Messages the browser itself raised (e.g. an invalid `pattern` attribute), which the page's own
      // console.error never sees.
      device.consoleErrors.push(
        `[browser ${message.params.entry.source}] ${message.params.entry.text}`,
      );
    } else if (message.method === "Network.loadingFailed" && !message.params.canceled) {
      device.failedRequests.push(message.params.errorText);
    }
  });
  for (const domain of ["Page", "Runtime", "Network", "Log"])
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
  // Every <button> must carry a reskin class (or be a +/- stepper): a class-less one renders as the
  // browser's own grey button, without the tap size, the type, or the focus treatment.
  const STYLED_BUTTON = ".primary-action, .secondary-action, .link-button, .stepper-controls button";
  // A control's label is wrapped into this many text lines; four or more means it was squeezed.
  const lineCount = (el) => new Set([...(() => { const r = document.createRange(); r.selectNodeContents(el); return r.getClientRects(); })()].map(q => Math.round(q.top))).size;
  const measure = document.createElement("canvas").getContext("2d");
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
    // An interactive control inside a <label> that is not the label's own control: the label's tap
    // area and accessible name swallow it (invalid HTML, and a squeezed target on a phone).
    const label = el.closest("label");
    if (label && label.control !== el && !el.matches("input[type=hidden]")) found.push("interactive control nested inside a <label>");
    if (el.matches("button") && !el.matches(STYLED_BUTTON)) found.push("button without a reskin class (browser-default styling)");
    if (el.matches("button") && !el.closest(".stepper-controls") && lineCount(el) >= 4) found.push("label squeezed onto " + lineCount(el) + " lines");
    // A native select ellipsises its closed value. When the chosen option is wider than the control the
    // decisive part of the label can be cut off, so the full text must be echoed visibly beside it.
    if (el.matches("select") && el.selectedOptions[0]) {
      const text = el.selectedOptions[0].textContent.trim();
      measure.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
      const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2 * parseFloat(cs.borderLeftWidth);
      if (measure.measureText(text).width > inner) {
        const echo = el.id && document.querySelector('[data-select-echo-for="' + el.id + '"]');
        if (!echo || !echo.textContent.includes(text) || !visible(echo)) found.push('selected option "' + text.slice(0, 40) + '" is truncated and not echoed in full');
      }
    }
    if (found.length) issues.push({ control: describe(el), problems: found });
  }
  // A form that leaves validation to the browser raises its unstyled, short-lived, keyboard-prone
  // native bubble; the app renders its own inline errors instead (noValidate).
  for (const form of document.querySelectorAll("form")) {
    if (!visible(form)) continue;
    if (!form.noValidate && form.querySelector("[required], [pattern], [minlength]")) {
      issues.push({ control: "form" + (form.className ? "." + form.className.trim().split(/\\s+/).join(".") : ""), problems: ["relies on native validation bubbles (no noValidate)"] });
    }
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
    bodyRect: box(body),
    heading: box(dialog.querySelector('h2')),
    compact: dialog.parentElement.hasAttribute('data-compact'),
    sheetScroll: { scrollHeight: dialog.scrollHeight, clientHeight: dialog.clientHeight, overflowY: cs.overflowY },
    body: { scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, scrollTop: body.scrollTop, overflowY: getComputedStyle(body).overflowY },
    rootLocked: document.documentElement.classList.contains("sheet-open") && getComputedStyle(document.documentElement).overflow === "hidden",
    pageOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    animationName: cs.animationName,
    background: cs.backgroundColor,
    inertSiblings: (() => { const sibs = [...document.body.children].filter(c => !c.contains(dialog) && c.tagName !== "SCRIPT"); return sibs.length > 0 && sibs.every(c => c.hasAttribute("inert")); })(),
    activeIsInside: dialog.contains(document.activeElement),
  };
})()`;

/** The overlap of two boxes (zero-size if they miss each other). */
function intersect(a, b) {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  return {
    left,
    top,
    right: Math.max(left, Math.min(a.right, b.right)),
    bottom: Math.max(top, Math.min(a.bottom, b.bottom)),
  };
}

/**
 * What of the sheet is actually on screen: the viewport frame clipped to the sheet's own scrollport (its
 * body when header and footer are pinned, the whole sheet when it is compact). A control can sit inside the
 * viewport yet be clipped by the sheet that contains it, so "inside the viewport" alone proves nothing.
 */
function visibleRegion(geo, frame) {
  return intersect(frame, geo.compact ? geo.dialog : geo.bodyRect);
}

function within(box, frame, tolerance = 1) {
  return (
    box &&
    box.left >= frame.left - tolerance &&
    box.right <= frame.right + tolerance &&
    box.top >= frame.top - tolerance &&
    box.bottom <= frame.bottom + tolerance
  );
}

/** Where each correction-sheet control is found (evaluated in the page). */
const SHEET_FIND = {
  reason: `document.querySelector("#correction-reason")`,
  apply: `[...document.querySelectorAll('[role="dialog"] button')].find(b => /apply correction/i.test(b.textContent))`,
  cancel: `[...document.querySelectorAll('[role="dialog"] button')].find(b => /cancel/i.test(b.textContent))`,
  heading: `document.querySelector('[role="dialog"] h2')`,
};

/**
 * Scroll one control into view the way a person (or the browser's focus handling) would, then measure. A
 * control is "reachable" if SOME scroll position shows it whole; asking for the bottom or top stop instead
 * wrongly fails a sheet whose footer padding simply sits between the button and the end of the scroll.
 */
async function geometryRevealing(gm, key) {
  await ev(gm, `${SHEET_FIND[key]}.scrollIntoView({ block: "nearest" })`);
  await sleep(80);
  return ev(gm, MODAL_GEOMETRY);
}

async function openCorrection(gm, index = 0) {
  // Roster-agnostic on purpose: the Nth listed character's Correct button. Matching a character
  // by name silently broke this audit when the sourcebook roster renamed the "rook" seat (the id
  // stayed, the display name changed); apps/web/test/playtest/auditHarnessContract.test.ts guards it.
  const finder =
    index === 0
      ? `document.querySelector(".roster-panel-list li button")`
      : `document.querySelectorAll(".roster-panel-list li button")[${index}]`;
  await waitFor(gm, finder, 20000, "a character's Correct button");
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

/**
 * One viewport's checks of the correction sheet for the roster's `index`-th character: containment,
 * actions reachable, root scroll lock, inert background, focus handling, an emulated on-screen keyboard
 * with the reason field focused, then the focus-return/cleanup checks after closing. Characters differ
 * in item and injury-box counts, so the sheet's length (and its scroll) differs per character.
 */
async function auditSheetCase(gm, vp, index = 0) {
  await applyViewport(gm, vp);
  await openCorrection(gm, index);
  const record = {
    viewport: vp.name,
    size: `${vp.width}x${vp.height}`,
    rosterIndex: index,
    checks: {},
  };
  const tag = index === 0 ? vp.name : `${vp.name}#${index}`;
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
  record.screenshot = await screenshot(gm, `gm-correction-sheet-${tag}.jpg`, {
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
      compact: kb.compact,
      checks: {
        dialogInsideViewport: within(kb.dialog, kbFrame),
        focusedFieldVisible: within(kb.reason, visibleRegion(kb, kbFrame)),
        noPageOverflow: kb.pageOverflowPx <= 1,
      },
    };
    if (kb.compact) {
      // Too little visible height for a pinned title and action row (what real iOS Safari leaves on a
      // landscape phone with the keyboard up): the WHOLE sheet scrolls, so the actions and the title
      // are reached by scrolling the sheet itself, and must not be clipped when they get there.
      record.keyboard.checks.compactSheetScrolls =
        kb.sheetScroll.overflowY === "auto" &&
        kb.sheetScroll.scrollHeight > kb.sheetScroll.clientHeight;
      const applyGeo = await geometryRevealing(gm, "apply");
      const cancelGeo = await geometryRevealing(gm, "cancel");
      record.keyboard.checks.actionsReachableByScrollingSheet =
        within(applyGeo.apply, intersect(kbFrame, applyGeo.dialog)) &&
        within(cancelGeo.cancel, intersect(kbFrame, cancelGeo.dialog));
      const headingGeo = await geometryRevealing(gm, "heading");
      record.keyboard.checks.titleReachableByScrollingSheet = within(
        headingGeo.heading,
        intersect(kbFrame, headingGeo.dialog),
      );
    } else {
      record.keyboard.checks.actionsVisible =
        within(kb.apply, kbFrame) && within(kb.cancel, kbFrame);
    }
    record.keyboard.screenshot = await screenshot(gm, `gm-correction-keyboard-${tag}.jpg`, {
      fullPage: false,
    });
    await applyViewport(gm, vp);
  }
  for (const [k, v] of Object.entries(record.checks)) {
    if (!v) fail(`modal@${tag}`, `${k} failed`);
  }
  for (const [k, v] of Object.entries(record.keyboard?.checks ?? {})) {
    if (!v) fail(`modal-keyboard@${tag}`, `${k} failed`);
  }
  report.modal.push(record);
  await closeCorrection(gm);
  // Focus must return to the trigger, and the background must no longer be inert.
  const afterClose = await ev(
    gm,
    `({ focusOnTrigger: document.activeElement?.tagName === "BUTTON" && /correct/i.test(document.activeElement.textContent), anyInert: [...document.body.children].some(c => c.hasAttribute("inert")), rootLocked: document.documentElement.classList.contains("sheet-open") })`,
  );
  record.afterClose = afterClose;
  if (!afterClose.focusOnTrigger) fail(`modal@${tag}`, "focus did not return to trigger");
  if (afterClose.anyInert) fail(`modal@${tag}`, "background still inert after close");
  if (afterClose.rootLocked) fail(`modal@${tag}`, "root scroll lock left on after close");
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
  for (const vp of cases) await auditSheetCase(gm, vp, 0);

  // ---- Scenarios that layout-viewport resizing cannot reach. Each MUST execute at least one check;
  // an exception, or an emulation this Chrome cannot perform, is a FAILURE and never a silent skip. ----
  async function scenario(name, viewport, body, { informationalChecks = [] } = {}) {
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
    // Only the NAMED checks may be non-gating; any other failing check in the scenario still fails the run.
    record.informationalChecks = informationalChecks;
    for (const [k, v] of Object.entries(record.checks)) {
      if (v) continue;
      if (informationalChecks.includes(k))
        console.log(`INFO modal-${name}: ${k} failed (recorded, not gating)`);
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
  for (const [vp, px, informationalChecks] of [
    [byName["phone-small"], 24, []],
    [byName["phone"], 32, []],
    // Only the two geometry checks the console's overflow can break are non-gating here; the sheet's own
    // bodyKeepsRoom / actionsReachable / reasonReachable still gate.
    [byName["phone-small"], 32, ["dialogInsideViewport", "noPageOverflow"]],
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
      { informationalChecks },
    );
  }
  // The case real iOS Safari produced in the iOS Simulator (scripts/playtest/ios-simulator): a landscape
  // phone with the software keyboard up leaves roughly 70-140px of visible height. A pinned title and
  // action row alone need more than that, so the sheet must switch to scrolling as one page (compact)
  // and keep the typed-in field in view, with the title and actions reachable by scrolling the sheet.
  // 90px is the middle of what iOS left; 70 and 60 are its low end (a reviewer measured the field clipped
  // 36/48px at 70px when compact mode still carried the wide-viewport bottom padding).
  // Each height runs with no insets and with a landscape iPhone's (notch 47px left/right, home indicator 21px):
  // the bottom inset is easy to count twice (once on the backdrop, once in the footer).
  for (const visibleHeight of [90, 70, 60]) {
    for (const insets of [false, true]) {
      for (const vp of [
        { name: "phone-667x375", width: 667, height: 375, mobile: true },
        byName["phone-landscape"],
      ]) {
        const name = `tight-keyboard-${vp.name}-${visibleHeight}px${insets ? "-insets" : ""}`;
        await scenario(name, vp, async (record) => {
          if (insets) {
            await gm.cdp.send(
              "Emulation.setSafeAreaInsetsOverride",
              { insets: { top: 0, left: 47, right: 47, bottom: 21 } },
              gm.sessionId,
            );
          }
          await openCorrection(gm);
          await ev(gm, `document.querySelector("#correction-reason").focus()`);
          const shrunk = { ...vp, height: visibleHeight };
          await applyViewport(gm, shrunk);
          await sleep(500);
          const frame = frameOf(shrunk);
          const geo = await ev(gm, MODAL_GEOMETRY);
          record.geometry = geo;
          record.checks.compactModeEngaged = geo.compact === true;
          record.checks.dialogInsideViewport = within(geo.dialog, frame);
          // The field must be fully inside what the sheet shows, not merely inside the viewport.
          record.checks.focusedFieldVisibleInSheet = within(geo.reason, visibleRegion(geo, frame));
          record.checks.noPageOverflow = geo.pageOverflowPx <= 1;
          const applyGeo = await geometryRevealing(gm, "apply");
          const cancelGeo = await geometryRevealing(gm, "cancel");
          record.checks.actionsReachableByScrollingSheet =
            within(applyGeo.apply, intersect(frame, applyGeo.dialog)) &&
            within(cancelGeo.cancel, intersect(frame, cancelGeo.dialog));
          const headingGeo = await geometryRevealing(gm, "heading");
          record.checks.titleReachableByScrollingSheet = within(
            headingGeo.heading,
            intersect(frame, headingGeo.dialog),
          );
          if (visibleHeight === 90 && !insets) {
            record.screenshot = await screenshot(
              gm,
              `gm-correction-tight-keyboard-${vp.name}.jpg`,
              { fullPage: false },
            );
          }
        });
      }
    }
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

// ---------- on-screen keyboard: every text-entry control stays reachable ----------

/**
 * With the keyboard up, focusing each text-entry control must leave it inside the visible viewport
 * AND not covered by anything (WCAG 2.2 SC 2.4.11 Focus Not Obscured). Runs in the page so the
 * browser's own scroll-into-view-on-focus decides where the control ends up.
 */
const KEYBOARD_FOCUS_AUDIT = `(async () => {
  const selector = 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), textarea, select';
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[inert]"); };
  const describe = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "");
  const results = [];
  for (const el of [...document.querySelectorAll(selector)].filter(visible).slice(0, 40)) {
    // Start from the top of the page and of any scrolled sheet body, so the browser must scroll to it.
    window.scrollTo(0, 0);
    document.querySelectorAll(".sheet-body").forEach((b) => { b.scrollTop = 0; });
    el.focus();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const r = el.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const inside = r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && r.left >= -0.5 && r.right <= vw + 0.5;
    const probeX = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1);
    const probeY = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
    const hit = document.elementFromPoint(probeX, probeY);
    results.push({ control: describe(el), inside, unobscured: hit === el || el.contains(hit), top: Math.round(r.top), bottom: Math.round(r.bottom), viewportHeight: innerHeight });
  }
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  return results;
})()`;

async function auditKeyboardFocus(device, state) {
  if (MODAL_ONLY) return;
  const original = device.vp;
  for (const vp of [byName["phone-small"], byName["phone"], byName["phone-landscape"]]) {
    // An on-screen keyboard covers roughly 40% of a portrait phone and half of a landscape one.
    const keyboard = Math.round(vp.height * (vp.width > vp.height ? 0.5 : 0.42));
    await applyViewport(device, { ...vp, height: vp.height - keyboard });
    const results = await ev(device, KEYBOARD_FOCUS_AUDIT);
    const scope = `${device.name}/${state}-keyboard@${vp.name}`;
    report.keyboard.push({ scope, controls: results.length, results });
    if (results.length === 0) fail(scope, "no text-entry controls were exercised");
    for (const result of results) {
      if (!result.inside)
        fail(scope, `${result.control} is outside the visible viewport when focused`);
      if (!result.unobscured) fail(scope, `${result.control} is covered when focused`);
    }
  }
  await applyViewport(device, original);
}

// ---------- forms: inline validation instead of the browser's own bubbles ----------

/**
 * Submits a signed-out form empty, then with exactly one invalid value, at two phone sizes. The app
 * must raise its OWN errors in the page (not the browser's unstyled, transient bubble): every empty
 * required field flagged `aria-invalid` and described by visible text, an alert next to the submit
 * button, and focus moved to the first invalid field with that field inside the viewport.
 */
async function auditInlineValidation(device, config) {
  if (MODAL_ONLY) return;
  const original = device.vp;
  for (const vp of [byName["phone-small"], byName["phone"]]) {
    await applyViewport(device, vp);
    const scope = `${device.name}/${config.name}-validation@${vp.name}`;
    const probe = `(() => {
      const el = (id) => document.getElementById(id);
      const described = (input) => (input.getAttribute("aria-describedby") || "").split(/\\s+/).map((id) => el(id)).filter(Boolean).map((n) => n.textContent.trim()).join(" ").trim();
      const form = document.querySelector("form");
      const flagged = [...form.querySelectorAll('[aria-invalid="true"]')];
      const active = document.activeElement;
      const r = active.getBoundingClientRect();
      return {
        flagged: flagged.map((i) => {
          const cs = getComputedStyle(i);
          return { id: i.id, message: described(i), borderColor: cs.borderTopColor, borderWidth: parseFloat(cs.borderTopWidth) };
        }),
        riot: (() => { const probe = document.createElement("i"); probe.style.color = "var(--riot)"; document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; })(),
        alerts: [...form.querySelectorAll('[role="alert"]')].filter((n) => n.textContent.trim()).length,
        focusedId: active.id,
        focusedInside: r.top >= -0.5 && r.bottom <= innerHeight + 0.5,
        hash: location.hash,
        overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    })()`;
    // 1. Everything empty.
    for (const id of config.fields) await setInput(device, `#${id}`, "");
    const hashBefore = await ev(device, `location.hash`);
    await ev(
      device,
      `[...document.querySelectorAll("form button[type=submit]")].find(b => ${config.submit}.test(b.textContent.trim())).click()`,
    );
    await sleep(350);
    const empty = await ev(device, probe);
    const record = { scope, empty, hashBefore };
    record.screenshot = await screenshot(
      device,
      `${device.name}-${config.name}-errors-${vp.name}.jpg`,
      {
        fullPage: false,
      },
    );
    for (const id of config.required) {
      const hit = empty.flagged.find((f) => f.id === id);
      if (!hit) fail(scope, `empty #${id} is not marked aria-invalid`);
      else if (hit.message.length < 4) fail(scope, `empty #${id} has no visible error text`);
    }
    // An invalid field must LOOK invalid: a heavier border in the error colour (computed, so a
    // specificity slip that leaves the border grey is caught).
    for (const f of empty.flagged) {
      if (f.borderColor !== empty.riot || f.borderWidth < 3) {
        fail(
          scope,
          `#${f.id} is flagged but its border is ${f.borderWidth}px ${f.borderColor}, not 3px ${empty.riot}`,
        );
      }
    }
    if (empty.alerts < 1) fail(scope, "no inline alert after an invalid submit");
    if (empty.focusedId !== config.required[0]) {
      fail(
        scope,
        `focus is on "${empty.focusedId}", not the first invalid field #${config.required[0]}`,
      );
    }
    if (!empty.focusedInside) fail(scope, "first invalid field is outside the viewport");
    if (empty.hash !== hashBefore) fail(scope, "an invalid submit navigated away");
    if (empty.overflowPx > 1)
      fail(scope, `horizontal overflow ${empty.overflowPx}px with errors shown`);
    // 2. Valid everywhere except one field.
    if (config.bad) {
      for (const [id, value] of Object.entries(config.valid))
        await setInput(device, `#${id}`, value);
      await setInput(device, `#${config.bad[0]}`, config.bad[1]);
      await ev(
        device,
        `[...document.querySelectorAll("form button[type=submit]")].find(b => ${config.submit}.test(b.textContent.trim())).click()`,
      );
      await sleep(350);
      const one = await ev(device, probe);
      record.oneInvalid = one;
      if (one.flagged.length !== 1 || one.flagged[0].id !== config.bad[0]) {
        fail(
          scope,
          `expected only #${config.bad[0]} flagged, got ${JSON.stringify(one.flagged.map((f) => f.id))}`,
        );
      }
      if (one.flagged[0] && one.flagged[0].message.length < 4)
        fail(scope, `#${config.bad[0]} has no visible error text`);
      if (one.focusedId !== config.bad[0])
        fail(scope, `focus is on "${one.focusedId}", not #${config.bad[0]}`);
      // Fixing the value clears the flag as the person types.
      await setInput(device, `#${config.bad[0]}`, config.valid[config.bad[0]]);
      await sleep(250);
      const cleared = await ev(device, probe);
      record.cleared = cleared;
      if (cleared.flagged.some((f) => f.id === config.bad[0])) {
        fail(scope, `#${config.bad[0]} stays flagged after it is corrected`);
      }
    }
    report.validation.push(record);
  }
  await applyViewport(device, original);
}

// ---------- the whole roster: every character's own compose screen and correction sheet ----------

async function joinAndClaim(device, codes, displayName) {
  await goto(device, "#/join");
  await setInput(device, "#room-code", codes["Room code"]);
  await setInput(device, "#join-passphrase", "audit-pass-1");
  await setInput(device, "#join-display-name", displayName);
  await clickText(device, "button", /^Join session$/);
  await waitFor(device, `document.querySelector(".reveal-card")`, 30000, `${displayName} reveal`);
  await clickText(device, "button", /wrote it down/);
  await waitFor(device, `document.querySelector(".roster-grid")`, 30000, `${displayName} roster`);
  // The first still-unclaimed character, so five more players walk the roster in order without
  // this script ever naming a character.
  await clickText(device, "button", /^Claim$/);
  await clickText(device, "button", /Continue to your dashboard/);
  await waitFor(
    device,
    `document.body.textContent.includes("Choose an action")`,
    30000,
    `${displayName} compose`,
  );
}

/**
 * Characters differ in items, abilities, utility actions and injury boxes, and the first character's
 * screens are the only ones the main flow visits. Five more players claim the rest; each compose
 * screen is audited at every viewport, then the GM's correction sheet is audited for each of them.
 */
async function rosterSweep(cdp, gm, table, codes) {
  // As many more players as there are characters left to claim (the GM holds one seat, the room caps at 8).
  const total = await ev(gm, `document.querySelectorAll(".roster-panel-list li button").length`);
  const names = ["Bea", "Cy", "Dee", "Eli", "Fay", "Gus", "Hal"];
  const extra = Math.min(total - 1, names.length);
  if (total < 2) fail("roster-sweep", `GM roster lists ${total} characters, expected at least 2`);
  const players = [];
  for (const [i, name] of names.slice(0, extra).entries()) {
    const device = await openDevice(cdp, `player${i + 2}`, byName["phone"]);
    await joinAndClaim(device, codes, name);
    await captureState(device, "compose", { axeViewports: ["phone-small", "phone"] });
    players.push(device);
  }
  await waitFor(
    gm,
    `/Characters claimed: ${1 + extra}\\//.test(document.body.textContent)`,
    30000,
    "every character claimed",
  );
  await captureState(gm, "console-full-roster", { axeViewports: ["phone"] });
  await captureState(table, "full-party", { axeViewports: ["phone"] });
  for (let index = 1; index < total; index += 1) {
    for (const vp of [byName["phone-small"], byName["phone"], byName["phone-landscape"]]) {
      await auditSheetCase(gm, vp, index);
    }
  }
  await applyViewport(gm, byName["desktop"]);
  return players;
}

async function setSelect(device, selector, valuePattern) {
  await waitFor(device, `document.querySelector(${JSON.stringify(selector)})`, 15000, selector);
  const chosen = await ev(
    device,
    `(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      const option = [...el.options].reverse().find(o => ${valuePattern}.test(o.value));
      if (!option) return null;
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(el, option.value);
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return option.value;
    })()`,
  );
  if (chosen === null) throw new Error(`${selector} has no option matching ${valuePattern}`);
  await sleep(250);
}

// ---------- flow ----------

/** Signed-out forms whose validation the app must render inline (see auditInlineValidation). */
const VALIDATION = {
  "create-form": {
    name: "create",
    fields: ["session-name", "passphrase", "creator-display-name"],
    required: ["session-name", "passphrase", "creator-display-name"],
    submit: "/^Create session$/",
    valid: { "session-name": "Audit", passphrase: "audit-pass-1", "creator-display-name": "Ada" },
    bad: ["passphrase", "abc"], // shorter than the 4-character minimum
  },
  "join-form": {
    name: "join",
    fields: ["room-code", "join-passphrase", "join-display-name"],
    required: ["room-code", "join-passphrase", "join-display-name"],
    submit: "/^Join session$/",
    valid: {
      "room-code": "ABCD-1234",
      "join-passphrase": "audit-pass-1",
      "join-display-name": "Ada",
    },
    bad: ["room-code", "bad code!"], // outside [A-Za-z0-9-]
  },
  "table-join-form": {
    name: "table-join",
    fields: ["table-room-code", "table-code"],
    required: ["table-room-code", "table-code"],
    submit: "/^Connect display$/",
    valid: { "table-room-code": "ABCD-1234", "table-code": "ABCD" },
    bad: null,
  },
  "recover-form": {
    name: "recover",
    fields: ["recover-room-code", "recovery-code", "recover-display-name"],
    required: ["recover-room-code", "recovery-code", "recover-display-name"],
    submit: "/^Recover my seat$/",
    valid: {
      "recover-room-code": "ABCD-1234",
      "recovery-code": "ABCD-EFGH",
      "recover-display-name": "Ada",
    },
    bad: ["recover-room-code", "bad code!"],
  },
};

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
      if (VALIDATION[name]) {
        await auditKeyboardFocus(anon, name);
        await auditInlineValidation(anon, VALIDATION[name]);
      }
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

    // Signed-out secret/recovery form: reachable from the join form, never visited by the sweep above.
    await goto(anon, "#/join");
    await clickText(anon, "button", /Recover your seat/);
    await waitFor(anon, `document.querySelector("#recovery-code")`, 15000, "recovery form");
    await captureState(anon, "recover-form");
    await auditKeyboardFocus(anon, "recover-form");
    await auditInlineValidation(anon, VALIDATION["recover-form"]);
    await setInput(anon, "#recover-room-code", "NOPE-0000");
    await setInput(anon, "#recovery-code", "not-a-real-recovery-code");
    await setInput(anon, "#recover-display-name", "Ada");
    await clickText(anon, "button", /^Recover my seat$/);
    await waitFor(
      anon,
      `document.querySelector('[role="alert"].error-message')`,
      30000,
      "recovery rejection",
    );
    await captureState(anon, "recover-rejected", { axeViewports: ["phone"] });

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
    codes.playerRecovery = await ev(
      player,
      `document.querySelector(".reveal-code").textContent.trim()`,
    );
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
    await auditKeyboardFocus(gm, "console-scene-loaded");
    // A native select ellipsises its closed value: pick a Threat target (the last matching option) so the audit can
    // prove the full text is echoed beside it, then put it back.
    await setSelect(gm, "#edit-target", /^threat:/);
    await captureState(gm, "console-edit-target", { axeViewports: ["phone"] });
    await setSelect(gm, "#edit-target", /^$/);

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
    await rosterSweep(cdp, gm, table, codes);

    // Last on purpose: redeeming the player's recovery code rebinds the seat to the anon device and
    // revokes the player device's binding, so nothing that needs that device may run after this.
    // The anon page is still on #/join in recover mode; a same-hash navigation would keep that
    // component state, so leave the route first to get a fresh join form.
    await goto(anon, "#/");
    await goto(anon, "#/join");
    await clickText(anon, "button", /Recover your seat/);
    await setInput(anon, "#recover-room-code", codes["Room code"]);
    // Typed the way a phone keyboard or a paste can deliver it (lower-cased, padded): proves the
    // client-side normalisation end to end against the real callable, not just in jsdom.
    await setInput(anon, "#recovery-code", ` ${codes.playerRecovery.toLowerCase()} `);
    await setInput(anon, "#recover-display-name", "Ada");
    await clickText(anon, "button", /^Recover my seat$/);
    await waitFor(anon, `document.querySelector(".reveal-card")`, 30000, "recovery reveal");
    await captureState(anon, "recover-reveal");
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
      keyboardFocusChecks: report.keyboard.reduce((n, k) => n + k.controls, 0),
      validationScenarios: report.validation.length,
      sheetCases: report.modal.filter((m) => m.rosterIndex !== undefined).length,
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
