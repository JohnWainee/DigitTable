#!/usr/bin/env node
// Self-test for the detectors in scripts/playtest/ui-audit.mjs. A passing audit proves nothing unless the
// audit can also fail, so this feeds the audit's own in-page expressions (extracted verbatim from that
// file, never copied) small synthetic pages: each defect class must be reported on the bad page and the
// good page must come back clean. It needs only the machine's Google Chrome (no emulators, no app build):
//
//   node scripts/playtest/ui-audit-selftest.mjs [--port 9361]
//
// Exits 1 if any detector misses a defect it claims to catch or flags a clean page.

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "ui-audit.mjs"), "utf8");

/** The text of a top-level `const NAME = `...`;` template literal, evaluated like the audit evaluates it. */
function expression(name) {
  const match = source.match(new RegExp("const " + name + " = `([\\s\\S]*?)`;\\n"));
  if (!match) throw new Error(`${name} not found in ui-audit.mjs`);
  return new Function("return `" + match[1] + "`")();
}

const CONTROL_AUDIT = expression("CONTROL_AUDIT");
const KEYBOARD_FOCUS_AUDIT = expression("KEYBOARD_FOCUS_AUDIT");
const DOCK_AUDIT = expression("DOCK_AUDIT");

const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const PORT = portIndex >= 0 ? Number(args[portIndex + 1]) : 9361;
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "ui-audit-selftest-"))}`,
    "--no-first-run",
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
  throw new Error("Chrome DevTools endpoint never came up");
}

let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve) => {
    const id = (nextId += 1);
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const {
  result: { targetId },
} = await send("Target.createTarget", { url: "about:blank" });
const {
  result: { sessionId },
} = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send(
  "Emulation.setDeviceMetricsOverride",
  { width: 375, height: 468, deviceScaleFactor: 1, mobile: true },
  sessionId,
);

async function page(html, expr) {
  const doc = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0;font:16px sans-serif">${html}</body>`;
  await send("Page.navigate", { url: "data:text/html," + encodeURIComponent(doc) }, sessionId);
  await sleep(450);
  const response = await send(
    "Runtime.evaluate",
    { expression: expr, awaitPromise: true, returnByValue: true },
    sessionId,
  );
  if (response.result.exceptionDetails) {
    throw new Error(response.result.exceptionDetails.exception?.description ?? "evaluation failed");
  }
  return response.result.result.value;
}

const problemsOf = (audit) => audit.issues.flatMap((issue) => issue.problems);
const failures = [];
function expectProblem(name, audit, fragment) {
  const found = problemsOf(audit).some((problem) => problem.includes(fragment));
  console.log(`${found ? "ok  " : "FAIL"} ${name}: reports "${fragment}"`);
  if (!found) failures.push(name);
}
function expectClean(name, audit) {
  const found = problemsOf(audit);
  console.log(
    `${found.length === 0 ? "ok  " : "FAIL"} ${name}: reports nothing${found.length ? " (got " + found.join("; ") + ")" : ""}`,
  );
  if (found.length) failures.push(name);
}

// ---- CONTROL_AUDIT ----
const nested = await page(
  `<label class="gear-option"><input type="checkbox"> Cigarettes <button class="secondary-action" style="min-height:48px;min-width:48px">Mark and regain Blood</button></label>`,
  CONTROL_AUDIT,
);
expectProblem("button nested in a label", nested, "interactive control nested inside a <label>");

const classless = await page(
  `<button style="min-height:48px;min-width:96px">Destroy hat</button>`,
  CONTROL_AUDIT,
);
expectProblem("class-less button", classless, "button without a reskin class");

const squeezed = await page(
  `<button class="secondary-action" style="width:40px;min-height:48px;padding:0">Mark and regain Blood</button>`,
  CONTROL_AUDIT,
);
expectProblem("squeezed button", squeezed, "label squeezed onto");

const longOption = "Threat: Station Patrol Bravo at the far gate";
const truncated = await page(
  `<select id="t" style="width:140px;min-height:48px;font-size:16px"><option>${longOption}</option></select>`,
  CONTROL_AUDIT,
);
expectProblem("truncated select without echo", truncated, "is truncated and not echoed in full");

const echoed = await page(
  `<select id="t" style="width:140px;min-height:48px;font-size:16px"><option>${longOption}</option></select><p data-select-echo-for="t">Selected ${longOption}</p>`,
  CONTROL_AUDIT,
);
expectClean("truncated select WITH a visible full-text echo", echoed);

