#!/usr/bin/env node
// Real-browser probe: does the GM correction sheet keep its actions on screen when a person applies the
// WCAG 1.4.12 (Text Spacing) override, with and without the on-screen keyboard up?
//
// SC 1.4.12 says no loss of content or functionality when a user sets line height to 1.5x, paragraph
// spacing 2x, letter spacing 0.12em and word spacing 0.16em (a dyslexia extension, a user style sheet, a
// bookmarklet). The sheet pins its title and its action row and scrolls only its body, so taller text can
// squeeze the body to nothing or push the action row past the bottom edge. ui-audit.mjs --text-spacing
// found the first sign of it (the "actionsVisible" keyboard check failing at 320x312); this probe isolates
// it on ONE live sheet and prints the numbers.
//
// For each size (a phone with the keyboard emulated by a smaller layout viewport, the way Chrome Android's
// interactive-widget=resizes-content does it) it measures, once with the override off and once on:
//   - whether the sheet switched to its compact (whole-sheet-scrolls) layout,
//   - the header, body and footer boxes and whether the body / footer have to scroll,
//   - whether Apply and Cancel are each fully inside the viewport AND inside the footer's own clip box,
//   - whether the focused reason field is fully visible in the body's scroll port.
//
// Checks (run with `--assert`, otherwise it only prints):
//   A. with the override ON, Apply and Cancel are each REACHABLE at every size: fully visible once scrolled
//      into view the way a person (or focus handling) would, whether the footer scrolls inside the pinned
//      sheet or the whole sheet scrolls in compact mode. SC 1.4.12 asks for no loss of content or
//      functionality, not for every control to sit on screen without scrolling, so "visible without
//      scrolling" is printed for information (`visible=`) and "reachable" (`reach=`) is what is asserted.
//
// Usage (needs the emulators and a build served by `vite preview`, see docs/RUNBOOK.md):
//   node scripts/playtest/sheet-text-spacing-probe.mjs --base http://127.0.0.1:4173 [--port 9390] [--assert]
//
// LIMIT: a CDP metrics override shrinks the LAYOUT viewport (Chrome Android behaviour); it cannot
// reproduce iOS Safari's visual-viewport-only keyboard (see ios-simulator/README.md). No npm dependency.

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
const PORT = Number(arg("port", "9390"));
const SHOTS = arg("shots", "");
const ASSERT = args.includes("--assert");
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

const profile = mkdtempSync(join(tmpdir(), "digitable-spacing-probe-"));
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

/** The standard override (what the W3C text-spacing bookmarklet injects). */
const SPACING_CSS =
  "*, *::before, *::after { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";

