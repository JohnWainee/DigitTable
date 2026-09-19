import { readFileSync } from "node:fs";
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

describe("reskin stylesheet contract", () => {
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

    it("never disables page zoom", () => {
      expect(html).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
      expect(html).not.toMatch(/maximum-scale/i);
      expect(html).toContain("viewport-fit=cover"); // required for env(safe-area-inset-*)
      expect(html).toContain("interactive-widget=resizes-content");
    });
  });

  describe("pop-out sheet", () => {
    it("sizes the backdrop from the visual viewport, falling back to dynamic viewport units", () => {
      const backdrop = rulesFor(/^\.sheet-backdrop$/);
      const heights = declaration(backdrop, "height");
      expect(heights).toContain("var(--vv-height, 100dvh)");
      expect(declaration(backdrop, "top")).toContain("var(--vv-top, 0px)");
      expect(declaration(backdrop, "left")).toContain("var(--vv-left, 0px)");
      expect(declaration(backdrop, "width")).toContain("var(--vv-width, 100%)");
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

    it("locks root scroll only while a sheet is open", () => {
      expect(rulesFor(/^html\.sheet-open$/).join()).toMatch(/overflow:\s*hidden/);
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