const hiddenEcho = await page(
  `<select id="t" style="width:140px;min-height:48px;font-size:16px"><option>${longOption}</option></select><p data-select-echo-for="t" style="display:none">Selected ${longOption}</p>`,
  CONTROL_AUDIT,
);
expectProblem("select whose echo is hidden", hiddenEcho, "is truncated and not echoed in full");

const shortSelect = await page(
  `<select id="s" style="width:300px;min-height:48px;font-size:16px"><option>Iryna</option></select>`,
  CONTROL_AUDIT,
);
expectClean("select whose value fits", shortSelect);

const nativeForm = await page(
  `<form><input required style="min-height:48px;font-size:16px"><button type="submit" class="primary-action" style="min-height:48px;min-width:48px">Go</button></form>`,
  CONTROL_AUDIT,
);
expectProblem(
  "form relying on native validation",
  nativeForm,
  "relies on native validation bubbles",
);

const inlineForm = await page(
  `<form novalidate><input required style="min-height:48px;font-size:16px"><button type="submit" class="primary-action" style="min-height:48px;min-width:48px">Go</button></form>`,
  CONTROL_AUDIT,
);
expectClean("noValidate form", inlineForm);

const cleanButton = await page(
  `<label style="display:flex;align-items:center;min-height:48px;min-width:48px"><input type="checkbox"> Item</label><button class="secondary-action" style="min-height:48px;min-width:96px">Use it</button>`,
  CONTROL_AUDIT,
);
expectClean("a sibling styled button", cleanButton);

// ---- KEYBOARD_FOCUS_AUDIT (viewport is 468px tall: the "keyboard" is already up) ----
const kb = (results) => results.filter((r) => !r.inside || !r.unobscured);
const field = `<input id="a" style="height:48px;font-size:16px">`;
const lower = `<input id="b" style="height:48px;font-size:16px">`;
const open = await page(`${field}<div style="height:900px"></div>${lower}`, KEYBOARD_FOCUS_AUDIT);
console.log(
  `${kb(open).length === 0 && open.length === 2 ? "ok  " : "FAIL"} keyboard focus: clear page reports nothing (${open.length} controls)`,
);
if (kb(open).length !== 0 || open.length !== 2) failures.push("keyboard-clear");

const covered = await page(
  `${field}<div style="height:900px"></div>${lower}<div style="position:fixed;left:0;right:0;bottom:0;height:60px;background:#f00"></div>`,
  KEYBOARD_FOCUS_AUDIT,
);
const coveredReport = kb(covered);
console.log(
  `${coveredReport.length === 1 && coveredReport[0].control === "input#b" ? "ok  " : "FAIL"} keyboard focus: a fixed bar over the lower input is reported covered`,
);
if (!(coveredReport.length === 1 && coveredReport[0].control === "input#b"))
  failures.push("keyboard-covered");

// ---- DOCK_AUDIT (viewport is 468px tall) ----
const rows = Array.from(
  { length: 14 },
  (_, i) =>
    `<label style="display:flex;align-items:center;height:48px"><input type="checkbox"> Row ${i}</label>`,
).join("");
const dockPage = (dockStyle, { describedBy = true, extra = "", scrollPadding = true } = {}) =>
  `${scrollPadding ? "<style>html{scroll-padding-bottom:110px}</style>" : ""}<div class="step" style="padding:16px">${rows}<div class="action-dock" style="${dockStyle}"><p id="s">Pool: 4 dice</p><button class="primary-action" ${describedBy ? 'aria-describedby="s"' : ""} style="height:48px">Go</button></div></div>${extra}`;
const dockProblems = async (name, html) => {
  const result = await page(html, DOCK_AUDIT);
  return result === null ? ["no dock found"] : result.flatMap((entry) => entry.problems);
};
function expectDock(name, problems, fragment) {
  const ok = fragment === null ? problems.length === 0 : problems.some((p) => p.includes(fragment));
  console.log(
    `${ok ? "ok  " : "FAIL"} dock audit, ${name}: ${fragment === null ? "reports nothing" : `reports "${fragment}"`}${!ok && problems.length ? " (got " + problems.join("; ") + ")" : ""}`,
  );
  if (!ok) failures.push("dock-" + name);
}
const stickyDock =
  "position:sticky;bottom:0;background:#000;color:#fff;height:90px;margin:0 -16px -16px;padding:8px 16px;box-sizing:border-box";