/** In-page measurement of the open sheet. Boxes are [left, top, right, bottom] in CSS px. */
const MEASURE = `(() => {
  const dialog = document.querySelector('[role="dialog"]');
  const backdrop = dialog.parentElement;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map((n) => Math.round(n * 10) / 10); };
  const body = dialog.querySelector(".sheet-body");
  const footer = dialog.querySelector(".sheet-footer");
  const header = dialog.querySelector(".sheet-header");
  const reason = document.querySelector("#correction-reason");
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const inFrame = (r, f, t = 1) => r && r[0] >= f[0] - t && r[2] <= f[2] + t && r[1] >= f[1] - t && r[3] <= f[3] + t;
  const viewport = [0, 0, vw, vh];
  const footerBox = box(footer);
  const sheetBox = box(dialog);
  // What of the sheet is on screen: the viewport clipped to the sheet (a control can sit inside the viewport yet
  // be clipped by the sheet that contains it).
  const clip = (a, b) => [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  const onScreenSheet = clip(viewport, sheetBox);
  const buttons = {};
  for (const [name, re] of [["apply", /apply correction/i], ["cancel", /cancel/i]]) {
    const b = [...dialog.querySelectorAll("button")].find((x) => re.test(x.textContent));
    const r = box(b);
    // Fully visible = inside the viewport, inside the sheet, and inside the footer's own scroll port.
    buttons[name] = { box: r, h: r ? Math.round(r[3] - r[1]) : null, visible: inFrame(r, clip(onScreenSheet, footerBox)) };
  }
  const bodyBox = box(body);
  return {
    vw, vh,
    compact: backdrop.hasAttribute("data-compact"),
    header: box(header), body: bodyBox, footer: footerBox, sheet: sheetBox,
    bodyScrolls: body.scrollHeight > body.clientHeight + 1,
    bodyVisibleH: bodyBox ? Math.round(Math.max(0, Math.min(bodyBox[3], vh) - Math.max(bodyBox[1], 0))) : 0,
    footerScrolls: footer.scrollHeight > footer.clientHeight + 1,
    footerH: footerBox ? Math.round(footerBox[3] - footerBox[1]) : null,
    sheetScrolls: dialog.scrollHeight > dialog.clientHeight + 1,
    buttons,
    reasonVisible: inFrame(box(reason), bodyBox ? clip(clip(viewport, sheetBox), bodyBox) : viewport),
    reasonBox: box(reason),
    pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
})()`;

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
  const setViewport = (width, height, mobile = true) =>
    cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width, height, deviceScaleFactor: 1, mobile },
      sessionId,
    );
  await setViewport(390, 844);
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
  const setSpacing = (on) =>
    ev(`(() => {
      document.querySelector("style[data-wcag-1412]")?.remove();
      if (${on}) {
        const style = document.createElement("style");
        style.setAttribute("data-wcag-1412", "");
        style.textContent = ${JSON.stringify(SPACING_CSS)};
        document.head.appendChild(style);
      }
      return true;
    })()`);
  const shot = async (name) => {
    if (!SHOTS) return;
    const { data } = await cdp.send(
      "Page.captureScreenshot",
      { format: "jpeg", quality: 70 },
      sessionId,
    );
    writeFileSync(join(SHOTS, `${name}.jpg`), Buffer.from(data, "base64"));
  };

  await navigate("#/");
  await navigate("#/create");
  await setInput("#session-name", "Spacing Probe");
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

  // [label, width, height]. "kb" sizes are a phone with the keyboard up (about 45% of the height taken).
  const SIZES = [
    ["phone-small 320x568", 320, 568],
    ["phone-small kb 320x312", 320, 312],
    ["phone 375x812", 375, 812],
    ["phone kb 375x447", 375, 447],
    ["phone-390 kb 390x464", 390, 464],
    ["phone-412 kb 412x503", 412, 503],
    ["phone-landscape 812x375", 812, 375],
    ["phone-landscape kb 812x206", 812, 206],
    ["tablet kb 768x563", 768, 563],
  ];
  const rows = [];
  for (const spacing of [false, true]) {
    for (const [label, width, height] of SIZES) {
      await setViewport(width, height, true);
      // Fresh sheet per size, as a person opens it: Correct, focus the reason field (the keyboard).
      await setSpacing(spacing);
      await sleep(150);
      if (!(await ev(`Boolean(document.querySelector('[role="dialog"]'))`))) {
        await click("button", /^Correct$/);
        await waitFor(`document.querySelector('[role="dialog"]')`);
      }
      await ev(`document.querySelector("#correction-reason").focus()`);
      await sleep(450);
      const m = await ev(MEASURE);
      // Reachable: scroll each action into view the way a person or focus handling would, then re-measure.
      const reach = {};
      for (const [name, re] of [
        ["apply", "/apply correction/i"],
        ["cancel", "/cancel/i"],
      ]) {
        await ev(
          `[...document.querySelectorAll('[role="dialog"] button')].find((b) => ${re}.test(b.textContent)).scrollIntoView({ block: "nearest" })`,
        );
        await sleep(80);
        reach[name] = (await ev(MEASURE)).buttons[name].visible;
      }
      m.reach = reach;
      await shot(`${spacing ? "on" : "off"}-${label.replace(/[^a-z0-9]+/gi, "-")}`);
      rows.push({ spacing, label, m });
      const a = m.buttons.apply;
      const c = m.buttons.cancel;
      console.log(
        `${spacing ? "SPACING" : "default"} ${label.padEnd(26)} compact=${m.compact ? "Y" : "n"} hdr=${Math.round(m.header[3] - m.header[1])} bodyVisible=${m.bodyVisibleH} footer=${m.footerH}${m.footerScrolls ? "(scrolls)" : ""} apply visible=${a.visible ? "y" : "n"} reach=${reach.apply ? "y" : "NO"} (h${a.h}) cancel visible=${c.visible ? "y" : "n"} reach=${reach.cancel ? "y" : "NO"} (h${c.h}) reason=${m.reasonVisible ? "ok" : "hidden"} overflowX=${m.pageOverflowX}`,
      );
    }
    // Close between the passes.
    await ev(
      `[...document.querySelectorAll('[role="dialog"] button')].find(b => /cancel/i.test(b.textContent))?.click()`,
    );
    await sleep(300);
  }

  if (ASSERT) {
    for (const { spacing, label, m } of rows) {
      if (!spacing) continue;
      const ok = m.reach.apply && m.reach.cancel && m.pageOverflowX <= 1;
      results.push({ label, ok });
      console.log(
        `${ok ? "PASS" : "FAIL"} ${label}: with text spacing Apply and Cancel are both reachable and nothing overflows the page${m.compact ? " (compact: the whole sheet scrolls)" : m.footerScrolls ? " (the footer scrolls)" : ""}`,
      );
    }
    exitCode = results.every((r) => r.ok) ? 0 : 1;
  }
} catch (error) {
  console.error(String(error));
  exitCode = 2;
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
process.exit(exitCode);
