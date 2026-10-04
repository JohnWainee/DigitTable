#!/usr/bin/env node
// Large-text stress probe for the checkbox / radio option rows (`.gear-option` + `.option-text`) in a real
// browser. ui-audit.mjs covers 150% and 200% text from 320px up on the app's real screens; this probe goes
// further with the app's REAL stylesheet on a synthetic page of the same markup and nesting (screen > step >
// fieldset > list > row, the GM pending-action card, a stat row with its icon, a utility item with its own button,
// the landing "written down" row and the GM's Reveal row): 100-300% root text (iOS goes to about 310%) at viewport
// widths from 240px (below any phone) to 768px, using the longest words in the roster. It needs only Google Chrome
// and a stylesheet (the built one, or `--css apps/web/src/styles.css`), no emulators:
//
//   node scripts/playtest/option-row-stress.mjs [--css path/to/styles.css] [--out report.json] [--expect-failures]
//
// Hard failures (exit 1; the rules live in optionRowStressRules.mjs, which a unit test drives): horizontal overflow
// of the page, a row or its text; a box, text or action button outside its row; a row under 48px; a long word cut
// while its text still sits beside the box (it must stack first); any row stacked at the default text size on a
// >= 320px viewport (a row that fits must not move); and any cut word at <= 200% text on a >= 320px viewport (the
// supported range). Beyond that range a word wider than a whole stacked line (e.g. "Phantasmagoria" at 250% on
// 320px) may break INSIDE its row: reported as a note, never as overflow.
//
// `--expect-failures` is the negative control: it exits 0 only if the stylesheet fails in the intended way (at
// least one word cut while still beside its box), so a probe that only ever reported some other failure cannot
// pass for it. Run it against the pre-fix stylesheet (`git show <base>:apps/web/src/styles.css`).
//
// Why iframes: an iframe's viewport IS its width (media queries and vw units included), whereas a headless
// window will not go below ~500px, which would silently test the wrong width.

import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { evaluateStress } from "./optionRowStressRules.mjs";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};
const EXPECT_FAILURES = args.includes("--expect-failures");
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
function builtStylesheet() {
  const assets = resolve("apps/web/dist/assets");
  return join(assets, readdirSync(assets).find((f) => f.endsWith(".css")) ?? "missing.css");
}
const cssPath = resolve(arg("css", "") || builtStylesheet());
const css = readFileSync(cssPath, "utf8");

const WIDTHS = arg("widths", "240,280,320,375,412,768")
  .split(",")
  .map((value) => Number(value.trim()));
if (WIDTHS.length === 0 || WIDTHS.some((w) => !Number.isInteger(w) || w <= 0)) {
  console.error("--widths must be a comma list of positive integer viewport widths");
  process.exit(2);
}
const SCALES = [1, 1.5, 2, 2.5, 3];
const LABELS = [
  "Phantasmagoria (1 Blood) — not enough Blood",
  "[5] Panzerfaust (1/1 uses)",
  "[1] M3 submachine gun (3/3 uses)",
  "Fragmentation grenades (2/2 uses) — mark to regain 1 Blood",
  "Gefährlich verwundet (2 Blood)",
  "No stat fits (2 dice)",
];
const row = (text, i, type) =>
  `<label class="gear-option"><input type="${type}" name="${type === "radio" ? "r" : "c" + i}"${
    i === 1 ? " checked" : ""
  }${i === 0 ? " disabled" : ""}><span class="option-text">${text}</span></label>`;
const rows = (type) => LABELS.map((text, i) => row(text, i, type)).join("");
// The compose stat rows: radio, then the stat's icon (a flex item with a 0.3em margin), then the text. Real stat labels
// are short; the one `data-stress` row carries a long ability-length label to show an icon row stacking, and is exempt
// from the "never stacks at the default size" rule (an icon and a 14-letter word really do not fit side by side there).
const STAT_LABELS = ["Con (4)", "Terrify (3)", "Search (2)", "No stat fits (2 dice)"];
const statRow = (text, i, stress) =>
  `<label class="gear-option"${stress ? " data-stress" : ""}><input type="radio" name="s"${i === 1 ? " checked" : ""}><svg class="etr-icon stat-icon" aria-hidden="true"></svg><span class="option-text">${text}</span></label>`;
