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
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const [tagA, ...boxA] = a[i];
    const [tagB, ...boxB] = b[i];
    if (ignoreTags.includes(tagA) && tagA === tagB) continue; // e.g. a per-run room code in <strong>
    if (tagA !== tagB || boxA.some((v, j) => Math.abs(v - boxB[j]) > tolerance)) {
      perViewport[viewport] = (perViewport[viewport] ?? 0) + 1;
      if (!allowViewports.includes(viewport)) {
        moved += 1;
        if (moved <= 40)
          console.log(`MOVED ${key} #${i} ${tagA} ${boxA.join(",")} -> ${tagB} ${boxB.join(",")}`);
      }
      break; // first divergence per state is enough; later boxes shift as a consequence
    }
  }
}
console.log(
  JSON.stringify({
    statesCompared: Object.keys(before).length,
    perViewportFirstDivergence: perViewport,
    unexpectedDivergent: moved,
    structure,
  }),
);
process.exit(moved > 0 || structure > 0 ? 1 : 0);
