#!/usr/bin/env node
// Diagnostic probes the committed audit (ui-audit.mjs) does not run, kept as a tool so the numbers in
// docs/evidence/de-uiux-fresh-20261002 can be reproduced. Drives the real app in headless Chrome over CDP, like
// ui-audit.mjs and two-device-smoke.mjs (no npm dependency), through a real session created in the UI, and
// measures; it asserts nothing and exits 0 (read probe-report.json). Probes, selectable with --only:
//   A  sheetShort     the correction sheet over a dense grid of widths x short VISIBLE heights (keyboard / short window),
//                     judged on the scrolling box it actually has (pinned body, or the whole sheet in single-scroll mode)
//   H  zoomEquivalents 400% / 200% browser-zoom equivalents (320x200, 640x400) for the sheet
//   C  rotation       rotate portrait <-> landscape with the sheet open and text typed
//   D  selects        do closed <select> values truncate, and do the truncated prefixes stay unique?
//   B  feedback       is a rejected command's alert on screen after pressing a control lower on the page?
//   J  obstruction    does the feedback design cover keyboard focus / persist on screen? (compare design variants)
//   F  focusSweep     Tab order: a visible focus indicator on every stop, every stop inside the viewport
//   G  clipped        content clipped by overflow:hidden (text loss) at 320/375/812 with 200% root text (G0: default text)
//   E  forcedColors   forced-colors (Windows High Contrast) emulation: boundaries, checked/unchecked, focus
//   L  allocation     the allocation step: focus order, clipping, forced colors
// Usage (emulator-mode build served locally, emulators running):
//   node scripts/playtest/fresh-probes.mjs --base http://127.0.0.1:4174 --out DIR --port 9351 \
//     [--only A,B] [--widths 320,375] [--heights 80,100,126] [--no-shots]
// CHROME_PATH may name a wrapper that adds Blink flags (for example --blink-settings=defaultFontSize=32 for a real
// 200% browser text size, which an inline root font-size override does not reproduce).

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
}
const BASE = arg("base", "http://127.0.0.1:4174").replace(/\/$/, "");
const OUT = arg("out", "probe-out");
const PORT = Number(arg("port", "9351"));
const ONLY = arg("only", "").split(",").filter(Boolean);
const SHOTS = !args.includes("--no-shots");
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const want = (k) => ONLY.length === 0 || ONLY.includes(k);
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const report = { base: BASE, startedAt: new Date().toISOString(), env: {}, probes: {}, errors: [] };

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
      } else for (const l of this.listeners) l(message);
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
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true }, sessionId);
  await applyViewport(device, vp);
  devices.push(device);
  return device;
}
async function applyViewport(device, vp) {
  await device.cdp.send(
    "Emulation.setDeviceMetricsOverride",
    { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile },
    device.sessionId,
  );
  await device.cdp.send(
    "Emulation.setTouchEmulationEnabled",
    { enabled: vp.mobile },
    device.sessionId,
  );
  device.vp = vp;
  await sleep(180);
}
async function ev(device, expression) {
  const result = await device.cdp.send(
    "Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true },
    device.sessionId,
  );
  if (result.exceptionDetails)
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
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
async function shot(device, file, { fullPage = false } = {}) {
  if (!SHOTS) return null;
  const params = { format: "jpeg", quality: 70 };
  if (fullPage) {
    const metrics = await device.cdp.send("Page.getLayoutMetrics", {}, device.sessionId);
    params.captureBeyondViewport = true;
    params.clip = {
      x: 0,
      y: 0,
      width: Math.ceil(metrics.cssContentSize.width),
      height: Math.min(Math.ceil(metrics.cssContentSize.height), 5000),
      scale: 1,
    };
  }
  const { data } = await device.cdp.send("Page.captureScreenshot", params, device.sessionId);
  writeFileSync(join(OUT, file), Buffer.from(data, "base64"));
  return file;
}
async function pressTab(device, shift = false) {
  const base = {
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
    nativeVirtualKeyCode: 9,
    modifiers: shift ? 8 : 0,
  };
  await device.cdp.send(
    "Input.dispatchKeyEvent",
    { type: "rawKeyDown", ...base },
    device.sessionId,
  );
  await device.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base }, device.sessionId);
}

const VP = {
  phoneSmall: { name: "phone-small", width: 320, height: 568, mobile: true },
  phone: { name: "phone", width: 375, height: 812, mobile: true },
  landscape: { name: "phone-landscape", width: 812, height: 375, mobile: true },
  tablet: { name: "tablet", width: 768, height: 1024, mobile: true },
  desktop: { name: "desktop", width: 1280, height: 800, mobile: false },
  table: { name: "table", width: 1920, height: 1080, mobile: false },
};

