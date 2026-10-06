#!/usr/bin/env node
// Real-browser probe for the player's option rows (ComposeStep2): the row that carries its own action
// ("Mark and regain Blood") and the "Why?" disclosure.
//
// Why a harness: the live roster's only usable action item (Cigarettes) starts at 0 uses, so the row's
// button is not on screen in any normal playthrough and ui-audit.mjs never measures it. This starts a
// throwaway Vite dev server over apps/web, serves a virtual page that mounts the REAL ComposeStep2 with a
// character whose item is usable, and drives headless Chrome (CDP) at phone / tablet / desktop / table
// sizes and at 100% / 150% / 200% root text. No emulator, no Firebase, nothing deployed.
//
// At every size it asserts: (1) no <button>/<a>/<select>/<summary> inside any <label>; (2) no horizontal
// overflow and every row, label and action horizontally contained after scrolling the row into view; (3) label, checkbox row and
// action at least 44 px tall and the action at least 44 px wide; (4) the action's text is not broken
// mid-word; (5) tapping the label text toggles only its checkbox and tapping the action toggles nothing;
// (6) the "Why?" summary is at least 44 px tall and horizontally contained, and opening it adds no overflow.
//
// Usage: node scripts/playtest/option-row-probe.mjs [--root APPS_WEB_DIR] [--out DIR] [--port 9390] [--vite-port 5391] [--no-shots]
// Exit 1 if any assertion fails. No npm dependency beyond the repo's own vite; Node's WebSocket speaks CDP.

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const OUT = arg("out", "option-row-probe");
const PORT = Number(arg("port", "9390"));
const VITE_PORT = Number(arg("vite-port", "5391"));
const SHOTS = !args.includes("--no-shots");
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const root = resolve(arg("root", join(dirname(fileURLToPath(import.meta.url)), "../../apps/web")));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HARNESS_ID = "\0option-row-harness";
const harnessPlugin = {
  name: "option-row-harness",
  enforce: "pre",
  resolveId(id) {
    return id === "/option-row-harness.tsx" ? HARNESS_ID : null;
  },
  load(id) {
    if (id !== HARNESS_ID) return null;
    return `
      import { createElement } from "react";
      import { createRoot } from "react-dom/client";
      import { ORIGINAL_ROSTER } from "@digitable/template-eat-the-reich";
      import { ComposeStep2 } from "${root}/src/player2/ComposeStep2.tsx";
      import "${root}/src/styles.css";
      const rook = ORIGINAL_ROSTER.find((c) => c.id === "rook");
      const usable = (id) => ({ ...rook, items: rook.items.map((i) => i.id === id ? { ...i, usesRemaining: 1, poolEligible: true } : i) });
      const character = usable("rook-pocket-mirror");
      window.__used = [];
      createRoot(document.getElementById("root")).render(
        createElement(ComposeStep2, {
          projection: { view: { self: character, scene: null } },
          character,
          threats: [{ id: "t1", name: "Wehrmacht patrol with a very long unbroken designation", status: "active" }],
          onDeclare: () => {},
          onUseUtilityItem: (id) => window.__used.push(id),
        }));
    `;
  },
  configureServer(server) {
    server.middlewares.use("/option-row-harness.html", async (req, res) => {
      const html = await server.transformIndexHtml(
        req.url,
        `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
         <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
         <title>Option row harness</title></head><body><div id="root"></div>
         <script type="module" src="/option-row-harness.tsx"></script></body></html>`,
      );
      res.setHeader("content-type", "text/html");
      res.end(html);
    });
  },
};

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 0;
    this.pending = new Map();
    ws.onmessage = (event) => {
      const m = JSON.parse(event.data);
      const w = m.id === undefined ? null : this.pending.get(m.id);
      if (!w) return;
      this.pending.delete(m.id);
      if (m.error) w.reject(new Error(m.error.message));
      else w.resolve(m.result);
    };
  }
  static async connect(port) {
    for (let i = 0; i < 60; i += 1) {
      try {
        const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
        const ws = new WebSocket(v.webSocketDebuggerUrl);
        await new Promise((res, rej) => {
          ws.onopen = res;
          ws.onerror = rej;
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

const SIZES = [
  { name: "phone-375x812", w: 375, h: 812, mobile: true },
  { name: "phone-small-320x568", w: 320, h: 568, mobile: true },
  { name: "tablet-768x1024", w: 768, h: 1024, mobile: true },
  { name: "desktop-1280x800", w: 1280, h: 800, mobile: false },
  { name: "table-1920x1080", w: 1920, h: 1080, mobile: false },
];
const TEXT = [100, 150, 200];

const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right }; };
  const button = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Mark and regain Blood"));
  const row = button.closest(".gear-option");
  const label = button.closest("label") ?? row.querySelector(":scope > label");
  const summary = document.querySelector("summary");
  const nested = [...document.querySelectorAll("label")].filter((l) => l.querySelector("button, a[href], select, textarea, summary")).length;
  const overflowing = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > vw + 1 && getComputedStyle(el).position !== "fixed").length;
  // A word broken mid-word makes the button taller than two text lines at its own line height.
  const bs = getComputedStyle(button);
  const lines = Math.round((button.getBoundingClientRect().height - parseFloat(bs.paddingTop) - parseFloat(bs.paddingBottom) - 4) / parseFloat(bs.lineHeight === "normal" ? parseFloat(bs.fontSize) * 1.2 : bs.lineHeight));
  return {
    vw, scrollW: document.documentElement.scrollWidth, nested, overflowing,
    row: rect(row), label: rect(label), button: rect(button), summary: rect(summary), buttonLines: lines,
    buttonScrollOverflow: button.scrollWidth > button.clientWidth + 1,
  };
})()`;

const failures = [];
const rows = [];
const check = (scenario, name, ok, detail = "") => {
  rows.push({ scenario, name, ok, detail });
  if (!ok) failures.push(`${scenario}: ${name} ${detail}`);
};

const server = await createServer({
  root,
  configFile: resolve(root, "vite.config.ts"),
  plugins: [harnessPlugin],
  server: { port: VITE_PORT, strictPort: true, host: "127.0.0.1" },
  logLevel: "error",
});
await server.listen();
const profile = mkdtempSync(join(tmpdir(), "digitable-option-row-probe-"));
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

try {
  const cdp = await Cdp.connect(PORT);
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  for (const d of ["Page", "Runtime"]) await cdp.send(`${d}.enable`, {}, sessionId);
  const ev = async (expression) => {
    const r = await cdp.send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const tap = async (x, y) => {
    for (const type of ["mousePressed", "mouseReleased"]) {
      await cdp.send(
        "Input.dispatchMouseEvent",
        { type, x, y, button: "left", clickCount: 1 },
        sessionId,
      );
    }
  };

  for (const size of SIZES) {
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.mobile },
      sessionId,
    );
    for (const text of TEXT) {
      const scenario = `${size.name}@${text}%`;
      await cdp.send(
        "Page.navigate",
        { url: `http://127.0.0.1:${VITE_PORT}/option-row-harness.html` },
        sessionId,
      );
      for (let i = 0; i < 80; i += 1) {
        if (await ev(`Boolean(document.querySelector(".gear-option button"))`).catch(() => false))
          break;
        await sleep(250);
      }
      await ev(`document.documentElement.style.fontSize = "${(16 * text) / 100}px"; 0`);
      await sleep(150);
      await ev(`document.querySelector(".gear-option").scrollIntoView({ block: "center" }); 0`);
      const m = await ev(MEASURE);
      check(
        scenario,
        "no interactive control inside a label",
        m.nested === 0,
        `nested=${m.nested}`,
      );
      check(
        scenario,
        "no horizontal overflow",
        m.scrollW <= m.vw && m.overflowing === 0,
        `scrollW=${m.scrollW} vw=${m.vw} overflowing=${m.overflowing}`,
      );
      check(
        scenario,
        "row, label, action and disclosure are horizontally contained",
        [m.row, m.label, m.button, m.summary].every((r) => r.x >= -0.5 && r.r <= m.vw + 0.5),
        JSON.stringify({ row: m.row, button: m.button }),
      );
      check(scenario, "label tap target >= 44px", m.label.h >= 43.5, `h=${m.label.h}`);
      check(
        scenario,
        "action >= 44px tall and wide",
        m.button.h >= 43.5 && m.button.w >= 43.5,
        `${m.button.w}x${m.button.h}`,
      );
      check(
        scenario,
        "action text not broken mid-word",
        !m.buttonScrollOverflow && m.buttonLines <= 3,
        `lines=${m.buttonLines}`,
      );
      check(scenario, "'Why?' summary >= 44px", m.summary.h >= 43.5, `h=${m.summary.h}`);
      // This local fixture makes the item checkbox usable. Tap its label text: it toggles only that
      // checkbox. Tap the action: it fires once and does not toggle the checkbox.
      // Re-measure and hit-test right before each tap (layout settles after fonts load).
      const center = (selector) =>
        ev(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          el.scrollIntoView({ block: "center" });
          const r = el.getBoundingClientRect();
          const x = r.x + r.width / 2, y = r.y + r.height / 2;
          return { x, y, hit: document.elementFromPoint(x, y) === el || el.contains(document.elementFromPoint(x, y)) };
        })()`);
      const checked = () =>
        ev(
          `document.querySelector(".gear-option .option-text").closest(".gear-option").querySelector("input").checked`,
        );
      const before = await checked();
      const lp = await center(".gear-option .option-text");
      await tap(lp.x, lp.y);
      const afterLabel = await checked();
      check(
        scenario,
        "tapping the label toggles its checkbox",
        before !== afterLabel && lp.hit,
        JSON.stringify(lp),
      );
      const used0 = await ev(`window.__used.length`);
      const bp = await center(".gear-option .gear-option-action");
      await tap(bp.x, bp.y);
      const afterButton = await checked();
      const used1 = await ev(`window.__used.length`);
      check(
        scenario,
        "tapping the action fires once and does not toggle the checkbox",
        used1 === used0 + 1 && afterButton === afterLabel && bp.hit,
        `used ${used0}->${used1} ${JSON.stringify(bp)}`,
      );

      // Open the disclosure: it stays in flow and adds no overflow.
      await ev(`document.querySelector("details").open = true; 0`);
      await sleep(80);
      const sw = await ev(
        `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
      );
      check(scenario, "open 'Why?' adds no horizontal overflow", sw);
      if (SHOTS && text !== 150) {
        await ev(`document.querySelector(".gear-option").scrollIntoView({ block: "center" }); 0`);
        const shot = await cdp.send(
          "Page.captureScreenshot",
          { format: "jpeg", quality: 70 },
          sessionId,
        );
        writeFileSync(join(OUT, `${size.name}-text${text}.jpg`), Buffer.from(shot.data, "base64"));
      }
    }
  }
} finally {
  chrome.kill();
  await server.close();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}

writeFileSync(
  join(OUT, "report.json"),
  JSON.stringify({ failures, checks: rows.length, rows }, null, 2),
);
console.log(`${rows.length} checks, ${failures.length} failures`);
for (const f of failures) console.log(`FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
