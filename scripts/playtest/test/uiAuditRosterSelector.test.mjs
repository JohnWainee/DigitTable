import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Regression: `openCorrection` in ui-audit.mjs once hard-coded the placeholder character's name
// ("Rook") into its selector for the roster panel's "Correct" button. The sourcebook roster
// replaced that character's *visible* name with "Iryna" while keeping the internal id "rook"
// (templates/eat-the-reich/src/roster.ts), which made the hard-coded, text-content-based
// selector never match — silently truncating every live UI audit run to the states reachable
// before that step, with the script printing a FAIL rather than a false PASS. A roster-agnostic
// fix landed independently once already (docs/reviews/2026-09-25-sonnet-w-ui-audit-roster-selector-review.md)
// but was not present on this branch's ui-audit.mjs, so this static test exists to make that
// class of regression fail fast in `npm run check`, without needing a live browser/emulator run.
const source = readFileSync(fileURLToPath(new URL("../ui-audit.mjs", import.meta.url)), "utf8");

describe("ui-audit.mjs roster-panel correction selector", () => {
  it("never re-introduces a character-name-specific selector for the Correct button", () => {
    expect(source).not.toMatch(/rook/i);
  });

  it("selects the Correct button by exact text and enabled state, not by list position or name", () => {
    const match = source.match(/const finder = `([^`]*roster-panel-list[^`]*)`;/);
    expect(match).not.toBeNull();
    const finderSource = match[1];
    expect(finderSource).toContain(".roster-panel-list button");
    expect(finderSource).toContain('"Correct"');
    expect(finderSource).toContain("!b.disabled");
  });
});