expectDock(
  "a sticky dock over a long panel",
  await dockProblems("good", dockPage(stickyDock)),
  null,
);
expectDock(
  "a sticky dock WITHOUT scroll-padding hides a control the browser scrolls to",
  await dockProblems("no-padding", dockPage(stickyDock, { scrollPadding: false })),
  "covered by the dock when focused",
);
expectDock(
  "a dock that is not pinned",
  await dockProblems("unpinned", dockPage("position:relative;height:90px")),
  "dock is not pinned",
);
expectDock(
  "a dock taller than 45% of the viewport",
  await dockProblems("tall", dockPage(stickyDock.replace("height:90px", "height:300px"))),
  "cap is 45%",
);
expectDock(
  "a primary button with no status",
  await dockProblems("undescribed", dockPage(stickyDock, { describedBy: false })),
  "no visible described-by status",
);

// ---- the REAL stylesheet: the dock at the 540-720px band, with two long buttons ----
// Rendered from apps/web/src/styles.css itself (not a copy), because the defect was in that CSS: at this
// width the actions were `flex: none`, crushed the status to a one-character column and overflowed.
const realCss = readFileSync(join(here, "../../apps/web/src/styles.css"), "utf8");
const APPLY_CLIPPED = true;
async function dockLayoutAt(width, rootFontPx = 16, height = 900, gmCard = false) {
  await send(
    "Emulation.setDeviceMetricsOverride",
    { width, height, deviceScaleFactor: 1, mobile: false },
    sessionId,
  );
  const rowsHtml = Array.from(
    { length: 8 },
    (_, i) => `<label class="gear-option"><input type="radio" name="c"> Category ${i}</label>`,
  ).join("");
  const dockHtml = `<div class="action-dock"><p id="s" class="action-dock-status">Pool: 4 dice</p><div class="action-dock-actions"><button class="primary-action">Roll it</button><button class="secondary-action">Destroy Cowboy hat to ignore this result</button></div></div>`;
  const result = await page(
    `<style>${realCss}</style><style>html{font-size:${rootFontPx}px}</style>${gmCard ? `<main class="gm-screen"><section class="step"><h2>Pending actions</h2><ul class="pending-actions-list"><li class="pending-action-card">${dockHtml}</li></ul></section></main>` : `<main class="player-screen"><section class="step"><h2>Choose an injury</h2>${rowsHtml}${dockHtml}</section></main>`}`,
    `(() => {
      const dock = document.querySelector(".action-dock");
      const status = document.querySelector(".action-dock-status");
      // What useActionDockInset does in the app: mark the dock while its content overflows the cap.
      if (${APPLY_CLIPPED}) dock.toggleAttribute("data-clipped", dock.scrollHeight > dock.clientHeight + 1);
      const box = dock.getBoundingClientRect();
      const primary = document.querySelector(".primary-action").getBoundingClientRect();
      return {
        clipped: dock.hasAttribute("data-clipped"),
        primaryVisible: primary.top >= box.top - 1 && primary.bottom <= box.bottom + 1,
        statusWidth: Math.round(status.getBoundingClientRect().width),
        dockHeight: Math.round(dock.getBoundingClientRect().height),
        dockOverflowX: dock.scrollWidth - dock.clientWidth,
        pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        innerHeight,
      };
    })()`,
  );
  return result;
}
// 320 and 360 are the phone column; the 32px root is "200% text" (rem-sized padding and type double).
for (const [width, font, height, gm] of [
  [320, 16],
  [360, 16],
  [320, 32],
  [320, 32, 568],
  [375, 24, 667],
  [320, 32, 568, true],
  [320, 24, 568, true],
  [540, 16],
  [600, 16],
  [700, 16],
  [800, 16],
]) {
  const layout = await dockLayoutAt(width, font, height, gm);
  const ok =
    layout.statusWidth >= 120 &&
    layout.dockHeight <= layout.innerHeight * 0.45 + 1 &&
    layout.dockOverflowX <= 1 &&
    layout.pageOverflowX <= 1 &&
    // The primary action is visible without scrolling the dock, even when the content overflows its cap.
    layout.primaryVisible;
  console.log(
    `${ok ? "ok  " : "FAIL"} real stylesheet, dock at ${width}px / ${font}px text, ${height ?? 900}px tall${gm ? ", GM card" : ""}, with two long buttons: ${JSON.stringify(layout)}`,
  );
  if (!ok) failures.push(`dock-layout-${width}-${font}-${height ?? 900}${gm ? "-gm" : ""}`);
}
await send(
  "Emulation.setDeviceMetricsOverride",
  { width: 375, height: 468, deviceScaleFactor: 1, mobile: true },
  sessionId,
);

chrome.kill();
if (failures.length) {
  console.log(`\nSELF-TEST FAILED: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nSELF-TEST PASSED");
process.exit(0);
