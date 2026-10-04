#!/usr/bin/env node
// Companion to layout-diff.mjs for a change that adds a wrapper element (so layout-diff.mjs calls those states
// "different DOM" and skips them). It drops every element whose path matches --ignore from the AFTER dump,
// then compares the rest state by state (x, y, width, height, tolerance 1px):
//
//   node scripts/playtest/layout-diff-ignoring.mjs before.json after.json --ignore 'label:\d+>span:\d+$'
//
// A state whose remaining paths still differ (a random roll, a different number of dice) is counted, not
// compared. Fails (exit 1) when any compared element changed SIZE, except a trailing `strong` (a random room
// code's text width). Elements that only TRANSLATED are listed by count: the pinned (`position: sticky`) action
// dock and its zero-size sprite container record a top that depends on the scroll position at dump time, and
// anything pushed by a resized sibling would have a resized sibling to report. So "no size changed" is the
// check that matters; the translation count is information.

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flagAt = (name) => args.indexOf(`--${name}`);
const ignoreAt = flagAt("ignore");
const files = args.filter((a, i) => !a.startsWith("--") && i !== ignoreAt + 1);
if (files.length !== 2 || ignoreAt < 0 || !args[ignoreAt + 1]) {
  console.error("usage: layout-diff-ignoring.mjs before.json after.json --ignore '<path regex>'");
  process.exit(2);
}
const ignore = new RegExp(args[ignoreAt + 1]);
const [before, after] = files.map((f) => JSON.parse(readFileSync(f, "utf8")));
const parse = (entries, skip) =>
  new Map(
    entries
      .map((e) => e.split("|"))
      .filter((f) => !(skip && ignore.test(f[0])))
      .map((f) => [f[0], f.slice(1, 5).map(Number)]),
  );

let compared = 0;
let identical = 0;
let notComparable = 0;
let translated = 0;
let randomCode = 0;
const resized = [];
for (const key of Object.keys(before)) {
  if (!(key in after)) continue;
  const b = parse(before[key], false);
  const a = parse(after[key], true);
  if (b.size !== a.size || [...b.keys()].some((p) => !a.has(p))) {
    notComparable += 1;
    continue;
  }
  compared += 1;
  let differs = false;
  for (const [path, [bx, by, bw, bh]] of b) {
    const [ax, ay, aw, ah] = a.get(path);
    const moved = Math.abs(bx - ax) > 1 || Math.abs(by - ay) > 1;
    const sized = Math.abs(bw - aw) > 1 || Math.abs(bh - ah) > 1;
    if (!moved && !sized) continue;
    differs = true;
    if (/>strong:\d+$/.test(path)) randomCode += 1;
    else if (sized) resized.push(`${key} ${path}: ${bw}x${bh} -> ${aw}x${ah}`);
    else translated += 1;
  }
  if (!differs) identical += 1;
}
console.log(
  `${compared} comparable states, ${identical} identical, ${notComparable} still not comparable after dropping /${ignore.source}/`,
);
console.log(
  `differing elements: ${randomCode} random-code width, ${translated} translated with the size unchanged (sticky dock / sprite container), ${resized.length} resized`,
);
for (const line of resized.slice(0, 20)) console.log(`  RESIZED ${line}`);
if (compared < 100) {
  console.log("TOO FEW COMPARABLE STATES: this proves nothing");
  process.exit(1);
}
if (resized.length) {
  console.log("LAYOUT DIFF (ignoring) FOUND SIZE CHANGES");
  process.exit(1);
}
console.log("LAYOUT DIFF (ignoring) PASSED: no element changed size");