const statRows =
  STAT_LABELS.map((text, i) => statRow(text, i, false)).join("") +
  statRow("Phantasmagoria (1 Blood) \u2014 not enough Blood", 4, true);
const utilityItem = `<div class="gear-item"><label class="gear-option"><input type="checkbox" disabled><span class="option-text">Cigarettes taken from the pockets of hanged men (3/3 uses) — mark to regain 2 Blood</span></label><button type="button" class="secondary-action">Mark and regain Blood</button></div>`;
const writtenDown = `<label class="gear-option form-field--checkbox" for="wd"><input id="wd" type="checkbox"><span class="option-text">I have written these down</span></label>`;
const revealRow = `<div class="gear-option"><span>Station Patrol A (hidden from players)</span><button type="button" class="secondary-action">Reveal</button></div>`;

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>html{overflow:hidden !important;scrollbar-gutter:auto !important}</style></head><body>
<main class="player-screen"><section class="step"><h2>Choose</h2>
<fieldset><legend>Stat</legend>${statRows}</fieldset>
<fieldset><legend>Items</legend><div class="gear-list">${rows("checkbox")}${utilityItem}</div></fieldset>
<fieldset><legend>Abilities</legend>${rows("radio")}</fieldset>
${writtenDown}
</section><ul style="list-style:none;margin:0;padding:0"><li class="pending-action-card">
<fieldset><legend>Bonus claims</legend><div class="gear-list">${rows("checkbox")}</div></fieldset>
<div class="gear-list">${revealRow}</div></li></ul></main>
<script>
const results = [];
// The width a word needs on one line, measured in a hidden probe with the text's own font.
const need = (word, host) => {
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:" + getComputedStyle(host).font;
  probe.textContent = word;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  return Math.round(width);
};
const kindOf = (el) =>
  el.matches("div.gear-option")
    ? "action"
    : el.hasAttribute("data-stress")
      ? "stress"
      : el.closest(".pending-action-card")
        ? "gm-card"
        : el.querySelector("input").type;
for (const scale of ${JSON.stringify(SCALES)}) {
  document.documentElement.style.fontSize = scale * 100 + "%";
  document.body.offsetHeight;
  const doc = document.documentElement;
  const rows = [];
  for (const el of document.querySelectorAll(".gear-option")) {
    const kind = kindOf(el);
    const input = el.querySelector("input");
    const text = el.querySelector(".option-text") ?? el.querySelector("span");
    const button = el.querySelector(".secondary-action") ?? el.parentElement.querySelector(":scope > .secondary-action");
    const lr = el.getBoundingClientRect();
    const tr = text.getBoundingClientRect();
    const box = input ? input.getBoundingClientRect() : null;
    const words = [];
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      for (const m of node.data.matchAll(/\\p{L}{5,}/gu)) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        words.push({ word: m[0], broken: lines.size > 1, need: need(m[0], text) });
      }
    }
    const br = button ? button.getBoundingClientRect() : null;
    // A utility item's button sits in the .gear-item beside the label: it must stay inside that item.
    const itemRight = el.closest(".gear-item") ? el.closest(".gear-item").getBoundingClientRect().right : lr.right;
    rows.push({
      where: kind,
      rowW: Math.round(lr.width),
      rowH: Math.round(lr.height),
      rowScrollOver: el.scrollWidth - el.clientWidth,
      textOverRight: Math.round(tr.right - lr.right),
      boxOutside: box ? Math.round(Math.max(lr.left - box.left, box.right - lr.right)) : 0,
      buttonOver: br ? Math.max(0, Math.round(br.right - itemRight)) : 0,
      stacked: box ? tr.top >= box.bottom - 1 : !!br && br.top >= tr.bottom - 1,
      textW: Math.round(tr.width),
      words,
    });
  }
  results.push({ scale, pageOverflow: doc.scrollWidth - doc.clientWidth, rows });
}
parent.postMessage({ width: innerWidth, results }, "*");
</script></body></html>`;

const dir = mkdtempSync(join(tmpdir(), "option-row-stress-"));
writeFileSync(join(dir, "child.html"), page);
writeFileSync(
  join(dir, "host.html"),
  `<!doctype html><meta charset="utf-8"><body style="margin:0"><pre id="out"></pre>
