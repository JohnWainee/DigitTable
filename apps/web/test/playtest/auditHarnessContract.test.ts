import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
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

  it("audits the sticky action dock on every long decision form, and fails if none is found", () => {
    expect(audit).toContain("DOCK_AUDIT");
    // Pinned on screen, within its height cap, explaining its button, and never covering a focused control.
    for (const rule of [
      "dock not fully on screen",
      "is covered by the dock when focused",
      "is outside the viewport when focused",
      "primary button has no visible described-by status",
      "no .action-dock was found to audit",
    ]) {
      expect(audit, rule).toContain(rule);
    }
    for (const call of [
      'await auditActionDock(player, "compose")',
      'await auditActionDock(player, "allocation")',
      'await auditActionDock(player, "allocation-assigned")',
      'await auditActionDock(gm, "console-pending")',
    ]) {
      expect(audit, call).toContain(call);
    }
    // The 540-720px band where two long buttons wrap is exercised too.
    expect(audit).toContain('name: "tablet-narrow", width: 600');
    expect(audit).toContain("for (const vp of DOCK_VIEWPORTS)");
    // A viewport-only capture, because a full-page capture cannot show a pinned element.
    expect(audit).toContain("dock-${device.name}-${state}-${vp.name}.jpg");
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

describe("ui-audit viewport matrix", () => {
  it.each(["phone-small", "phone-390", "phone-412", "tablet", "desktop", "table"])(
    "sweeps the %s viewport",
    (name) => {
      expect(audit).toContain(`name: "${name}"`);
    },
  );

  it("opens the correction sheet at the 390 and 412 px phones too", () => {
    expect(audit).toMatch(/name: "phone-390", \.\.\.byName\["phone-390"\]/);
    expect(audit).toMatch(/name: "phone-412", \.\.\.byName\["phone-412"\]/);
  });
});

describe("ui-audit whole-page text scaling, font fallback and rendered-pixel contrast", () => {
  it("audits every signed-in and signed-out page at 150% and 200% text on the small phones and in landscape", () => {
    // Only the correction sheet used to be audited at these sizes.
    expect(audit).toContain("await captureTextScaled(device, state)");
    expect(audit).toMatch(/\{ name: "150", px: 24 \}/);
    expect(audit).toMatch(/\{ name: "200", px: 32 \}/);
    for (const name of ["phone-small", "phone", "phone-412", "phone-landscape"]) {
      expect(audit, name).toContain(`"${name}"`);
    }
    // Overflow and squeezed or off-screen controls gate, exactly like the 100% sweep.
    expect(audit).toContain("horizontal overflow ${audit.overflowPx}px");
    expect(audit).toContain("report.textScale.push(");
  });

  it("can render the pages as a device without the Impact display face (Android, ChromeOS, most Linux)", () => {
    expect(audit).toContain('arg("font-fallback", "")');
    expect(audit).toContain("Page.addScriptToEvaluateOnNewDocument");
    expect(audit).toContain('"--font-display"');
    expect(audit).toMatch(
      /wide: \{ display: "Verdana, sans-serif", body: "Verdana, sans-serif" \}/,
    );
  });

  it("scores text contrast from the rendered pixels, because axe reports text over textures as incomplete", () => {
    expect(audit).toContain("await auditPixelContrast(device, state)");
    expect(audit).toContain("GLYPHS_TRANSPARENT_CSS");
    expect(audit).toContain("GLYPHS_MAGENTA_CSS");
    expect(audit).toContain("text contrast ${r.p5}:1 (needs ${r.required}:1)");
    const module = readFileSync(
      join(here, "../../../../scripts/playtest/pixelContrast.mjs"),
      "utf8",
    );
    // 4.5:1 for body text, 3:1 only for WCAG large text.
    expect(module).toContain("isLargeText(box.size, box.weight) ? 3 : 4.5");
    expect(module).toContain("sizePx >= 24 || (weight >= 700 && sizePx >= 18.66)");
    // A box with too few glyph pixels is "insufficient", never a pass.
    expect(module).toContain('status: "insufficient"');
  });

  it("detects broken words and fingerprints the default-size layout so a CSS change can be proven neutral", () => {
    expect(audit).toContain("WORD_BREAK_AUDIT");
    expect(audit).toContain("word broken across lines");
    // Identifiers and codes are not words; everything else must stay whole.
    expect(audit).toContain("if (m[0].length > 16) continue;");
    expect(audit).toContain("LAYOUT_DUMP_EXPRESSION");
    expect(audit).toContain('arg("layout-dump", "")');
  });

  it("proves the contrast measurement can fail (a negative control), not only pass", () => {
    const selftest = readFileSync(
      join(here, "../../../../scripts/playtest/ui-audit-selftest.mjs"),
      "utf8",
    );
    expect(selftest).toContain("white text over a black-to-white ramp fails");
    expect(selftest).toContain("PNG decoder reproduces every row filter");
  });
});

describe("layout-diff.mjs (proves a CSS change leaves the default-size layout identical)", () => {
  const tool = join(here, "../../../../scripts/playtest/layout-diff.mjs");
  const dir = mkdtempSync(join(tmpdir(), "layout-diff-"));
  function run(
    before: unknown,
    after: unknown,
    extra: string[] = [],
  ): { code: number; out: string } {
    writeFileSync(join(dir, "a.json"), JSON.stringify(before));
    writeFileSync(join(dir, "b.json"), JSON.stringify(after));
    try {
      const out = execFileSync(
        "node",
        [
          tool,
          join(dir, "a.json"),
          join(dir, "b.json"),
          ...(extra.includes("--min-elements") ? [] : ["--min-elements", "1", "--min-total", "1"]),
          ...extra,
        ],
        { encoding: "utf8" },
      );
      return { code: 0, out };
    } catch (error) {
      const e = error as { status: number; stdout: string };
      return { code: e.status, out: e.stdout };
    }
  }
  const page = [
    "main:1|0|0|320|600|",
    "main:1>h1:1|16|16|288|50|abc",
    "main:1>button:2|16|100|288|48|xyz",
  ];

  it("passes identical layouts, and ignores sub-pixel rounding", () => {
    const nudged = page.map((line) => line.replace("|288|50|", "|289|50|"));
    expect(run({ "gm/x@phone": page }, { "gm/x@phone": page }).code).toBe(0);
    expect(run({ "gm/x@phone": page }, { "gm/x@phone": nudged }).code).toBe(0);
  });

  it("fails when an element moved or resized, and names it", () => {
    const moved = page.map((line) => line.replace("|16|100|288|48|", "|16|100|288|96|"));
    const result = run({ "gm/x@phone": page }, { "gm/x@phone": moved });
    expect(result.code).toBe(1);
    expect(result.out).toContain("button:2: 16,100 288x48 -> 16,100 288x96");
  });

  it("does not blame the CSS for an element whose own text differs between runs (a random room code)", () => {
    // 200 elements, so one excused box is well under the 1% cap.
    const big = Array.from({ length: 200 }, (_, i) => `main:1>p:${i + 1}|0|${i * 20}|288|18|t${i}`);
    const other = big.map((line, i) =>
      i === 7 ? line.replace("|288|18|t7", "|300|18|zzz") : line,
    );
    const result = run({ "gm/x@phone": big }, { "gm/x@phone": other });
    expect(result.code).toBe(0);
    expect(result.out).toContain("1 element boxes differ only where their own text differs");
    // The same box change with the same text is a real layout change.
    const same = big.map((line, i) => (i === 7 ? line.replace("|288|18|t7", "|300|18|t7") : line));
    expect(run({ "gm/x@phone": big }, { "gm/x@phone": same }).code).toBe(1);
  });

  it("fails a vacuous run, a partial dump and an unexplained DOM change, and names allowed ones", () => {
    const extra = [...page, "main:1>p:3|16|160|288|20|"];
    // Nothing comparable at all is a failure, not a pass.
    const vacuous = run({ "gm/x@phone": page }, { "gm/x@phone": extra });
    expect(vacuous.out).toContain("not comparable (different DOM)");
    expect(vacuous.code).toBe(1);
    // One comparable pair does not excuse an unexplained different DOM next to it...
    const mixed = run(
      { "gm/x@phone": page, "anon/join-form@phone": page },
      { "gm/x@phone": page, "anon/join-form@phone": extra },
    );
    expect(mixed.code).toBe(1);
    expect(mixed.out).toContain("were not named by --allow-skip");
    // ...but a DOM change named on purpose is allowed.
    writeFileSync(
      join(dir, "m1.json"),
      JSON.stringify({ "gm/x@phone": page, "anon/join-form@phone": page }),
    );
    writeFileSync(
      join(dir, "m2.json"),
      JSON.stringify({ "gm/x@phone": page, "anon/join-form@phone": extra }),
    );
    const allowed = execFileSync(
      "node",
      [
        tool,
        join(dir, "m1.json"),
        join(dir, "m2.json"),
        "--min-elements",
        "1",
        "--min-total",
        "1",
        "--allow-skip",
        "join-form",
      ],
      { encoding: "utf8" },
    );
    expect(allowed).toContain("different DOM, allowed");
    expect(allowed).toContain("LAYOUT IDENTICAL");
    // A dump that lacks a key the other has (a crash, or --only-states) cannot read as identical.
    const partial = run({ "gm/x@phone": page, "gm/x@tablet": page }, { "gm/x@phone": page });
    expect(partial.code).toBe(1);
    expect(partial.out).toContain("MISSING from the second dump: gm/x@tablet");
  });

  it("fails blank dumps, bad parameters, substring skips and a runaway own-text exemption", () => {
    // Two blank or near-empty dumps are not "identical", they are a broken build both times.
    const blank = (extra: string[] = []) => {
      writeFileSync(join(dir, "e1.json"), JSON.stringify({ a: [], b: [] }));
      try {
        return execFileSync("node", [tool, join(dir, "e1.json"), join(dir, "e1.json"), ...extra], {
          encoding: "utf8",
        });
      } catch (error) {
        return `exit ${(error as { status: number }).status}`;
      }
    };
    expect(blank()).toBe("exit 1");
    // A real-sized pair passes the per-pair floor but still needs enough elements in total.
    const smallButReal = Array.from(
      { length: 12 },
      (_, i) => `main:1>p:${i + 1}|0|${i * 20}|288|18|`,
    );
    expect(
      run({ "gm/x@phone": smallButReal }, { "gm/x@phone": smallButReal }, ["--min-elements", "10"])
        .code,
    ).toBe(1);
    // A tolerance that is not a number would make every comparison false, so it is refused.
    expect(run({ "gm/x@phone": page }, { "gm/x@phone": page }, ["--tolerance", "abc"]).code).toBe(
      2,
    );
    expect(run({ "gm/x@phone": page }, { "gm/x@phone": page }, ["--min-elements", "x"]).code).toBe(
      2,
    );
    // --allow-skip names a whole state: an empty name or a mere substring excuses nothing.
    const extra = [...page, "main:1>p:3|16|160|288|20|"];
    const two = { "gm/x@phone": page, "anon/join-form@phone": page };
    const twoDom = { "gm/x@phone": page, "anon/join-form@phone": extra };
    expect(run(two, twoDom, ["--allow-skip", ""]).code).toBe(2);
    expect(run(two, twoDom, ["--allow-skip", "join"]).code).toBe(1);
    expect(run(two, twoDom, ["--allow-skip", "join-form"]).code).toBe(0);
    // Everything widened with different text is not an "own text differs" excuse: capped at 1%.
    const many = Array.from({ length: 10 }, (_, i) => `main:1>p:${i + 1}|0|${i * 10}|100|10|t${i}`);
    const wider = many.map((line) => line.replace("|100|10|t", "|300|10|u"));
    const runaway = run({ "gm/x@phone": many }, { "gm/x@phone": wider });
    expect(runaway.code).toBe(1);
    expect(runaway.out).toContain("more than 1%");
  });

  it("sees an element that a stylesheet hides or shows (the dump keeps display:none boxes)", () => {
    const shown = page.map((line) => line.replace("|16|100|288|48|xyz", "|16|100|288|48|xyz"));
    const hidden = page.map((line) => line.replace("|16|100|288|48|xyz", "|0|0|0|0|xyz"));
    const result = run({ "gm/x@phone": shown }, { "gm/x@phone": hidden });
    expect(result.code).toBe(1);
    expect(result.out).toContain("button:2: 16,100 288x48 -> 0,0 0x0");
  });
});
