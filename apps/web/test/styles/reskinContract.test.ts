import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A static contract over the reskin's stylesheet and document head. jsdom does no layout, so the
 * live geometry is proved in a real browser by `scripts/playtest/ui-audit.mjs`; this suite pins the
 * *rules* that make that geometry hold (so a later edit that quietly drops `dvh`, safe-area
 * padding, the 16px control font, or reduced-motion gating fails in ordinary `npm run check`),
 * and checks the palette's contrast numerically, which jest-axe cannot do in jsdom.
 */

const here = dirname(fileURLToPath(import.meta.url));
// Comments stripped so selectors are never polluted by the prose between rules.
const css = readFileSync(join(here, "../../src/styles.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const html = readFileSync(join(here, "../../index.html"), "utf8");
const uiAudit = readFileSync(join(here, "../../../../scripts/playtest/ui-audit.mjs"), "utf8");

/** All `selector { body }` rules at the top level or inside the named at-rule (or anywhere when omitted). */
function rulesFor(selectorPattern: RegExp): string[] {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let match = re.exec(css); match; match = re.exec(css)) {
    const selector = match[1]!.trim();
    if (selectorPattern.test(selector)) out.push(match[2]!);
  }
  return out;
}

function declaration(ruleBodies: string[], property: string): string[] {
  return ruleBodies.flatMap((body) =>
    [...body.matchAll(new RegExp(`(?:^|;|\\s)${property}\\s*:\\s*([^;]+)`, "g"))].map((m) =>
      m[1]!.trim(),
    ),
  );
}

/** The text of the first `@media (…query…) { … }` block, found by brace matching. */
function mediaBlock(query: string): string {
  const start = css.indexOf(`@media ${query}`);
  if (start < 0) throw new Error(`no @media ${query}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error("unbalanced braces");
}

function token(name: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!match) throw new Error(`token --${name} not a hex colour in :root`);
  return match[1]!;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(token(a)), luminance(token(b))].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Character ranges of every balanced `<div className="...stepper-controls...">...</div>` block in
 * `source` — the one place a class-less `<button>` is legitimate, because `.stepper-controls button`
 * names it. Depth-counts nested `<div>`s so the range covers the whole block, not just its first
 * child (the AllocationStepper's inner `role="spinbutton"` div would otherwise truncate it early).
 */
function stepperControlsRanges(source: string): [number, number][] {
  const ranges: [number, number][] = [];
  const openRe = /<div\b[^>]*className="[^"]*\bstepper-controls\b[^"]*"[^>]*>/g;
  for (let open = openRe.exec(source); open; open = openRe.exec(source)) {
    const start = open.index;
    const tagRe = /<div\b[^>]*>|<\/div>/g;
    tagRe.lastIndex = openRe.lastIndex;
    let depth = 1;
    let end = source.length;
    for (let tag = tagRe.exec(source); tag; tag = tagRe.exec(source)) {
      depth += tag[0].startsWith("</") ? -1 : 1;
      if (depth === 0) {
        end = tagRe.lastIndex;
        break;
      }
    }
    ranges.push([start, end]);
    openRe.lastIndex = end;
  }
  return ranges;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

describe("reskin stylesheet contract", () => {
  it("keeps the real-browser correction-sheet audit roster-agnostic", () => {
    // The audit must exercise the sheet for the current content roster, not a retired fixture
    // character. Otherwise a roster update can silently skip every mobile sheet scenario.
    expect(uiAudit).toContain('querySelectorAll(".roster-panel-list button")');
    expect(uiAudit).toContain("/^correct$/i.test(button.textContent.trim())");
    expect(uiAudit).not.toMatch(/\^rook/i);
  });

  describe("touch targets and text-entry size", () => {
    it("defines the tap size as 3rem (48px at the default root, and it scales with user font size)", () => {
      expect(css).toMatch(/--tap:\s*3rem/);
    });

    it("gives every button style and text-entry control at least the tap size", () => {
      const buttons = rulesFor(/\.primary-action.*\.stepper-controls button/s);
      const inputs = rulesFor(
        /^input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),\s*select,\s*textarea$/s,
      );
      expect(declaration(buttons, "min-height")).toContain("var(--tap)");
      expect(declaration(buttons, "min-width")).toContain("var(--tap)");
      expect(declaration(inputs, "min-height")).toContain("var(--tap)");
    });

    it("covers every styled <button> in the app: each className token is one the tap rule names", () => {
      const covered = new Set(["primary-action", "secondary-action", "link-button"]);
      const uncovered: string[] = [];
      for (const file of sourceFiles(join(here, "../../src"))) {
        const source = readFileSync(file, "utf8");
        for (const match of source.matchAll(
          /<button\b[^>]*?className=(?:"([^"]*)"|\{`([^`]*)`\})/gs,
        )) {
          for (const token of (match[1] ?? match[2] ?? "").split(/\s+/).filter(Boolean)) {
            if (!covered.has(token)) uncovered.push(`${file.split("/src/")[1]}: ${token}`);
          }
        }
      }
      expect(uncovered).toEqual([]);
      // Class-less buttons are only the +/- steppers inside .stepper-controls (rule names them).
      const buttonRule = rulesFor(/\.primary-action.*\.stepper-controls button/s);
      expect(declaration(buttonRule, "min-height")).toContain("var(--tap)");
    });

    it("never adds a <button> with no className at all outside .stepper-controls (it would get no tap-size rule)", () => {
      const uncovered: string[] = [];
      for (const file of sourceFiles(join(here, "../../src"))) {
        const source = readFileSync(file, "utf8");
        const stepperRanges = stepperControlsRanges(source);
        for (const match of source.matchAll(/<button\b[^>]*?>/gs)) {
          if (/className=/.test(match[0])) continue;
          const insideStepper = stepperRanges.some(
            ([start, end]) => match.index >= start && match.index < end,
          );
          if (!insideStepper) {
            const line = source.slice(0, match.index).split("\n").length;
            uncovered.push(`${file.split("/src/")[1]}:${line}`);
          }
        }
      }
      expect(uncovered).toEqual([]);
    });

    it("keeps the read-only stepper value (role=spinbutton, focusable) at the tap size too", () => {
      expect(declaration(rulesFor(/^\.stepper-value$/), "min-height")).toContain("var(--tap)");
    });

    it("keeps text-entry controls at 1rem so iOS Safari does not zoom the page on focus", () => {
      const inputs = rulesFor(
        /^input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),\s*select,\s*textarea$/s,
      );
      expect(declaration(inputs, "font-size")).toEqual(["1rem"]);
      expect(declaration(inputs, "max-width")).toContain("100%");
    });

    it("makes check/radio rows and disclosure summaries tappable at the tap size", () => {
      expect(
        declaration(rulesFor(/^\.gear-option,\s*\.form-field--checkbox$/), "min-height"),
      ).toContain("var(--tap)");
      expect(declaration(rulesFor(/^summary$/), "min-height")).toContain("var(--tap)");
    });

    it("draws a >= 3px focus ring on every focusable element", () => {
      const focus = rulesFor(/^:focus-visible$/);
      expect(declaration(focus, "outline")[0]).toMatch(/^3px solid var\(--acid\)$/);
    });

    it("never disables page zoom: no viewport lock, and no touch-action: none anywhere", () => {
      expect(html).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
      expect(html).not.toMatch(/maximum-scale/i);
      // An ancestor's touch-action cannot be re-enabled by a descendant, so a full-screen backdrop with
      // `none` would disable pinch-zoom for the whole page while a sheet is open.
      expect(css).not.toMatch(/touch-action:\s*none/);
      // `pinch-zoom` alone would also forbid one-finger panning of a zoomed page (the sheet's
      // title/actions could be stranded off the visual viewport), so nothing is restricted.
      expect(css).not.toMatch(/touch-action:\s*pinch-zoom/);
      expect(declaration(rulesFor(/^\.sheet-backdrop$/), "touch-action")).toEqual(["auto"]);
      expect(html).toContain("viewport-fit=cover"); // required for env(safe-area-inset-*)
      expect(html).toContain("interactive-widget=resizes-content");
    });
  });

  describe("pop-out sheet", () => {
    it("sizes the backdrop from the visual viewport, with a vh base and dvh only behind @supports", () => {
      const backdrop = rulesFor(/^\.sheet-backdrop$/);
      const heights = declaration(backdrop, "height");
      // A var() whose value is invalid at computed-value time becomes `auto`, not the previous
      // declaration, so the dvh form must be behind @supports and a vh base must exist.
      // (The @supports rule below is matched too, so both forms appear, base first.)
      expect(heights).toEqual(["var(--vv-height, 100vh)", "var(--vv-height, 100dvh)"]);
      expect(css).toMatch(
        /@supports \(height: 100dvh\)\s*\{\s*\.sheet-backdrop\s*\{\s*height:\s*var\(--vv-height, 100dvh\)/,
      );
      expect(declaration(backdrop, "top")).toContain("var(--vv-top, 0px)");
      expect(declaration(backdrop, "left")).toContain("var(--vv-left, 0px)");
      expect(declaration(backdrop, "width")).toContain("var(--vv-width, 100vw)");
      expect(declaration(backdrop, "position")).toEqual(["fixed"]);
    });

    it("clears device notches on the sides and top, and the home indicator at the bottom", () => {
      expect(declaration(rulesFor(/^\.sheet-backdrop$/), "padding")[0]).toContain(
        "env(safe-area-inset-top)",
      );
      expect(declaration(rulesFor(/^\.sheet-backdrop$/), "padding")[0]).toContain(
        "env(safe-area-inset-left)",
      );
      expect(declaration(rulesFor(/^\.sheet-footer$/), "padding")[0]).toContain(
        "env(safe-area-inset-bottom)",
      );
    });

    it("keeps the notch insets on WIDE viewports too (landscape phones are wider than 641px)", () => {
      const wide = mediaBlock("(min-width: 40.0625rem)");
      const padding = /\.sheet-backdrop\s*\{[^}]*padding:\s*([^;]+);/.exec(wide)?.[1] ?? "";
      for (const side of ["top", "right", "bottom", "left"]) {
        expect(padding).toContain(`max(1.5rem, env(safe-area-inset-${side}))`);
      }
      // A plain shorthand here is the regression: it silently drops every inset.
      expect(wide).not.toMatch(/\.sheet-backdrop\s*\{[^}]*padding:\s*1\.5rem\s*;/);
    });

    it("lets the action row scroll on its own and stack to one column, so large text cannot squeeze the body away", () => {
      const footer = rulesFor(/^\.sheet-footer$/);
      // vh base, dvh override behind @supports (an invalid var() would otherwise drop the cap).
      expect(declaration(footer, "max-height")).toEqual([
        "calc(var(--vv-height, 100vh) * 0.4)",
        "calc(var(--vv-height, 100dvh) * 0.4)",
      ]);
      expect(declaration(footer, "overflow-y")).toContain("auto");
      // Large text: long legends and stepper rows wrap instead of widening the page.
      expect(declaration(rulesFor(/^legend$/), "overflow-wrap")).toContain("anywhere");
      expect(declaration(rulesFor(/^legend$/), "max-width")).toContain("100%");
      expect(declaration(rulesFor(/^\.stepper-controls$/), "flex-wrap")).toContain("wrap");
      expect(declaration(rulesFor(/^\.sheet-actions$/), "grid-template-columns")[0]).toMatch(
        /^repeat\(auto-fit, minmax\(min\(100%, 9rem\), 1fr\)\)$/,
      );
    });

    it("keeps a dark band between a focused button and its focus ring, over the drop shadow", () => {
      const focused = rulesFor(/^\.primary-action:focus-visible:not\(:disabled\)/s);
      expect(declaration(focused, "box-shadow")).toContain("0 0 0 3px var(--ink-0)");
    });

    it("never exceeds what is visible and scrolls only its body", () => {
      expect(declaration(rulesFor(/^\.sheet$/), "max-height")).toContain("100%");
      expect(declaration(rulesFor(/^\.sheet$/), "overflow")).toContain("hidden");
      expect(declaration(rulesFor(/^\.sheet$/), "width")).toContain("100%");
      const body = rulesFor(/^\.sheet-body$/);
      expect(declaration(body, "overflow-y")).toContain("auto");
      expect(declaration(body, "min-height")).toContain("0");
      expect(declaration(body, "overscroll-behavior")).toContain("contain");
      expect(declaration(rulesFor(/^\.sheet-header$/), "flex")).toContain("none");
      expect(declaration(rulesFor(/^\.sheet-footer$/), "flex")).toContain("none");
    });

    it("is an edge-attached bottom sheet by default and a centred card from 641px up", () => {
      expect(declaration(rulesFor(/^\.sheet-backdrop$/), "align-items")).toContain("flex-end");
      const wide = mediaBlock("(min-width: 40.0625rem)");
      expect(wide).toMatch(/\.sheet-backdrop\s*\{[^}]*align-items:\s*center/);
    });

    it("reclaims vertical room on short viewports (landscape phone / keyboard open)", () => {
      expect(mediaBlock("(max-height: 34rem)")).toMatch(/\.sheet-grip\s*\{[^}]*display:\s*none/);
    });

    it("locks root scroll only while a sheet is open, without the page jumping", () => {
      expect(rulesFor(/^html\.sheet-open$/).join()).toMatch(/overflow:\s*hidden/);
      expect(declaration(rulesFor(/^html$/), "scrollbar-gutter")).toContain("stable");
    });
  });

  describe("reduced motion", () => {
    it("declares every keyframe animation only inside prefers-reduced-motion: no-preference", () => {
      const allowed = mediaBlock("(prefers-reduced-motion: no-preference)");
      expect(allowed).toMatch(/animation:\s*sheet-rise/);
      const outside = css.replace(allowed, "");
      const reduceBlock = mediaBlock("(prefers-reduced-motion: reduce)");
      const outsideReduce = outside.replace(reduceBlock, "");
      // Everything left over may only mention `animation` in keyframe names/comments/the `none` default.
      const animationDeclarations = [
        ...outsideReduce.matchAll(/(?:^|[;{\s])animation\s*:\s*([^;}]+)/g),
      ].map((m) => m[1]!.trim());
      expect(animationDeclarations).toEqual([]);
    });

    it("declares every non-zero transition only inside the no-preference block", () => {
      const allowed = mediaBlock("(prefers-reduced-motion: no-preference)");
      const outside = css.replace(allowed, "");
      const transitions = [...outside.matchAll(/(?:^|[;{\s])transition\s*:\s*([^;}]+)/g)].map((m) =>
        m[1]!.trim(),
      );
      expect(transitions.every((value) => value === "none")).toBe(true);
    });

    it("collapses any remaining motion when reduce is requested", () => {
      const reduce = mediaBlock("(prefers-reduced-motion: reduce)");
      expect(reduce).toContain("animation-duration: 0.001ms !important");
      expect(reduce).toContain("transition-duration: 0.001ms !important");
      expect(reduce).toContain("scroll-behavior: auto !important");
    });
  });

  describe("palette contrast (WCAG 2.2, computed from the actual tokens)", () => {
    const text: [string, string, number][] = [
      ["paper", "ink-0", 7],
      ["paper", "ink-2", 7],
      ["paper", "ink-3", 7],
      ["dim", "ink-2", 7],
      ["dim", "ink-3", 7],
      ["mute", "ink-2", 4.5],
      ["mute", "ink-3", 4.5],
      ["acid", "ink-0", 7],
      ["acid", "ink-2", 7],
      ["cyan", "ink-0", 7],
      ["cyan", "ink-2", 7],
      ["riot", "ink-0", 4.5],
      ["riot", "ink-2", 4.5],
      ["pink", "ink-2", 4.5],
      ["volt", "ink-2", 7],
      // Dark text on a bright fill (buttons, chips, legends).
      ["ink-0", "acid", 7],
      ["ink-0", "cyan", 7],
      ["ink-0", "volt", 7],
      ["ink-0", "pink", 4.5],
      ["paper", "riot-deep", 4.5],
    ];
    it.each(text)("%s on %s is at least %s:1", (fg, bg, minimum) => {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(minimum);
    });

    it("keeps interactive control boundaries at >= 3:1 (WCAG 1.4.11)", () => {
      for (const surface of ["ink-0", "ink-1", "ink-2", "ink-3"]) {
        expect(contrast("mute", surface)).toBeGreaterThanOrEqual(3);
        expect(contrast("paper", surface)).toBeGreaterThanOrEqual(3);
      }
      expect(contrast("acid", "ink-0")).toBeGreaterThanOrEqual(3); // focus ring on ink
      expect(contrast("acid", "ink-3")).toBeGreaterThanOrEqual(3);
    });
  });

  describe("licensing hygiene", () => {
    it("uses only system font stacks and no external resources", () => {
      expect(css).not.toMatch(/@import|@font-face|url\(\s*["']?https?:/i);
      // The only url(...) values are inline data: URIs (procedural SVG textures / chevron).
      const urls = [...css.matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]!);
      // (`url(%23n)` is the SVG filter reference *inside* the feTurbulence data URI, not a fetch.)
      const fetched = urls.filter((u) => !u.startsWith("%23"));
      expect(fetched.length).toBeGreaterThan(0);
      expect(fetched.every((u) => u.startsWith("data:image/svg+xml"))).toBe(true);
    });
  });
});
