#!/usr/bin/env node
// Stress probe for checkbox / radio option rows (`.gear-option` + `.option-text`) in a REAL browser. The full
// audit (ui-audit.mjs) covers 150% and 200% text from 320px up on the app's real screens; this probe pushes
// past it with the app's REAL built stylesheet on a synthetic page of the same markup: 100-300% root text
// (iOS goes to about 310%) at viewport widths from 240px (below the smallest phone) to 768px, in both the
// plain player step and the GM pending-action card (whose rows have tighter px gutters), with the longest
// names in the roster. It needs only Google Chrome and a built web app (`npm run build`), no emulators:
//
//   node scripts/playtest/option-row-stress.mjs [--css apps/web/dist/assets/index-XXXX.css] [--out report.json]
//
// Hard failures (exit 1): any horizontal overflow of the page, a row or its text; a box or text outside
// its row; a row under 48px; a word cut while it sits beside its box (it should have stacked first); a word
// cut though it would fit on its own full-width line; and ANY broken word at <= 200% text on a viewport of
// 320px or more (the supported range; the real compose row measures 221px at 320, the same as this page).
// A word wider than the whole stacked line beyond that range (e.g. "Phantasmagoria" at 250% on 320px, or at
// 150% on a 240px viewport) may break inside the row: that is reported, never as overflow.
//
// The page is synthetic (the real stylesheet and class names, the app's step / fieldset / row nesting, and
// the GM card) so it can reach sizes and widths the app's screens cannot. The ui-audit.mjs broken-word check
// stays the authority for the real screens at 150% and 200%.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const assets = resolve("apps/web/dist/assets");
const cssPath = resolve(
  arg("css", join(assets, readdirSync(assets).find((f) => f.endsWith(".css")) ?? "missing.css")),
);
const css = readFileSync(cssPath, "utf8");

const WIDTHS = (arg("widths", "240,280,320,375,412,768") ?? "")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);
if (WIDTHS.length === 0)
  throw new Error("--widths must contain one or more positive integer viewport widths");
const SCALES = [1, 1.5, 2, 2.5, 3];
const NAMES = [
  "Phantasmagoria (1 Blood) — not enough Blood",
  "Panzerfaust (1/1 uses)",
  "Sawn-off submachine gun (3/3 uses)",
  "Fragmentation grenade (2/2 uses) — mark to regain 1 Blood",
  "Enormous knife (4/4 uses)",
  "No stat fits (2 dice)",
];
const row = (text, i, type = "checkbox") =>
  `<label class="gear-option"><input type="${type}" name="g${type === "radio" ? "" : i}"${i === 1 ? " checked" : ""}${
    i === 0 ? " disabled" : ""
  }><span class="option-text">${text}</span></label>`;
