import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ORIGINAL_ROSTER } from "@digitable/template-eat-the-reich";
import { describe, expect, it } from "vitest";

/**
 * Static contract over the real-browser harnesses in `scripts/playtest/`. They run against live
 * emulators and cannot be part of `npm run check`, so the failure modes that already bit them are
 * pinned here:
 *
 * - a hard-coded character name. The sourcebook roster renamed the seat whose id is still `rook`
 *   (now "Iryna"), and `ui-audit.mjs` kept looking for `/^rook/i`, so its only modal pop-out audit
 *   could no longer open the correction sheet;
 * - an interaction the audit was never taught to visit: the signed-out recovery form and the
 *   recovery-code reveal are secret-handling surfaces and must stay in the sweep.
 */

const here = dirname(fileURLToPath(import.meta.url));
function script(name: string): string {
  const source = readFileSync(join(here, "../../../../scripts/playtest", name), "utf8");
  // Line comments stripped: prose may name a character, executable selectors may not.
  return source.replace(/^\s*\/\/.*$/gm, "");
}

const audit = script("ui-audit.mjs");
const smoke = script("two-device-smoke.mjs");

describe("playtest harness selectors", () => {
  it("covers the live roster, so the check below is not vacuous", () => {
    expect(ORIGINAL_ROSTER.length).toBeGreaterThanOrEqual(6);
    expect(ORIGINAL_ROSTER.map((c) => c.name)).toContain("Iryna");
  });

  it.each([
    ["ui-audit.mjs", audit],
    ["two-device-smoke.mjs", smoke],
  ])("%s never matches a character by name or id", (_name, source) => {
    for (const character of ORIGINAL_ROSTER) {
      for (const needle of [character.name, character.id]) {
        const word = new RegExp(`\\b${needle.replace(/[^A-Za-z0-9]/g, ".")}\\b`, "i");
        expect(source, `"${needle}" is hard-coded`).not.toMatch(word);
      }
    }
    // The retired placeholder name, which is no longer in the roster at all.
    expect(source).not.toMatch(/\brook\b/i);
  });

  it("opens the correction sheet from the first listed character, whatever the roster is", () => {
    expect(audit).toContain('document.querySelector(".roster-panel-list li button")');
  });
});

describe("ui-audit.mjs interaction coverage", () => {
  it("visits the recovery form, its rejection state, and the one-time recovery reveal", () => {
    for (const state of ["recover-form", "recover-rejected", "recover-reveal"]) {
      expect(audit, state).toContain(`"${state}"`);
    }
  });

  it("redeems a real recovery code only after every step that needs the original seat holder", () => {
    const redeem = audit.indexOf('"recover-reveal"');
    // Redeeming revokes the original device's binding, so the last player/GM-flow state precedes it.
    for (const state of ["console-next-scene", "next-scene", "paused", "resolved"]) {
      expect(audit.lastIndexOf(`"${state}"`), state).toBeLessThan(redeem);
    }
  });

  it("redeems the recovery code the way a phone keyboard delivers it, from a fresh join form", () => {
    expect(audit).toContain("codes.playerRecovery.toLowerCase()");
    // A same-hash navigation keeps the previous recover-mode state; the route must change first.
    expect(audit).toMatch(
      /goto\(anon, "#\/"\);\s*await goto\(anon, "#\/join"\);\s*await clickText\(anon, "button", \/Recover your seat\/\);\s*await setInput\(anon, "#recover-room-code", codes/,
    );
  });
});
