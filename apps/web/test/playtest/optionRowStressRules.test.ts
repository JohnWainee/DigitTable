import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * `scripts/playtest/option-row-stress.mjs` measures real rows in Chrome; `optionRowStressRules.mjs` decides
 * what counts as a failure. The decision is pure, so it is driven here with synthetic frames: every hard
 * failure fires on the frame that should trigger it, the supported range turns a cut word from a note into a
 * failure, and a clean frame passes. (The browser measurement itself is covered by the probe's negative
 * control, run against the pre-fix stylesheet.)
 */

interface Word {
  word: string;
  broken: boolean;
  need: number;
}
interface Row {
  where: string;
  rowW: number;
  rowH: number;
  rowScrollOver: number;
  textOverRight: number;
  boxOutside: number;
  buttonOver: number;
  stacked: boolean;
  textW: number;
  words: Word[];
}
type Frames = { width: number; results: { scale: number; pageOverflow: number; rows: Row[] }[] }[];
interface Verdict {
  failures: string[];
  notes: string[];
  besideBoxFailures: number;
}

const here = dirname(fileURLToPath(import.meta.url));
const rulesUrl = pathToFileURL(
  join(here, "../../../../scripts/playtest/optionRowStressRules.mjs"),
).href;
const { evaluateStress } = (await import(/* @vite-ignore */ rulesUrl)) as {
  evaluateStress: (frames: Frames) => Verdict;
};

const clean: Row = {
  where: "checkbox",
  rowW: 221,
  rowH: 52,
  rowScrollOver: 0,
  textOverRight: 0,
  boxOutside: 0,
  buttonOver: 0,
  stacked: false,
  textW: 150,
  words: [{ word: "Panzerfaust", broken: false, need: 120 }],
};
const frame = (width: number, scale: number, row: Partial<Row>, pageOverflow = 0): Frames => [
  { width, results: [{ scale, pageOverflow, rows: [{ ...clean, ...row }] }] },
];

describe("option-row stress verdict", () => {
  it("passes clean rows at every width and scale", () => {
    for (const width of [240, 320, 375, 768]) {
      for (const scale of [1, 1.5, 2, 3]) {
        expect(evaluateStress(frame(width, scale, {}))).toEqual({
          failures: [],
          notes: [],
          besideBoxFailures: 0,
        });
      }
    }
  });

  it.each([
    ["page overflow", frame(375, 2, {}, 6), "page overflows by 6px"],
    ["row scrolling sideways", frame(375, 2, { rowScrollOver: 4 }), "scrolls sideways"],
    ["text overrunning the row", frame(375, 2, { textOverRight: 3 }), "text overruns the row"],
    ["box outside the row", frame(375, 2, { boxOutside: 2 }), "box outside the row"],
    ["action button overrunning", frame(375, 2, { buttonOver: 5 }), "action button overruns"],
    ["row under 48px", frame(375, 1, { rowH: 40 }), "tall (< 48)"],
    ["stacking at the default size", frame(375, 1, { stacked: true }), "stacked at the default"],
  ])("fails on %s", (_name, frames, message) => {
    const { failures } = evaluateStress(frames);
    expect(failures.length).toBeGreaterThan(0);
    expect(failures.join("\n")).toContain(message);
  });

  it("exempts the Reveal row and a deliberate stress row from the default-size stacking rule only", () => {
    for (const where of ["action", "stress"]) {
      expect(evaluateStress(frame(320, 1, { where, stacked: true })).failures).toEqual([]);
      // ...but not from any other rule.
      expect(
        evaluateStress(frame(320, 1, { where, stacked: true, rowH: 30 })).failures,
      ).toHaveLength(1);
    }
  });

  const cut: Word = { word: "Phantasmagoria", broken: true, need: 223 };

  it("fails a word cut while its text is still beside the box, and counts it for the negative control", () => {
    const verdict = evaluateStress(frame(375, 2, { words: [cut], stacked: false }));
    expect(verdict.failures.join("\n")).toContain("while still beside its box");
    expect(verdict.besideBoxFailures).toBe(1);
  });

  it("fails a word cut after stacking inside the supported range (<= 200%, >= 320px), and only notes it beyond", () => {
    const supported = evaluateStress(frame(320, 2, { words: [cut], stacked: true }));
    expect(supported.failures.join("\n")).toContain("inside the supported range");
    expect(supported.besideBoxFailures).toBe(0);
    for (const [width, scale] of [
      [320, 2.5],
      [375, 3],
      [240, 2],
      [240, 1.5],
    ] as const) {
      const verdict = evaluateStress(frame(width, scale, { words: [cut], stacked: true }));
      expect(verdict.failures, `${width}px @ ${scale * 100}%`).toEqual([]);
      expect(verdict.notes).toHaveLength(1);
    }
  });

  it("pins the thresholds at their boundaries", () => {
    // 48px is the tap height: 47 fails, 48 passes.
    expect(evaluateStress(frame(375, 1, { rowH: 47 })).failures).toHaveLength(1);
    expect(evaluateStress(frame(375, 1, { rowH: 48 })).failures).toEqual([]);
    // The default-size rule starts at exactly 320px and applies to the GM card's rows too.
    expect(evaluateStress(frame(320, 1, { stacked: true })).failures).toHaveLength(1);
    expect(evaluateStress(frame(319, 1, { stacked: true })).failures).toEqual([]);
    expect(
      evaluateStress(frame(375, 1, { where: "gm-card", stacked: true })).failures,
    ).toHaveLength(1);
    // The supported range ends at 200%: exactly 200% on exactly 320px is inside it.
    expect(evaluateStress(frame(320, 2, { words: [cut], stacked: true })).failures).toHaveLength(1);
    expect(evaluateStress(frame(320, 2.5, { words: [cut], stacked: true })).failures).toEqual([]);
    expect(evaluateStress(frame(319, 2, { words: [cut], stacked: true })).failures).toEqual([]);
  });

  it("fails a word cut beside its box at ANY width and scale, supported or not", () => {
    for (const [width, scale] of [
      [240, 1],
      [250, 3],
      [280, 2],
      [375, 2.5],
      [768, 3],
    ] as const) {
      const verdict = evaluateStress(frame(width, scale, { words: [cut], stacked: false }));
      expect(verdict.besideBoxFailures, `${width}px @ ${scale * 100}%`).toBe(1);
      expect(verdict.failures.join("\n")).toContain("while still beside its box");
    }
  });

  it("does not let a failure of another kind stand in for the intended one", () => {
    // Only an overflow: it fails, but it is not the "cut while beside its box" failure the control needs.
    const verdict = evaluateStress(frame(375, 2, { rowScrollOver: 9 }));
    expect(verdict.failures).toHaveLength(1);
    expect(verdict.besideBoxFailures).toBe(0);
  });
});
