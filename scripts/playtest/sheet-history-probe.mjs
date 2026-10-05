#!/usr/bin/env node
// Real-browser probe: what does the browser Back action (Android system Back / gesture, iOS Safari edge
// swipe, desktop Back button) do while the GM correction sheet is open?
//
// ui-audit.mjs proves where the sheet sits and how it scrolls; it never presses Back. The app is a
// single-page hash router and the sheet is not a route, so before `useBackDismiss` Back navigated from
// `#/room/<id>/gm` to the previous route (`#/create`): the GM lost the sheet, the reason they were typing
// and the whole director console in one gesture. This drives the REAL app (live mode against the Firebase
// emulators, like two-device-smoke.mjs) on a 390x844 touch-emulated phone and checks:
//
//   A. Back with the sheet open closes ONLY the sheet: same route, console still mounted, no hashchange.
//   B. The sheet can be reopened and closed with Back again (the entry it pushes is released/recreated).
//   C. Closing by Cancel (or Escape) leaves no dead entry: the very next Back leaves the route, exactly as
//      it did before any sheet was opened (Back is never swallowed for nothing).
//
// Usage (needs the emulators and a build served by `vite preview`, see docs/RUNBOOK.md):
//   node scripts/playtest/sheet-history-probe.mjs --base http://127.0.0.1:4173 [--port 9370] [--expect-failures]
//
// `--expect-failures` is the negative control: it exits 0 only if scenario A FAILS in the intended way (Back
// left the console), so run it against a bundle built without the fix to prove the probe can fail.
// The signature is checked, not just "A failed": the route changed AND the console is gone.
//
// LIMIT: Back is issued as `history.back()` and the buttons are clicked with `el.click()` through
// Runtime.evaluate, so Chrome's "history manipulation intervention" (which skips entries created without a
// user gesture when the real Back button is used) is NOT exercised. Real taps carry user activation; the
// iOS Simulator test `testBackClosesOnlyTheSheet` presses Safari's real Back button and covers that gap.
// No npm dependency: launches the machine's Google Chrome headless and speaks CDP over Node's WebSocket.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const BASE = arg("base", "http://127.0.0.1:4173").replace(/\/$/, "");
const PORT = Number(arg("port", "9370"));
const EXPECT_FAILURES = args.includes("--expect-failures");
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

const profile = mkdtempSync(join(tmpdir(), "digitable-history-probe-"));
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
  await setInput("#session-name", "History Probe");
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
  await ev(
    `window.__hashChanges = 0; addEventListener("hashchange", () => { window.__hashChanges += 1; })`,
  );

  // A. Back closes only the sheet.
  await openSheet();
  await setInput("#correction-reason", "typed before Back");
  await back();
  const afterA = await snapshot();
  const hashChanges = await ev(`window.__hashChanges`);
  record(
    "A. Back with the sheet open closes only the sheet (same route, console still mounted, no hashchange)",
    !afterA.dialog && afterA.console && afterA.hash === route && hashChanges === 0,
    { afterA, hashChanges },
  );
  const aOk = results[results.length - 1].ok;

  if (aOk) {
    // B. Reopen, close with Back again.
    await openSheet();
    await back();
    const afterB = await snapshot();
    record(
      "B. The sheet reopens and closes with Back again",
      !afterB.dialog && afterB.console && afterB.hash === route,
      { afterB },
    );

    // C. Cancel leaves no dead history entry: the next Back leaves the route as it always did.
    await openSheet();
    await click('[role="dialog"] button', /^Cancel$/);
    await waitFor(`!document.querySelector('[role="dialog"]')`);
    await sleep(300);
    const afterCancel = await snapshot();
    await back();
    const afterNextBack = await snapshot();
    record(
      "C. After Cancel the very next Back leaves the route (no dead entry swallowed it)",
      !afterCancel.dialog && afterCancel.hash === route && afterNextBack.hash !== route,
      { afterCancel, afterNextBack },
    );
  }

  const failed = results.filter((r) => !r.ok);
  if (EXPECT_FAILURES) {
    // Negative control: the pre-fix bundle must fail scenario A by leaving the console.
    const intended = !aOk && afterA.hash !== route && !afterA.console;
    console.log(
      intended ? "negative control: failed as intended" : "negative control: DID NOT FAIL",
    );
    exitCode = intended ? 0 : 1;
  } else {
    exitCode = failed.length === 0 ? 0 : 1;
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