// ---------------- in-page measurement snippets ----------------
const SHEET_METRICS = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height, width: b.width }; };
  const dialog = document.querySelector('[role="dialog"]');
  if (!dialog) return { open: false };
  const body = dialog.querySelector(".sheet-body");
  const footer = dialog.querySelector(".sheet-footer");
  const header = dialog.querySelector(".sheet-header");
  const field = dialog.querySelector("#correction-reason");
  const label = dialog.querySelector('label[for="correction-reason"]');
  const buttons = [...dialog.querySelectorAll("button")];
  const apply = buttons.find((b) => /apply correction/i.test(b.textContent));
  const cancel = buttons.find((b) => /cancel/i.test(b.textContent));
  const vv = window.visualViewport;
  return {
    open: true,
    innerW: innerWidth, innerH: innerHeight, vvH: vv ? vv.height : null, vvW: vv ? vv.width : null,
    dialog: r(dialog), header: r(header), body: r(body), footer: r(footer), field: r(field), label: r(label), apply: r(apply), cancel: r(cancel),
    bodyClient: body ? body.clientHeight : null, bodyScroll: body ? body.scrollHeight : null, bodyTop: body ? body.scrollTop : null,
    footerClient: footer ? footer.clientHeight : null, footerScroll: footer ? footer.scrollHeight : null,
    fieldValue: field ? field.value : null,
    activeInside: dialog.contains(document.activeElement), activeIsField: document.activeElement === field,
    rootLocked: document.documentElement.classList.contains("sheet-open") && getComputedStyle(document.documentElement).overflow === "hidden",
    pageOverflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    inertSiblings: (() => { const sibs = [...document.body.children].filter((c) => !c.contains(dialog) && c.tagName !== "SCRIPT"); return sibs.length > 0 && sibs.every((c) => c.hasAttribute("inert")); })(),
    compactChrome: matchMedia("(max-height: 28rem)").matches,
    scrollerKind: getComputedStyle(dialog).overflowY === "auto" ? "sheet" : "body",
    sheetClient: dialog.clientHeight, sheetScroll: dialog.scrollHeight, sheetTop: dialog.scrollTop,
    rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
  };
})()`;

const inside = (inner, outer, tol = 1) =>
  Boolean(
    inner &&
    outer &&
    inner.top >= outer.top - tol &&
    inner.bottom <= outer.bottom + tol &&
    inner.left >= outer.left - tol &&
    inner.right <= outer.right + tol,
  );
const frameOf = (w, h) => ({ left: 0, top: 0, right: w, bottom: h });

async function openCorrection(gm) {
  const finder = `[...document.querySelectorAll(".roster-panel-list button")].find(button => /^correct$/i.test(button.textContent.trim()) && !button.disabled)`;
  await waitFor(gm, finder, 20000, "a roster Correct button");
  await ev(
    gm,
    `(() => { const b = ${finder}; b.scrollIntoView({ block: "center" }); b.focus(); b.click(); return true; })()`,
  );
  await waitFor(gm, `document.querySelector('[role="dialog"]')`, 10000, "correction dialog");
  await sleep(300);
}
async function closeCorrection(gm) {
  await ev(
    gm,
    `[...document.querySelectorAll('[role="dialog"] button')].find(b => /cancel/i.test(b.textContent))?.click()`,
  );
  await waitFor(gm, `!document.querySelector('[role="dialog"]')`, 10000, "dialog closed");
}

// ---------------- bootstrap: a real session, driven through the UI like the audit harness ----------------
async function bootstrap(cdp, hooks = {}) {
  const gm = await openDevice(cdp, "gm", VP.desktop);
  const player = await openDevice(cdp, "player", VP.phone);
  const table = await openDevice(cdp, "table", VP.table);
  const anon = await openDevice(cdp, "anon", VP.phone);
  const codes = {};
  await goto(gm, "#/create");
  await setInput(gm, "#session-name", "Fresh Probe Session");
  await setInput(gm, "#passphrase", "probe-pass-1");
  await setInput(gm, "#creator-display-name", "Gamemaster");
  await clickText(gm, "button", /^Create session$/);
  await waitFor(gm, `document.querySelector(".reveal-card")`, 30000, "secrets reveal card");
  const pairs = await ev(
    gm,
    `[...document.querySelectorAll(".reveal-card dt")].map(dt => [dt.textContent.trim(), dt.nextElementSibling.textContent.trim()])`,
  );
  for (const [key, value] of pairs) codes[key] = value;
  await ev(gm, `document.querySelector("#wrote-down").click()`);
  await clickText(gm, "button", /ready.*continue/i);
  await clickText(gm, "button", /Open the director console/);
  await waitFor(gm, `document.body.textContent.includes("Scene director")`, 30000, "console");
  await clickText(gm, "button", /^Load scene$/);
  await waitFor(gm, `document.body.textContent.includes("round 1")`, 30000, "scene loaded");

  await goto(player, "#/join");
  await setInput(player, "#room-code", codes["Room code"]);
  await setInput(player, "#join-passphrase", "probe-pass-1");
  await setInput(player, "#join-display-name", "Ada");
  await clickText(player, "button", /^Join session$/);
  await waitFor(player, `document.querySelector(".reveal-card")`, 30000, "player reveal");
  await clickText(player, "button", /wrote it down/);
  await waitFor(player, `document.querySelector(".roster-grid")`, 30000, "roster");
  await clickText(player, "button", /^Claim$/);
  await clickText(player, "button", /Continue to your dashboard/);
  await waitFor(player, `document.body.textContent.includes("Choose an action")`, 30000, "compose");
  await hooks.onCompose?.({ gm, player, table, anon, codes });

  await goto(table, "#/table");
  await setInput(table, "#table-room-code", codes["Room code"]);
  await setInput(table, "#table-code", codes["Table code"]);
  await clickText(table, "button", /^Connect display$/);
  await clickText(table, "button", /Open the table display/, 30000);
  await waitFor(table, `document.querySelector(".scene-card")`, 30000, "table scene");

  await waitFor(gm, `/Characters claimed: 1\\//.test(document.body.textContent)`, 30000, "claimed");
  await clickText(player, "button", /^Declare action$/);
  await waitFor(player, `document.body.textContent.includes("Declared")`, 30000, "declared");
  await waitFor(gm, `${textMatch("button", "/^Roll it$/")}`, 30000, "Roll it");
  return { gm, player, table, anon, codes };
}

