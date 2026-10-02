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

chrome.kill();
if (failures.length) {
  console.log(`\nSELF-TEST FAILED: ${failures.join(", ")}`);
  process.exit(1);
}
console.log("\nSELF-TEST PASSED");
process.exit(0);
