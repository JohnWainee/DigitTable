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

describe("ui-audit.mjs pop-out, picker and form coverage", () => {
  it("audits every roster character's own compose screen and correction sheet, not only the first one's", () => {
    expect(audit).toContain("rosterSweep(cdp, gm, table, codes)");
    // The sweep walks the roster by position and the sheet audit takes an index: no character is named.
    expect(audit).toContain("auditSheetCase(gm, vp, index)");
    expect(audit).toContain('document.querySelectorAll(".roster-panel-list li button")[${index}]');
    expect(audit).toContain("/^Claim$/");
    // Redeeming a recovery code revokes the original device's binding, so the sweep runs before it.
    expect(audit.indexOf("await rosterSweep(")).toBeLessThan(audit.indexOf('"recover-reveal"'));
  });

  it("proves every text-entry control stays inside the viewport and uncovered with the keyboard up", () => {
    expect(audit).toContain("KEYBOARD_FOCUS_AUDIT");
    expect(audit).toContain("document.elementFromPoint");
    for (const name of ["phone-small", "phone", "phone-landscape"]) {
      expect(audit).toContain(`byName["${name}"]`);
    }
    // Run on the signed-out forms and on the GM console's long tools form.
    expect(audit).toContain("await auditKeyboardFocus(anon, name)");
    expect(audit).toContain('await auditKeyboardFocus(anon, "recover-form")');
    expect(audit).toContain('await auditKeyboardFocus(gm, "console-scene-loaded")');
  });

  it("submits each of the four signed-out forms invalid and expects the app's own inline errors", () => {
    for (const form of ["create-form", "join-form", "table-join-form", "recover-form"]) {
      expect(audit, form).toContain(`"${form}": {`);
    }
    expect(audit).toContain("auditInlineValidation(anon, VALIDATION[name])");
    expect(audit).toContain('auditInlineValidation(anon, VALIDATION["recover-form"])');
    expect(audit).toContain('[aria-invalid="true"]');
  });

  it("flags the defect classes a size-only control check let through", () => {
    for (const problem of [
      "interactive control nested inside a <label>",
      "button without a reskin class",
      "is truncated and not echoed in full",
      "relies on native validation bubbles",
    ]) {
      expect(audit, problem).toContain(problem);
    }
  });

  it("judges the sheet by what its mode promises: pinned actions normally, scrollable ones when compact", () => {
    // Real iOS Safari leaves ~70-140px on a landscape phone with the keyboard up; there the whole sheet
    // scrolls (data-compact), so "actions visible without scrolling" is the wrong test.
    for (const check of [
      "compactSheetScrolls",
      "actionsReachableByScrollingSheet",
      "titleReachableByScrollingSheet",
      "actionsVisible",
    ]) {
      expect(audit, check).toContain(check);
    }
    expect(audit).toContain("hasAttribute('data-compact')");
  });

  it("reproduces the iOS landscape-with-keyboard heights (60, 70 and 90px) and demands the compact sheet there", () => {
    expect(audit).toContain("tight-keyboard-${vp.name}-${visibleHeight}px");
    expect(audit).toMatch(/for \(const visibleHeight of \[90, 70, 60\]\)/);
    expect(audit).toContain("compactModeEngaged");
  });

  it("judges visibility against the sheet's own scrollport, not just the viewport", () => {
    // A control inside the viewport can still be clipped by the sheet that contains it (the wide-viewport
    // padding once left the focused field 36/48px visible at 70px while every viewport check passed).
    expect(audit).toContain("function visibleRegion(geo, frame)");
    expect(audit).toContain("focusedFieldVisibleInSheet");
    expect(audit).toContain("bodyRect: box(body)");
    // Reachability is "some scroll position shows the control whole", not "the bottom stop does".
    expect(audit).toContain("async function geometryRevealing(gm, key)");
    expect(audit).toContain('scrollIntoView({ block: "nearest" })');
    expect(audit).toContain("intersect(frame, applyGeo.dialog)");
  });

  it("runs the tight-keyboard cases with a landscape iPhone's safe-area insets too (the bottom inset was once counted twice)", () => {
    expect(audit).toContain("Emulation.setSafeAreaInsetsOverride");
    expect(audit).toMatch(/for \(const insets of \[false, true\]\)/);
    expect(audit).toContain('"-insets"');
  });

  it("collects the browser's own console errors, not just the page's", () => {
    // e.g. Chrome's "Pattern attribute value ... is not a valid regular expression" is raised by the
    // browser and never passes through console.error.
    expect(audit).toContain('"Log"');
    expect(audit).toContain('"Log.entryAdded"');
  });

  it("sizes the roster sweep from the live roster, not a hard-coded count", () => {
    expect(audit).toContain("const extra = Math.min(total - 1, names.length)");
    expect(audit).not.toMatch(/Characters claimed: 6/);
  });

  it("selects a long-labelled edit target so the select-echo check is not vacuous", () => {
    expect(audit).toContain('await setSelect(gm, "#edit-target", /^threat:/)');
    expect(audit).toContain('"console-edit-target"');
  });
});

describe("two-device smoke scene advance", () => {
  it("does not require the scene reason field, which a completed primary Objective removes", () => {
    const advance = smoke.slice(smoke.indexOf("advances the scene with a reason"));
    const use = advance.indexOf('setInput(gm, "#scene-reason"');
    expect(use).toBeGreaterThan(-1);
    expect(advance.slice(0, use)).toMatch(/querySelector\("#scene-reason"\)/);
  });
});

/** `auditCommitBar` only: from its declaration to the next top-level function. */
function commitBarFunction(): string {
  const start = audit.indexOf("async function auditCommitBar");
  const end = audit.indexOf("\nasync function ", start + 1);
  return audit.slice(start, end);
}

describe("ui-audit.mjs commit-bar coverage", () => {
  it("audits the compose and allocation bars at every viewport, and again under a real 200% browser text size", () => {
    expect(audit).toContain('await auditCommitBar(player, "compose")');
    expect(audit).toContain('await auditCommitBar(player, "allocation")');
    const fn = commitBarFunction();
    expect(fn).toContain("for (const vp of VIEWPORTS)");
    // A CSS font-size override on <html> cannot move the stylesheet's `rem` media gate; Chrome's own default
    // font size does, so the large-text case launches the browser with it.
    expect(audit).toContain("--blink-settings=defaultFontSize=");
    expect(audit).toContain('arg("text-scale"');
    expect(fn).toContain("32 * r.rootFontPx");
  });

  it("judges reachability, the short-viewport fallback, the size cap and keyboard focus clearance", () => {
    const fn = commitBarFunction();
    // The gate mirrors the stylesheet's `@media (min-height: 32rem)`.
    expect(fn).toContain('r.position !== "static"');
    expect(fn).toContain('r.position !== "sticky"');
    expect(fn).toContain("r.cardTop.bar.height > r.innerHeight * 0.5");
    expect(fn).toContain("is covered by the bar when it takes keyboard focus");
    // Focus is probed from a PARTLY visible position: a far-off control is centred by the browser, which
    // would pass whatever scroll-margin the stylesheet declares.
    expect(audit).toContain("(innerHeight - 8)");
    expect(audit).toContain('card.querySelectorAll("summary")');
    // The 320px + 200% text overflow predates the bar (identical on the earlier build): recorded, not gating.
    expect(fn).toContain("vp.width <= 320 && TEXT_SCALE >= 2");
    expect(fn).toContain("is covered with the card");
  });
});