// ---------------- A: sheet at short visible heights ----------------
async function probeSheetShort({ gm }, { widths, heights, openHeight = 700 }) {
  const rows = [];
  for (const W of widths) {
    for (const H of heights) {
      const mobile = true;
      await applyViewport(gm, {
        name: `open-${W}`,
        width: W,
        height: Math.max(openHeight, H),
        mobile,
      });
      await openCorrection(gm);
      await ev(gm, `document.querySelector("#correction-reason").focus()`);
      await applyViewport(gm, { name: `${W}x${H}`, width: W, height: H, mobile });
      await sleep(320);
      const m = await ev(gm, SHEET_METRICS);
      const view = frameOf(W, H);
      // Scroller-aware: the body (pinned header/footer) or, in the single-scroll layout, the whole sheet.
      const scrollerBox =
        m.scrollerKind === "sheet"
          ? {
              top: m.dialog.top + 2,
              bottom: m.dialog.bottom,
              left: m.dialog.left + 2,
              right: m.dialog.right - 2,
            }
          : m.body;
      let actions = m;
      if (m.scrollerKind === "sheet") {
        await ev(gm, `document.querySelector('[role="dialog"]').scrollTop = 1e6`);
        await sleep(120);
        actions = await ev(gm, SHEET_METRICS);
      }
      const row = {
        w: W,
        h: H,
        kind: m.scrollerKind,
        bodyClient: m.bodyClient,
        bodyScroll: m.bodyScroll,
        compact: m.compactChrome,
        sheetInsideViewport: inside(m.dialog, view),
        fieldVisible: inside(m.field, scrollerBox, 1.5),
        labelVisible: inside(m.label, scrollerBox, 1.5),
        // pinned: visible without scrolling. Single-scroll: each button must be reachable (it fits the sheet's
        // client height; stacked buttons on a very short, narrow sheet cannot both be in view at once).
        applyVisible:
          m.scrollerKind === "sheet"
            ? m.apply.height <= m.sheetClient + 0.5
            : inside(actions.apply, view) && inside(actions.apply, actions.dialog),
        cancelVisible:
          m.scrollerKind === "sheet"
            ? m.cancel.height <= m.sheetClient + 0.5
            : inside(actions.cancel, view) && inside(actions.cancel, actions.dialog),
        headerH: m.header?.height,
        footerH: m.footer?.height,
        footerOverflows: m.footerScroll > m.footerClient + 1,
        noPageOverflow: m.pageOverflowPx <= 1,
        rootLocked: m.rootLocked,
      };
      row.ok =
        row.fieldVisible &&
        row.applyVisible &&
        row.cancelVisible &&
        row.sheetInsideViewport &&
        row.noPageOverflow &&
        row.rootLocked;
      rows.push(row);
      await applyViewport(gm, {
        name: `close-${W}`,
        width: W,
        height: Math.max(openHeight, H),
        mobile,
      });
      await closeCorrection(gm);
    }
  }
  const minOk = {};
  for (const W of widths) {
    const okRows = rows.filter((r) => r.w === W && r.ok);
    minOk[W] = okRows.length ? Math.min(...okRows.map((r) => r.h)) : null;
  }
  return { rows, minHeightWhereFieldAndActionsUsable: minOk };
}

