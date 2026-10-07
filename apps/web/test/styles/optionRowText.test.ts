import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every `label.gear-option` option row must hold its text in an element, never as a bare text node.
 * The stylesheet lets the row's text shrink and break (`.gear-option > span { min-width: 0;
 * overflow-wrap: anywhere }`), but a bare text node becomes an *anonymous* flex item that CSS cannot
 * reach: its min-width stays `auto` (the longest word), so at 320 px with 200% text the check/radio
 * row stays wider than its card and the whole GM console scrolls sideways. jsdom does no layout, so
 * this pins the markup shape; the live geometry is gated by `scripts/playtest/ui-audit.mjs`
 * (`closed-page-no-overflow`).
 */

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "../../src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

/** What is left of a label's body once its non-text children are removed. */
function bareText(body: string): string {
  return body
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/<input\b[\s\S]*?\/>/g, "")
    .replace(/<Icon\b[\s\S]*?\/>/g, "")
    .replace(/<span\b[\s\S]*?<\/span>/g, "")
    .trim();
}

describe("option rows keep their text in a shrinkable element", () => {
  const rows = sourceFiles(srcRoot).flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(/<label\b[^>]*\bgear-option\b[^>]*>([\s\S]*?)<\/label>/g)].map(
      (match) => ({ file: file.slice(srcRoot.length + 1), body: match[1]! }),
    );
  });

  it("finds the option rows (guards against the scan silently matching nothing)", () => {
    expect(rows.length).toBeGreaterThanOrEqual(14);
  });

  it.each(rows.map((row, i) => [`${row.file} #${i}`, row] as const))(
    "%s has no bare text node",
    (_name, row) => {
      expect(bareText(row.body)).toBe("");
    },
  );

  it("keeps the stylesheet rule that lets that element shrink and break", () => {
    const css = readFileSync(join(srcRoot, "styles.css"), "utf8");
    expect(css).toMatch(
      /\.gear-option > span\s*\{[^}]*min-width:\s*0[^}]*overflow-wrap:\s*anywhere/,
    );
  });
});