const rows = NAMES.map((n, i) => row(n, i)).join("");
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style>
<style>html{overflow:hidden !important;scrollbar-gutter:auto !important}</style></head><body>
<div id="root"><main class="player-screen"><section class="step"><h2>Choose an action</h2>
<fieldset data-case="step"><legend>Items</legend><div class="gear-list">${rows}</div></fieldset>
<fieldset data-case="radio"><legend>Stat</legend>${NAMES.map((n, i) => row(n, i, "radio")).join("")}</fieldset>
</section><ul style="list-style:none;margin:0;padding:0"><li class="pending-action-card">
<fieldset data-case="pending"><legend>Bonus claims</legend><div class="gear-list">${rows}</div></fieldset></li></ul></main></div>
<script>
const results = [];
const fontSize = (s) => { document.documentElement.style.fontSize = s * 100 + "%"; };
for (const scale of ${JSON.stringify(SCALES)}) {
  fontSize(scale);
  document.body.offsetHeight;
  const doc = document.documentElement;
  const rowsOut = [];
  for (const label of document.querySelectorAll("label.gear-option")) {
    const box = label.querySelector("input").getBoundingClientRect();
    const text = label.querySelector(".option-text");
    const lr = label.getBoundingClientRect();
    const tr = text.getBoundingClientRect();
    const words = [];
    const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const re = /[A-Za-z]{8,}/g;
      for (let m = re.exec(node.data); m; m = re.exec(node.data)) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const rects = [...range.getClientRects()];
        const lines = new Set(rects.map((r) => Math.round(r.top)));
        // Width of the word on one line: measure it unbroken in a probe span with the same font.
        const probe = document.createElement("span");
        probe.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;font:" + getComputedStyle(text).font;
        probe.textContent = m[0];
        document.body.appendChild(probe);
        const need = probe.getBoundingClientRect().width;
        probe.remove();
        words.push({ word: m[0], broken: lines.size > 1, need: Math.round(need) });
      }
    }
    rowsOut.push({
      inCard: !!label.closest(".pending-action-card"), kase: label.closest("fieldset").dataset.case,
      rowW: Math.round(lr.width), rowH: Math.round(lr.height),
      rowScrollOver: label.scrollWidth - label.clientWidth,
      textOverRight: Math.round(tr.right - lr.right), boxOverRight: Math.round(box.right - lr.right),
      boxOverLeft: Math.round(lr.left - box.left),
      stacked: tr.top >= box.bottom - 1,
      textW: Math.round(tr.width), words,
    });
  }
  results.push({ scale, pageOverflow: doc.scrollWidth - doc.clientWidth, rows: rowsOut });
}
parent.postMessage({ width: innerWidth, results }, "*");
</script></body></html>`;

const dir = mkdtempSync(join(tmpdir(), "option-row-stress-"));
writeFileSync(join(dir, "child.html"), page);
// One iframe per width: an iframe's viewport IS its width (media queries and vw units included), whereas a
// headless window will not go below ~500px, which would silently test the wrong width.
const host = `<!doctype html><meta charset="utf-8"><body style="margin:0"><pre id="out"></pre>
${WIDTHS.map((w) => `<iframe src="child.html" width="${w}" height="900" style="border:0;display:block"></iframe>`).join("")}
<script>
const seen = [];
addEventListener("message", (e) => {
  seen.push(e.data);
  if (seen.length === ${WIDTHS.length}) document.getElementById("out").textContent = JSON.stringify(seen);
});
</script>`;
writeFileSync(join(dir, "host.html"), host);

const report = [];
const failures = [];
const run = spawnSync(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    `--user-data-dir=${join(dir, "profile")}`,
    "--window-size=1400,1000",
    "--virtual-time-budget=8000",
    "--dump-dom",
    `file://${join(dir, "host.html")}`,
  ],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120000 },
);
const match = /<pre id="out">([\s\S]*?)<\/pre>/.exec(run.stdout);
if (!match) {
  console.log(`no probe output (Chrome exit ${run.status})`);
  process.exit(1);
}
const decode = (t) =>
  t
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
const frames = JSON.parse(decode(match[1])).sort((a, b) => a.width - b.width);
if (JSON.stringify(frames.map((f) => f.width)) !== JSON.stringify(WIDTHS)) {
  failures.push(`iframe viewports were ${frames.map((f) => f.width)}, wanted ${WIDTHS}`);
}
for (const { width, results } of frames) {
  for (const { scale, pageOverflow, rows } of results) {
    const where = `${width}px @ ${scale * 100}%`;
    if (pageOverflow > 0) failures.push(`${where}: page overflows by ${pageOverflow}px`);
    const broken = [];
    for (const r of rows) {
      if (r.rowScrollOver > 1)
        failures.push(`${where}: a row scrolls ${r.rowScrollOver}px sideways`);
      if (r.textOverRight > 1)
        failures.push(`${where}: text overruns its row by ${r.textOverRight}px`);
      if (r.boxOverRight > 1 || r.boxOverLeft > 1) failures.push(`${where}: a box leaves its row`);
      if (r.rowH < 48) failures.push(`${where}: a row is ${r.rowH}px tall (< 48)`);
      for (const w of r.words) {
        if (!w.broken) continue;
        broken.push(w.word);
        // A word may only be cut once it has been given its own full-width line (stacked) and is STILL wider
        // than that line. Cut while sitting beside the box, or cut though it would fit alone, is the defect.
        if (!r.stacked)
          failures.push(
            `${where}: "${w.word}" broke beside its box (${r.kase}) instead of stacking`,
          );
        else if (scale <= 2 && width >= 320)
          failures.push(
            `${where}: "${w.word}" broke at a supported size in ${r.kase} (${w.need}px word, ${r.textW}px text, ${r.rowW}px row)`,
          );
        else if (w.need + 1 < r.textW)
          failures.push(
            `${where}: "${w.word}" broke though it fits stacked (${w.need}px <= ${r.textW}px, ${r.kase})`,
          );
      }
    }
    report.push({
      width,
      scale,
      rowWidth: Math.min(...rows.map((r) => r.rowW)),
      pageOverflow,
      stackedRows: rows.filter((r) => r.stacked).length,
      totalRows: rows.length,
      brokenWords: [...new Set(broken)],
    });
  }
}
const out = arg("out", "");
if (out) writeFileSync(out, JSON.stringify({ css: cssPath, report, failures }, null, 2));
for (const r of report) {
  console.log(
    `${String(r.width).padStart(3)}px ${String(r.scale * 100).padStart(3)}%  row ${String(r.rowWidth).padStart(3)}px  stacked ${r.stackedRows}/${r.totalRows}  overflow ${r.pageOverflow}  broken: ${r.brokenWords.join(", ") || "-"}`,
  );
}
if (failures.length) {
  console.log(`\nOPTION-ROW STRESS FOUND PROBLEMS (${failures.length}):`);
  for (const f of [...new Set(failures)].slice(0, 40)) console.log(`  ${f}`);
  process.exit(1);
}
console.log("\nOPTION-ROW STRESS PASSED");