// ---------------- B: is a rejected command visible? ----------------
const ALERT_STATE = `(() => {
  const alerts = [...document.querySelectorAll('[role="alert"]')].filter((e) => e.textContent.trim() && e.getBoundingClientRect().height > 0);
  const a = alerts[0];
  if (!a) return { alert: false, scrollY: scrollY, ih: innerHeight, docH: document.documentElement.scrollHeight };
  const b = a.getBoundingClientRect();
  return { alert: true, text: a.textContent.trim().slice(0, 140), top: b.top, bottom: b.bottom, scrollY: scrollY, ih: innerHeight, docH: document.documentElement.scrollHeight,
    fullyInViewport: b.top >= 0 && b.bottom <= innerHeight, partlyInViewport: b.bottom > 0 && b.top < innerHeight, docTop: b.top + scrollY };
})()`;
async function reloadGm(gm) {
  // `Page.reload` returns before the new document commits, so a plain readyState wait can be satisfied by the
  // OLD page. A marker set on the old document is gone once the new one has loaded.
  await ev(gm, `window.__beforeReload = true`);
  await gm.cdp.send("Page.reload", {}, gm.sessionId);
  await waitFor(
    gm,
    `!window.__beforeReload && document.readyState === "complete"`,
    20000,
    "reload",
  );
  await sleep(500);
  await waitFor(
    gm,
    `${textMatch("button", "/^End round/")}`,
    30000,
    "GM console after reload (End round button)",
  );
}
async function probeFeedback({ gm }) {
  const out = [];
  const scenario = "end-round-with-open-roll"; // the real ROUND_HAS_OPEN_ROLLS rejection
  for (const vp of [VP.phone, VP.phoneSmall, VP.landscape, VP.tablet, VP.desktop]) {
    await applyViewport(gm, vp);
    await reloadGm(gm); // a fresh load drops any earlier local error state
    const btnFinder = textMatch("button", "/^End round/");
    await waitFor(gm, btnFinder, 15000, "End round button");
    const before = await ev(
      gm,
      `(() => { const el = ${btnFinder}; el.scrollIntoView({ block: "center" }); const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, scrollY: scrollY, docTop: b.top + scrollY, docH: document.documentElement.scrollHeight }; })()`,
    );
    // A real tap focuses the button before it activates; a scripted click() alone would not, and the
    // `hasFocus` check below would then say nothing about whether the message moved focus.
    await ev(
      gm,
      `(() => { const el = ${btnFinder}; el.focus({ preventScroll: true }); el.click(); })()`,
    );
    let state = { alert: false };
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      state = await ev(gm, ALERT_STATE);
      if (state.alert) break;
      await sleep(200);
    }
    // Where the pressed control is once the message is up and any scroll has settled. `button` above is its
    // position BEFORE the tap; the message is inserted above it, so it moves down by the message's height, and
    // a scroll to the message can take it off screen. `distanceButtonToAlertPx` keeps its original meaning (the
    // message's top to where the control WAS); `pressedControlAfter` is where it IS.
    await sleep(300);
    const pressedControlAfter = await ev(
      gm,
      `(() => { const el = ${btnFinder}; if (!el) return null; const r = el.getBoundingClientRect(); const a = [...document.querySelectorAll('[role="alert"]')].find((e) => e.textContent.trim()); const host = a ? (a.closest(".action-feedback") || a) : null; const h = host ? host.getBoundingClientRect() : null; const stuck = host ? getComputedStyle(host).position === "sticky" : false; const visiblePx = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)); const underBannerPx = stuck && h ? Math.max(0, Math.min(r.bottom, h.bottom) - Math.max(r.top, h.top)) : 0; return { top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10, height: Math.round(r.height), visiblePx: Math.round(visiblePx * 10) / 10, underStickyBannerPx: Math.round(underBannerPx * 10) / 10, hasFocus: document.activeElement === el, scrollY: Math.round(scrollY), ih: innerHeight }; })()`,
    );
    out.push({
      viewport: vp.name,
      scenario,
      button: before,
      ...state,
      distanceButtonToAlertPx: state.alert ? Math.round(before.docTop - state.docTop) : null,
      pressedControlAfter,
    });
    if (SHOTS) await shot(gm, `feedback-${scenario}-${vp.name}.jpg`);
  }
  await applyViewport(gm, VP.desktop);
  return out;
}

// ---------------- J: does the feedback design get in the way? (sticky vs scroll-into-view) ----------------
async function probeObstruction({ gm }) {
  const out = [];
  for (const vp of [VP.phone, VP.landscape, VP.desktop]) {
    await applyViewport(gm, vp);
    await reloadGm(gm);
    const finder = textMatch("button", "/^End round/");
    await waitFor(gm, finder, 15000, "End round");
    await ev(
      gm,
      `(() => { const el = ${finder}; el.scrollIntoView({ block: "center" }); el.click(); })()`,
    );
    const deadline = Date.now() + 8000;
    while (
      Date.now() < deadline &&
      !(await ev(
        gm,
        `[...document.querySelectorAll('[role="alert"]')].some(e => e.textContent.trim())`,
      ))
    )
      await sleep(150);
    await sleep(400);
    const HOST = `(() => { const a = [...document.querySelectorAll('[role="alert"]')].find(e => e.textContent.trim()); const host = a.closest(".action-feedback") || a; const cs = getComputedStyle(host); const r = host.getBoundingClientRect(); return { position: cs.position, top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), innerH: innerHeight, scrollY: Math.round(scrollY) }; })()`;
    const atRest = await ev(gm, HOST);
    // Does it stay on screen while the person keeps working lower down? (sticky) Or scroll away with the page? (in flow)
    await ev(gm, `window.scrollBy(0, 700)`);
    await sleep(250);
    const afterScroll = await ev(gm, HOST);
    // Walk keyboard focus UPWARD from a control below it: is any focused control hidden under the message?
    await ev(gm, `(() => { const el = ${finder}; el.focus({ preventScroll: true }); })()`);
    let obscured = 0,
      fullyUnder = 0,
      steps = 0;
    const examples = [];
    for (let i = 0; i < 25; i += 1) {
      await pressTab(gm, true);
      await sleep(40);
      const st = await ev(
        gm,
        `(() => { const el = document.activeElement; if (!el || el === document.body) return null; const r = el.getBoundingClientRect(); const a = [...document.querySelectorAll('[role="alert"]')].find(e => e.textContent.trim()); const host = a ? (a.closest(".action-feedback") || a) : null; const h = host ? host.getBoundingClientRect() : null; const stuck = host ? getComputedStyle(host).position === "sticky" : false; const hidden = h && stuck && r.bottom > h.top && r.top < h.bottom && r.height > 0 && r.top >= -1; const fully = h && stuck && r.top >= h.top - 1 && r.bottom <= h.bottom + 1 && r.height > 0; return { tag: el.tagName.toLowerCase() + (el.id ? "#" + el.id : ""), top: Math.round(r.top), bottom: Math.round(r.bottom), bannerBottom: h ? Math.round(h.bottom) : null, stuck, overlapsBanner: Boolean(hidden), fullyUnderBanner: Boolean(fully) }; })()`,
      );
      if (!st) break;
      steps += 1;
      if (st.fullyUnderBanner) fullyUnder += 1;
      if (st.overlapsBanner) {
        obscured += 1;
        if (examples.length < 3) examples.push(st);
      }
    }
    out.push({
      viewport: vp.name,
      atRest,
      afterScroll700: afterScroll,
      bannerShareOfViewport: Math.round((atRest.height / atRest.innerH) * 100) + "%",
      staysOnScreenWhileScrolling: afterScroll.top >= 0 && afterScroll.top < afterScroll.innerH,
      shiftTabStopsChecked: steps,
      stopsOverlappingTheMessage: obscured,
      stopsEntirelyUnderTheMessage: fullyUnder,
      examples,
    });
  }
  await applyViewport(gm, VP.desktop);
  return out;
}

