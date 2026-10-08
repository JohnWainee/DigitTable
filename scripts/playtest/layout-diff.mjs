#!/usr/bin/env node
// Compares two `ui-audit.mjs --layout-dump` files (default text size, every state and viewport) and
// lists every element whose box moved or resized by more than the tolerance. Use it to prove a CSS
// change leaves the default-size layout identical except where intended.
//
//   node scripts/playtest/layout-diff.mjs before.json after.json [--tolerance 1] [--allow-viewport phone-small] [--skip-state allocation] [--ignore-tag strong]
//
// Exit 1 when any difference remains outside the allowed viewports. States whose element lists differ
// in length (live data, such as a different number of rows) are reported as `structure` and compared
// only by their shared prefix.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const tolerance = Number(arg("tolerance", "1"));
const skipStates = args.flatMap((a, i) => (a === "--skip-state" ? [args[i + 1]] : []));
const ignoreTags = args.flatMap((a, i) => (a === "--ignore-tag" ? [args[i + 1]] : []));
const allowViewports = args.flatMap((a, i) => (a === "--allow-viewport" ? [args[i + 1]] : []));
const [beforeFile, afterFile] = args.filter(
  (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
);
const before = JSON.parse(readFileSync(beforeFile, "utf8"));
const after = JSON.parse(readFileSync(afterFile, "utf8"));

let moved = 0;
let structure = 0;
const perViewport = {};
for (const key of Object.keys(before)) {
  const viewport = key.split("@")[1];
  if (skipStates.some((skip) => key.includes(skip))) continue; // live data (random dice) differs per run
  const a = before[key];
  const b = after[key];
  if (!b) {
    console.log(`MISSING ${key}`);
    structure += 1;
    continue;
  }
  if (a.length !== b.length) {
    structure += 1;
    console.log(`STRUCTURE ${key}: ${a.length} vs ${b.length} elements`);
  }
  // Compare every element (not just the first divergence): an element whose box merely shifts
  // down because something above it grew is reported separately from one whose own size or x changed.
  const diverged = [];
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const [tagA, ...boxA] = a[i];
    const [tagB, ...boxB] = b[i];
    if (ignoreTags.includes(tagA) && tagA === tagB) continue; // e.g. a per-run room code in <strong>
    if (tagA !== tagB || boxA.some((v, j) => Math.abs(v - boxB[j]) > tolerance)) {
      diverged.push({
        i,
        tagA,
        tagB,
        boxA,
        boxB,
        own: tagA !== tagB || [0, 2, 3].some((j) => Math.abs(boxA[j] - boxB[j]) > tolerance),
      });
    }
  }
  if (diverged.length === 0) continue;
  perViewport[viewport] = (perViewport[viewport] ?? 0) + 1;
  if (allowViewports.includes(viewport)) continue;
  moved += 1;
  const own = diverged.filter((d) => d.own);
  console.log(
    `MOVED ${key}: ${diverged.length} element(s) differ, ${own.length} with their own x/width/height changed`,
  );
  for (const d of own.slice(0, 6)) {
    console.log(`   #${d.i} ${d.tagA} ${d.boxA.join(",")} -> ${d.tagB} ${d.boxB.join(",")}`);
  }
}
console.log(
  JSON.stringify({
    statesCompared: Object.keys(before).length,
    perViewportDivergentStates: perViewport,
    divergentStates: moved,
    structure,
  }),
);
process.exit(moved > 0 || structure > 0 ? 1 : 0);
