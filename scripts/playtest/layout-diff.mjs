#!/usr/bin/env node
// Compares two `ui-audit.mjs --layout-dump` files (the rounded box of every visible element, per state
// and viewport at the DEFAULT text size) and reports every element that moved or resized. It exists to
// prove that a CSS change meant only for large text or narrow phones leaves the default-size layout
// identical: run the audit against the old bundle and the new one, then
//
//   node scripts/playtest/layout-diff.mjs before.json after.json [--tolerance 1] [--show 8]
//                                         [--allow-skip join-form]...
//
// A state is "comparable" when both runs rendered the same element paths (the same DOM); states whose
// DOM differs between runs (a random roll, a different number of dice) are listed, not compared; an
// element whose own text differs between runs (a random room code) is counted, not compared. Exits
// 1 when any comparable state has an element off by more than the tolerance (default 1 CSS px, to
// absorb sub-pixel rounding), when nothing was comparable, when the two dumps cover different
// state/viewport keys (a partial dump must not read as identical), or when a state is not comparable and
// was not named by --allow-skip (a substring of the key; use it for a DOM change you made on purpose).
// The dump keeps display:none elements as zero boxes, so a stylesheet that hides or shows an element at
// some width is a moved box here, not a skipped "different DOM".

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flagIndexes = new Set();
args.forEach((a, i) => {
  if (a.startsWith("--")) {
    flagIndexes.add(i);
    flagIndexes.add(i + 1);
  }
});
const files = args.filter((_, i) => !flagIndexes.has(i));
const allowSkip = args.flatMap((a, i) => (a === "--allow-skip" ? [args[i + 1]] : []));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};
const TOLERANCE = flag("tolerance", 1);
const SHOW = flag("show", 8);
if (files.length !== 2) {
  console.error("usage: layout-diff.mjs before.json after.json [--tolerance 1] [--show 8]");
  process.exit(2);
}
const [before, after] = files.map((f) => JSON.parse(readFileSync(f, "utf8")));

const parse = (line) => {
  const parts = line.split("|");
  const text = parts[parts.length - 1];
  const [x, y, w, h] = parts.slice(-5, -1).map(Number);
  return { path: parts.slice(0, -5).join("|"), x, y, w, h, text };
};

let comparable = 0;
let identical = 0;
let skipped = 0;
let elements = 0;
let contentVaried = 0;
const moved = [];
const onlyBefore = Object.keys(before).filter((key) => !(key in after));
const onlyAfter = Object.keys(after).filter((key) => !(key in before));
for (const key of onlyBefore) console.log(`MISSING from the second dump: ${key}`);
for (const key of onlyAfter) console.log(`MISSING from the first dump: ${key}`);
let unallowedSkips = 0;
for (const key of Object.keys(before)) {
  if (!(key in after)) continue;
  const a = before[key].map(parse);
  const b = after[key].map(parse);
  if (a.length !== b.length || a.some((el, i) => el.path !== b[i].path)) {
    skipped += 1;
    const allowed = allowSkip.some((fragment) => key.includes(fragment));
    if (!allowed) unallowedSkips += 1;
    console.log(
      `not comparable (different DOM${allowed ? ", allowed" : ""}): ${key} (${a.length} vs ${b.length} elements)`,
    );
    continue;
  }
  comparable += 1;
  elements += a.length;
  // An element whose own text differs between the runs (a random room code) may legitimately be wider or
  // narrower: it is counted, not compared.
  const diffs = a
    .map((el, i) => ({ el, to: b[i] }))
    .filter(({ el, to }) => {
      const off = ["x", "y", "w", "h"].some((k) => Math.abs(el[k] - to[k]) > TOLERANCE);
      if (off && el.text !== to.text) {
        contentVaried += 1;
        return false;
      }
      return off;
    });
  if (diffs.length === 0) {
    identical += 1;
    continue;
  }
  moved.push({ key, count: diffs.length, of: a.length, sample: diffs.slice(0, SHOW) });
}

for (const m of moved) {
  console.log(`DIFF ${m.key}: ${m.count}/${m.of} elements moved or resized`);
  for (const { el, to } of m.sample) {
    console.log(
      `   ${el.path.split(">").slice(-3).join(">")}: ${el.x},${el.y} ${el.w}x${el.h} -> ${to.x},${to.y} ${to.w}x${to.h}`,
    );
  }
}
console.log(
  `${comparable} comparable state/viewport pairs (${elements} elements), ${identical} identical, ${moved.length} differ, ${skipped} not comparable, ${contentVaried} element boxes differ only where their own text differs`,
);
if (comparable === 0) {
  console.log("LAYOUT DIFF FAILED: nothing was comparable");
  process.exit(1);
}
if (onlyBefore.length + onlyAfter.length > 0) {
  console.log("LAYOUT DIFF FAILED: the dumps cover different state/viewport keys");
  process.exit(1);
}
if (unallowedSkips > 0) {
  console.log(
    `LAYOUT DIFF FAILED: ${unallowedSkips} state(s) have a different DOM and were not named by --allow-skip`,
  );
  process.exit(1);
}
console.log(moved.length === 0 ? "LAYOUT IDENTICAL" : "LAYOUT DIFFERS");
process.exit(moved.length === 0 ? 0 : 1);