// ---------------- C: rotation with the sheet open ----------------
async function probeRotation({ gm }) {
  const out = [];
  const seq = [
    ["portrait->landscape", VP.phone, VP.landscape],
    ["landscape->portrait", VP.landscape, VP.phone],
    [
      "portrait->landscape-667",
      VP.phone,
      { name: "667x375", width: 667, height: 375, mobile: true },
    ],
    [
      "small-portrait->small-landscape",
      VP.phoneSmall,
      { name: "568x320", width: 568, height: 320, mobile: true },
    ],
  ];
  for (const [name, from, to] of seq) {
    await applyViewport(gm, from);
    await openCorrection(gm);
    await setInput(gm, "#correction-reason", "typed before rotating");
    await ev(gm, `document.querySelector("#correction-reason").focus()`);
    const before = await ev(gm, SHEET_METRICS);
    await applyViewport(gm, to);
    await sleep(500);
    const after = await ev(gm, SHEET_METRICS);
    const view = frameOf(to.width, to.height);
    const rec = {
      name,
      from: from.name,
      to: to.name,
      dialogInside: inside(after.dialog, view),
      actionsVisible: inside(after.apply, view) && inside(after.cancel, view),
      focusStillInside: after.activeInside,
      valuePreserved: after.fieldValue === "typed before rotating",
      rootLocked: after.rootLocked,
      inert: after.inertSiblings,
      noPageOverflow: after.pageOverflowPx <= 1,
      fieldVisibleBeforeRotation: inside(before.field, before.body),
      fieldVisibleAfterRotation: inside(after.field, after.body),
      bodyClientAfter: after.bodyClient,
    };
    // After rotating back to a roomy size everything must be fully usable.
    await applyViewport(gm, from);
    await sleep(400);
    const back = await ev(gm, SHEET_METRICS);
    rec.backToOriginal = {
      dialogInside: inside(back.dialog, frameOf(from.width, from.height)),
      actionsVisible:
        inside(back.apply, frameOf(from.width, from.height)) &&
        inside(back.cancel, frameOf(from.width, from.height)),
      valuePreserved: back.fieldValue === "typed before rotating",
    };
    out.push(rec);
    await closeCorrection(gm);
  }
  return out;
}

// ---------------- D: closed select truncation ----------------
const SELECT_AUDIT = `(() => {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const out = [];
  for (const sel of document.querySelectorAll("select")) {
    const cs = getComputedStyle(sel);
    ctx.font = cs.fontStyle + " " + cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
    const avail = sel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const opts = [...sel.options].map((o) => o.textContent.trim());
    const fits = (t, n) => ctx.measureText(t.slice(0, n)).width <= avail;
    const visiblePrefix = (t) => { if (ctx.measureText(t).width <= avail) return t; let lo = 0, hi = t.length; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (fits(t, mid)) lo = mid; else hi = mid - 1; } return t.slice(0, lo); };
    const prefixes = opts.map(visiblePrefix);
    const truncated = opts.map((t, i) => prefixes[i] !== t);
    const ambiguous = [];
    for (let i = 0; i < opts.length; i += 1) for (let j = i + 1; j < opts.length; j += 1) if (opts[i] !== opts[j] && prefixes[i] === prefixes[j]) ambiguous.push([opts[i], opts[j]]);
    out.push({ id: sel.id, availablePx: Math.round(avail), options: opts.length, truncatedCount: truncated.filter(Boolean).length, longest: opts.reduce((a, b) => (b.length > a.length ? b : a), ""), ambiguous, selectedText: sel.options[sel.selectedIndex]?.textContent.trim() ?? null, selectedTruncated: truncated[sel.selectedIndex] ?? false });
  }
  return out;
})()`;
async function probeSelects({ gm }) {
  const out = {};
  for (const vp of [VP.phoneSmall, VP.phone, VP.landscape, VP.tablet]) {
    await applyViewport(gm, vp);
    await sleep(300);
    out[vp.name] = await ev(gm, SELECT_AUDIT);
  }
  return out;
}

