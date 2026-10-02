import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeRecoveryCodeEntry } from "../../src/landing/secretEntry.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("normalizeRecoveryCodeEntry", () => {
  it("upper-cases and strips padding or pasted whitespace", () => {
    expect(normalizeRecoveryCodeEntry("  abcd efgh\tjk2\n")).toBe("ABCDEFGHJK2");
  });

  it("leaves an already-canonical code byte for byte unchanged", () => {
    expect(normalizeRecoveryCodeEntry("23456789ABCDE")).toBe("23456789ABCDE");
  });
});

describe("GM identifier fields", () => {
  // Item and member ids are lower-case machine ids (`member-…`); a phone keyboard that capitalises
  // or autocorrects them yields an id that matches nothing. Source pin: the panel needs a live GM
  // projection to render, and these two inputs are only the id fields.
  it.each(["grant-item-id", "reassign-member-id"])(
    "%s opts out of keyboard text rewriting",
    (id) => {
      const source = readFileSync(join(here, "../../src/gm2/GmToolsPanel.tsx"), "utf8");
      const start = source.indexOf(`id="${id}"`);
      expect(start).toBeGreaterThan(-1);
      const element = source.slice(start, source.indexOf("/>", start));
      expect(element).toContain('autoCapitalize="none"');
      expect(element).toContain('autoCorrect="off"');
      expect(element).toContain("spellCheck={false}");
    },
  );
});