${WIDTHS.map((w) => `<iframe src="child.html" width="${w}" height="900" style="border:0;display:block"></iframe>`).join("")}
<script>
const seen = [];
addEventListener("message", (e) => {
  seen.push(e.data);
  if (seen.length === ${WIDTHS.length}) document.getElementById("out").textContent = JSON.stringify(seen);
});
</script>`,
);

// Headless Chrome prints the DOM and then does not exit by itself, so wait for the end of the dump (or a
// deadline) and kill its process group; the profile directory is removed on every way out.
function cleanUp() {
  rmSync(dir, { recursive: true, force: true });
}
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    `--user-data-dir=${join(dir, "profile")}`,
    "--virtual-time-budget=8000",
    "--dump-dom",
    `file://${join(dir, "host.html")}`,
  ],
  { stdio: ["ignore", "pipe", "pipe"], detached: true },
);
let stdout = "";
let stderr = "";
const timedOut = await new Promise((resolve) => {
  const stop = (reason) => {
    clearTimeout(deadline);
    try {
      process.kill(-chrome.pid, "SIGKILL");
    } catch {
      // already gone
    }
    resolve(reason);
  };
  const deadline = setTimeout(() => stop(true), 60_000);
  chrome.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (stdout.includes("</html>")) stop(false);
  });
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  chrome.on("error", () => stop(false));
  chrome.on("exit", () => stop(false));
});
const match = /<pre id="out">([\s\S]*?)<\/pre>/.exec(stdout);
if (!match) {
  cleanUp();
  console.error(
    timedOut
      ? "Chrome produced no result within 60s."
      : "Chrome produced no result (is Google Chrome installed? set CHROME_PATH).",
  );
  console.error(stderr.slice(0, 600));
  process.exit(2);
}
const decode = (s) =>
  s
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
const byWidth = JSON.parse(decode(match[1]));
cleanUp();
if (byWidth.length !== WIDTHS.length) {
  console.error(`expected ${WIDTHS.length} frames, got ${byWidth.length}`);
  process.exit(2);
}
// A frame with no rows at all would pass vacuously: refuse it.
const expectedRows = 5 + 6 + 1 + 6 + 1 + 6 + 1; // stat; items + utility item; abilities; landing row; GM card + Reveal row
for (const { width, results } of byWidth) {
  for (const { scale, rows } of results) {
    if (rows.length !== expectedRows) {
      console.error(
        `${width}px @ ${scale * 100}%: measured ${rows.length} rows, expected ${expectedRows}`,
      );
      process.exit(2);
    }
  }
}

const { failures, notes, besideBoxFailures } = evaluateStress(byWidth);
writeFileSync(
  arg("out", join(dir, "report.json")),
  JSON.stringify(
    { css: cssPath, widths: WIDTHS, scales: SCALES, failures, notes, byWidth },
    null,
    2,
  ),
);
for (const f of failures.slice(0, 40)) console.log(`FAIL  ${f}`);
if (failures.length > 40) console.log(`... and ${failures.length - 40} more`);
for (const n of notes.slice(0, 12)) console.log(`note  ${n}`);
const frames = byWidth.reduce((n, f) => n + f.results.length, 0);
console.log(
  `option-row stress: ${frames} width x scale frames, ${failures.length} failures, ${notes.length} out-of-range cut words (${cssPath})`,
);
if (EXPECT_FAILURES) {
  const ok = besideBoxFailures > 0;
  console.log(
    ok
      ? `NEGATIVE CONTROL OK (${besideBoxFailures} words cut while still beside their box)`
      : "NEGATIVE CONTROL FAILED (no word was cut beside its box on this stylesheet)",
  );
  process.exit(ok ? 0 : 1);
}
console.log(
  failures.length === 0 ? "OPTION-ROW STRESS PASSED" : "OPTION-ROW STRESS FOUND PROBLEMS",
);
process.exit(failures.length === 0 ? 0 : 1);