// ---------------- E: forced colors ----------------
const FORCED_AUDIT = `(() => {
  const issues = [];
  const rgb = (c) => c;
  const canvas = getComputedStyle(document.body).backgroundColor;
  const describe = (el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\\s+/).join(".") : "") + ' "' + (el.getAttribute("aria-label") || el.textContent || el.value || "").trim().slice(0, 24) + '"';
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[inert]"); };
  let n = 0;
  for (const el of document.querySelectorAll("button, select, textarea, input:not([type=hidden])")) {
    if (!vis(el)) continue;
    n += 1;
    const cs = getComputedStyle(el);
    const isCheck = el.matches("input[type=checkbox], input[type=radio]");
    const hasBorder = cs.borderTopStyle !== "none" && parseFloat(cs.borderTopWidth) >= 1 && cs.borderTopColor !== "rgba(0, 0, 0, 0)";
    const hasOutline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
    const bgDiffers = cs.backgroundColor !== canvas && cs.backgroundColor !== "rgba(0, 0, 0, 0)";
    const borderDiffersFromBg = cs.borderTopColor !== cs.backgroundColor;
    if (!(hasBorder && borderDiffersFromBg) && !hasOutline && !bgDiffers) issues.push({ control: describe(el), why: "no perceivable boundary", border: cs.borderTopStyle + " " + cs.borderTopWidth + " " + cs.borderTopColor, bg: cs.backgroundColor });
    if (isCheck) {
      const a = getComputedStyle(el, "::after");
      el.__probe = { bg: cs.backgroundColor, border: cs.borderTopColor, afterBg: a.backgroundColor, checked: el.checked };
    }
  }
  return { controls: n, issues, canvas, forced: matchMedia("(forced-colors: active)").matches };
})()`;
const CHECK_STATES = `(() => {
  const res = [];
  for (const el of document.querySelectorAll("input[type=checkbox], input[type=radio]")) {
    if (el.getBoundingClientRect().width === 0 || el.disabled) continue;
    const snap = () => { const cs = getComputedStyle(el), a = getComputedStyle(el, "::after"); return { checked: el.checked, bg: cs.backgroundColor, border: cs.borderTopColor, borderStyle: cs.borderTopStyle, afterBg: a.backgroundColor, afterTransform: a.transform }; };
    const s0 = snap();
    const wasChecked = el.checked;
    el.click();
    const s1 = snap();
    if (el.checked !== wasChecked) el.click(); // restore
    res.push({ type: el.type, id: el.id || el.name || "", unchecked: wasChecked ? s1 : s0, checked: wasChecked ? s0 : s1 });
  }
  return res.slice(0, 6);
})()`;
async function recordForced(device, label, vp) {
  if (vp) await applyViewport(device, vp);
  await sleep(350);
  const audit = await ev(device, FORCED_AUDIT);
  const checks = await ev(device, CHECK_STATES);
  const distinct = checks.map((c) => ({
    type: c.type,
    id: c.id,
    differs:
      c.checked.bg !== c.unchecked.bg ||
      c.checked.border !== c.unchecked.border ||
      c.checked.afterBg !== c.unchecked.afterBg ||
      c.checked.afterTransform !== c.unchecked.afterTransform,
    checked: c.checked,
    unchecked: c.unchecked,
  }));
  const file = await shot(device, `forced-${label}.jpg`, { fullPage: false });
  return {
    label,
    forcedActive: audit.forced,
    controls: audit.controls,
    issues: audit.issues,
    canvas: audit.canvas,
    checkboxStateChange: distinct,
    screenshot: file,
  };
}
async function setForced(devices, on) {
  for (const d of devices)
    await d.cdp.send(
      "Emulation.setEmulatedMedia",
      { features: on ? [{ name: "forced-colors", value: "active" }] : [] },
      d.sessionId,
    );
}
async function probeForcedColors({ gm, player, anon }) {
  const out = { states: [] };
  await setForced([gm, player, anon], true);
  const record = async (device, label, vp) => {
    out.states.push(await recordForced(device, label, vp));
  };
  await goto(anon, "#/join");
  await record(anon, "anon-join-phone", VP.phone);
  await goto(anon, "#/create");
  await record(anon, "anon-create-phone", VP.phone);
  await record(player, "player-declared-phone", VP.phone);
  await record(gm, "gm-console-desktop", VP.desktop);
  await applyViewport(gm, VP.phone);
  await openCorrection(gm);
  await record(gm, "gm-sheet-phone");
  // Focus indicator in forced colors: keyboard-focus a button inside the sheet.
  await pressTab(gm);
  out.focusInSheet = await ev(
    gm,
    `(() => { const el = document.activeElement; const cs = getComputedStyle(el); return { tag: el.tagName, text: (el.textContent || "").trim().slice(0, 20), outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor, boxShadow: cs.boxShadow, focusVisible: el.matches(":focus-visible") }; })()`,
  );
  await closeCorrection(gm);
  await setForced([gm, player, anon], false);
  return out;
}

// ---------------- F: keyboard focus sweep ----------------
const FOCUS_STATE = `(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return { body: true };
  window.__fv = window.__fv || new WeakSet();
  const repeat = window.__fv.has(el);
  window.__fv.add(el);
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const visibleOutline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 && cs.outlineColor !== "rgba(0, 0, 0, 0)";
  const shadow = cs.boxShadow !== "none" && cs.boxShadow !== "";
  return {
    repeat,
    tag: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\\s+/).join(".") : ""),
    label: (el.getAttribute("aria-label") || el.textContent || el.value || el.placeholder || "").trim().slice(0, 28),
    focusVisible: el.matches(":focus-visible"), visibleOutline, outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor, shadow,
    top: r.top, bottom: r.bottom, left: r.left, right: r.right, inViewport: r.top >= -0.5 && r.bottom <= innerHeight + 0.5 && r.left >= -0.5 && r.right <= innerWidth + 0.5,
    partlyInViewport: r.bottom > 0 && r.top < innerHeight, ih: innerHeight,
  };
})()`;
async function focusSweep(device, label, { max = 70 } = {}) {
  await ev(
    device,
    `window.__fv = new WeakSet(); window.scrollTo(0, 0); document.activeElement?.blur?.()`,
  );
  const stops = [];
  for (let i = 0; i < max; i += 1) {
    await pressTab(device);
    await sleep(60);
    const st = await ev(device, FOCUS_STATE);
    if (st.body || st.repeat) break;
    stops.push(st);
  }
  const noIndicator = stops.filter((s) => !s.visibleOutline && !s.shadow);
  const offscreen = stops.filter((s) => !s.partlyInViewport);
  const notFullyInView = stops.filter((s) => !s.inViewport && s.partlyInViewport);
  return {
    label,
    stops: stops.length,
    noIndicator: noIndicator.map((s) => s.tag + ' "' + s.label + '"'),
    offscreen: offscreen.map((s) => s.tag + ' "' + s.label + '"'),
    notFullyInView: notFullyInView.map(
      (s) =>
        s.tag +
        ' "' +
        s.label +
        '"' +
        " " +
        Math.round(s.top) +
        ".." +
        Math.round(s.bottom) +
        "/" +
        s.ih,
    ),
  };
}
async function probeFocus({ gm, player, anon }) {
  const out = [];
  await applyViewport(anon, VP.phone);
  for (const route of ["#/", "#/join", "#/create", "#/table"]) {
    await goto(anon, route);
    out.push(await focusSweep(anon, "anon " + route));
  }
  await applyViewport(player, VP.phone);
  out.push(await focusSweep(player, "player compose phone"));
  await applyViewport(gm, VP.phone);
  out.push(await focusSweep(gm, "gm console phone", { max: 140 }));
  return out;
}

// ---------------- G: content clipped by overflow ----------------
const CLIPPED = `(() => {
  const out = [];
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[inert]"); };
  for (const el of document.querySelectorAll("body *")) {
    if (el.tagName === "SELECT" || el.tagName === "OPTION" || el.closest("svg")) continue;
    const cs = getComputedStyle(el);
    const clipX = ["hidden", "clip"].includes(cs.overflowX), clipY = ["hidden", "clip"].includes(cs.overflowY);
    if (!clipX && !clipY && cs.textOverflow !== "ellipsis") continue;
    if (!vis(el)) continue;
    const lostX = (clipX || cs.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1;
    const lostY = clipY && el.scrollHeight > el.clientHeight + 1;
    if (!lostX && !lostY) continue;
    out.push({ el: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\\s+/).slice(0, 3).join(".") : ""), sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight, ellipsis: cs.textOverflow === "ellipsis", text: (el.textContent || "").trim().slice(0, 40) });
  }
  return out;
})()`;
async function clippedFor(device, label, fontPx) {
  const rows = [];
  const original = device.vp;
  for (const vp of [VP.phoneSmall, VP.phone, VP.landscape]) {
    await applyViewport(device, vp);
    if (fontPx) await ev(device, `document.documentElement.style.fontSize = "${fontPx}px"`);
    await sleep(250);
    const lost = await ev(device, CLIPPED);
    if (fontPx) await ev(device, `document.documentElement.style.fontSize = ""`);
    rows.push({ label, viewport: vp.name, clipped: lost });
  }
  await applyViewport(device, original);
  return rows;
}
async function probeClipped(ctx, { fontPx }) {
  const stateList = [];
  const run = async (device, label) => {
    stateList.push(...(await clippedFor(device, label, fontPx)));
  };
  const { anon, player, gm, table } = ctx;
  for (const route of ["#/", "#/create", "#/join", "#/table"]) {
    await goto(anon, route);
    await run(anon, "anon " + route);
  }
  await goto(anon, "#/join");
  await clickText(anon, "button", /Lost your browser/);
  await waitFor(anon, `document.querySelector("#recovery-code")`, 15000, "recovery form");
  await run(anon, "anon recovery form");
  await run(player, "player compose");
  await ev(player, `document.querySelector("details summary")?.click()`);
  await run(player, "player compose why-open");
  await ev(player, `document.querySelector("details summary")?.click()`);
  await run(gm, "gm console");
  await run(table, "table idle");
  return stateList
    .filter((s) => s.clipped.length > 0)
    .concat([{ label: "(states scanned)", count: stateList.length }]);
}

// ---------------- main ----------------
async function main() {
  const profile = mkdtempSync(join(tmpdir(), "digitable-probe-"));
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
    const composeProbes = async ({ player }) => {
      if (want("F"))
        report.probes.focusSweepCompose = [
          await focusSweep(player, "player compose phone", { max: 90 }),
        ];
      if (want("G"))
        report.probes.clippedCompose200 = [
          ...(await clippedFor(player, "player compose", 32)),
          ...(await (async () => {
            await ev(player, `document.querySelector("details summary")?.click()`);
            const r = await clippedFor(player, "player compose why-open", 32);
            await ev(player, `document.querySelector("details summary")?.click()`);
            return r;
          })()),
        ];
      if (want("E")) {
        await setForced([player], true);
        const a = await recordForced(player, "player-compose-phone", VP.phone);
        await ev(player, `document.querySelector("details summary")?.click()`);
        const b = await recordForced(player, "player-compose-why-phone");
        await ev(player, `document.querySelector("details summary")?.click()`);
        await setForced([player], false);
        report.probes.forcedColorsCompose = [a, b];
      }
      writeFileSync(join(OUT, "probe-report.json"), JSON.stringify(report, null, 2) + "\n");
    };
    const ctx = await bootstrap(cdp, { onCompose: composeProbes });
    report.env = await ev(
      ctx.gm,
      `({ ua: navigator.userAgent, rootFontPx: parseFloat(getComputedStyle(document.documentElement).fontSize), dpr: devicePixelRatio })`,
    );
    const run = async (key, name, fn) => {
      if (!want(key)) return;
      const t0 = Date.now();
      try {
        report.probes[name] = await fn();
        console.log(`PROBE ${key} ${name} done in ${Math.round((Date.now() - t0) / 1000)}s`);
      } catch (error) {
        report.errors.push({ probe: name, error: String(error.stack ?? error).slice(0, 800) });
        console.log(`PROBE ${key} ${name} ERROR ${error.message}`);
      }
      writeFileSync(join(OUT, "probe-report.json"), JSON.stringify(report, null, 2) + "\n");
    };
    const numList = (name, fallback) => {
      const v = arg(name, "");
      return v ? v.split(",").map(Number) : fallback;
    };
    await run("A", "sheetShort", () =>
      probeSheetShort(ctx, {
        widths: numList("widths", [320, 375, 568, 640, 667, 812, 926]),
        heights: numList("heights", [60, 80, 100, 120, 140, 160, 180, 200, 240, 280, 320, 400]),
      }),
    );
    await run("H", "zoomEquivalents", () =>
      probeSheetShort(ctx, { widths: [320, 640, 400], heights: [200, 256, 300, 400] }),
    );
    await run("C", "rotation", () => probeRotation(ctx));
    await run("D", "selectTruncation", () => probeSelects(ctx));
    await run("B", "feedbackVisibility", () => probeFeedback(ctx));
    await run("F", "focusSweep", () => probeFocus(ctx));
    await run("G", "clippedContent200", () => probeClipped(ctx, { fontPx: 32 }));
    await run("G0", "clippedContentDefault", () => probeClipped(ctx, { fontPx: 0 }));
    await run("E", "forcedColors", () => probeForcedColors(ctx));
    await run("J", "feedbackObstruction", () => probeObstruction(ctx));
    await run("L", "allocationStates", async () => {
      const { gm, player } = ctx;
      await applyViewport(gm, VP.desktop);
      await clickText(gm, "button", /^Roll it$/);
      await waitFor(player, `document.body.textContent.includes("Your roll")`, 30000, "allocation");
      const out = {};
      out.focus = await focusSweep(player, "player allocation phone", { max: 90 });
      out.clipped = await clippedFor(player, "player allocation", 32);
      await setForced([player], true);
      out.forced = await recordForced(player, "player-allocation-phone", VP.phone);
      await setForced([player], false);
      await ev(
        player,
        `document.querySelectorAll("fieldset.allocation-die-group").forEach(g => g.querySelector("input[type=radio]")?.click())`,
      );
      out.forcedAssigned = await (async () => {
        await setForced([player], true);
        const r = await recordForced(player, "player-allocation-assigned-phone", VP.phone);
        await setForced([player], false);
        return r;
      })();
      return out;
    });
  } catch (error) {
    report.errors.push({
      probe: "bootstrap/main",
      error: String(error.stack ?? error).slice(0, 1200),
    });
    console.log("FATAL", error.message);
  } finally {
    report.console = Object.fromEntries(
      devices.map((d) => [
        d.name,
        { consoleErrors: d.consoleErrors, failedRequests: d.failedRequests },
      ]),
    );
    report.finishedAt = new Date().toISOString();
    writeFileSync(join(OUT, "probe-report.json"), JSON.stringify(report, null, 2) + "\n");
    try {
      cdp?.ws.close();
    } catch {
      /* ignore */
    }
    chrome.kill();
    console.log("probe report ->", join(OUT, "probe-report.json"));
    process.exit(0);
  }
}
main();
