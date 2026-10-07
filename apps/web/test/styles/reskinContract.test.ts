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

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".tsx") ? [path] : [];
  });
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
    });

    it("keeps two action columns only while each label's longest word fits its half, otherwise stacks them", () => {
      const row = rulesFor(/^\.sheet-actions$/);
      expect(declaration(row, "display")).toEqual(["flex"]);
      expect(declaration(row, "flex-flow")).toEqual(["row wrap"]);
      const item = rulesFor(/^\.sheet-actions > \*$/);
      // The automatic content minimum, set explicitly (the buttons' own 44px min-width would replace it),
      // and clamped by max-width: a word wider than the whole row breaks instead of overflowing and being
      // clipped by the sheet (an explicit `min-content` would have overridden the clamp).
      expect(declaration(item, "min-width")).toEqual(["auto"]);
      expect(declaration(item, "max-width")).toEqual(["100%"]);
      // Equal halves: basis = 50% less half the gap, so two of them and the gap are exactly one row.
      const gap = parseFloat(declaration(row, "gap")[0]!);
      const basis = /^1 1 calc\(50% - ([\d.]+)rem\)$/.exec(declaration(item, "flex")[0] ?? "");
      expect(basis).not.toBeNull();
      expect(parseFloat(basis![1]!)).toBeCloseTo(gap / 2, 5);
      // Not a fixed-minimum grid any more: that cannot know how wide a label word is.
      expect(declaration(row, "grid-template-columns")).toEqual([]);
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

  describe("fq pass: blacker ink, surface identity, hardened pop-out", () => {
    it("keeps the ink tokens near-black (relative luminance under 0.012 for ink-0..ink-2)", () => {
      for (const name of ["ink-0", "ink-1", "ink-2"]) {
        expect(luminance(token(name))).toBeLessThan(0.012);
      }
      // ...and the page itself is painted from them.
      expect(declaration(rulesFor(/^body$/), "background-color")).toContain("var(--ink-0)");
    });

    it("defines the three surface-identity tokens and overrides them per role surface", () => {
      expect(css).toMatch(/--sa:\s*var\(--acid\)/);
      expect(css).toMatch(/--sb:\s*var\(--riot-deep\)/);
      expect(css).toMatch(/--sc:\s*var\(--cyan\)/);
      expect(declaration(rulesFor(/^\.gm-screen$/), "--sa")).toEqual(["var(--pink)"]);
      expect(declaration(rulesFor(/^\.table-screen$/), "--sa")).toEqual(["var(--volt)"]);
    });

    it("keeps dark text legible on every surface slab colour (h2, primary button, legend)", () => {
      // The slab fill is --sa (acid / pink / volt) and the stamp fill is --sc (cyan / acid / pink):
      // all carry --ink-0 text, so every possible fill must clear WCAG AA with margin.
      for (const fill of ["acid", "pink", "volt", "cyan"]) {
        expect(contrast("ink-0", fill)).toBeGreaterThanOrEqual(4.5);
      }
      expect(declaration(rulesFor(/^h2$/), "color")).toContain("var(--ink-0)");
      expect(declaration(rulesFor(/^h2$/), "background")).toContain("var(--sa)");
      expect(declaration(rulesFor(/^\.primary-action$/), "background")).toContain("var(--sa)");
      expect(declaration(rulesFor(/^\.primary-action$/), "color")).toContain("var(--ink-0)");
      expect(declaration(rulesFor(/^legend$/), "background")).toContain("var(--sc)");
      expect(declaration(rulesFor(/^legend$/), "color")).toContain("var(--ink-0)");
      // Accent text used directly on ink (stamps, summaries, secondary buttons) on every surface.
      for (const accent of ["acid", "pink", "cyan"]) {
        expect(contrast(accent, "ink-0")).toBeGreaterThanOrEqual(4.5);
        expect(contrast(accent, "ink-2")).toBeGreaterThanOrEqual(4.5);
      }
    });

    it("keeps primary vs secondary distinguishable without hue: a fill versus an outline", () => {
      expect(declaration(rulesFor(/^\.primary-action$/), "background")).toContain("var(--sa)");
      expect(declaration(rulesFor(/^\.secondary-action$/), "background")).toContain("var(--ink-0)");
      expect(declaration(rulesFor(/^\.secondary-action$/), "border-color")).toContain("var(--sc)");
    });

    it("draws the toner scuff and photocopy streaks procedurally and only as background layers", () => {
      expect(css).toMatch(/--dust:\s*url\("data:image\/svg\+xml/);
      expect(css).toMatch(/--streak:\s*url\("data:image\/svg\+xml/);
      // Textures never sit above text: no ::before/::after overlay paints them.
      expect(css).not.toMatch(/(?:::before|::after)[^{]*\{[^}]*var\(--(?:dust|streak)\)/);
      expect(declaration(rulesFor(/^\.step,\s*\.scene-card/s), "background").join()).toContain(
        "var(--dust)",
      );
    });

    it("turns the sheet backdrop into a size container and un-pins the sheet when almost nothing is visible", () => {
      expect(declaration(rulesFor(/^\.sheet-backdrop$/), "container")).toContain("sheet / size");
      const block =
        /@container sheet \(max-height: 10rem\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
      expect(block).toMatch(/\.sheet-backdrop \.sheet\s*\{[^}]*overflow-y:\s*auto/);
      expect(block).toMatch(/\.sheet-backdrop \.sheet-body\s*\{[^}]*overflow:\s*visible/);
      expect(block).toMatch(/\.sheet-backdrop \.sheet-footer\s*\{[^}]*max-height:\s*none/);
      // The block must come after the base rules it overrides (and after the max-height media block).
      expect(css.indexOf("@container sheet")).toBeGreaterThan(css.indexOf("(max-height: 34rem)"));
    });

    it("paints the disclosure triangle in a system colour under forced colors", () => {
      const forced = mediaBlock("(forced-colors: active)");
      expect(forced).toMatch(/summary::before\s*\{[^}]*background:\s*CanvasText/);
      expect(forced).toMatch(/summary::before\s*\{[^}]*forced-color-adjust:\s*none/);
    });

    it("stacks a utility action under its option row on a phone and sets it beside only where it fits", () => {
      expect(declaration(rulesFor(/^\.gear-row$/), "flex-direction")[0]).toBe("column");
      expect(mediaBlock("(min-width: 40rem)")).toMatch(/\.gear-row\s*\{[^}]*flex-direction:\s*row/);
      expect(declaration(rulesFor(/^\.gear-option > span$/), "min-width")).toContain("0");
    });
  });

  describe("fw pass: large text on small phones (320px at 200% text), option rows and the sheet", () => {
    /**
     * Evaluates a CSS length made of rem / px / vw terms and nested `min()` / `max()` calls (what the
     * gutter, box, chevron, icon and label caps are) for a viewport width and a root font size.
     */
    function evalMin(expression: string, viewportWidth: number, rootPx: number): number {
      const src = expression.trim();
      let at = 0;
      const skip = (): void => {
        while (src[at] === " ") at += 1;
      };
      function term(): number {
        skip();
        const call = /^(min|max)\(/.exec(src.slice(at));
        if (call) {
          at += call[0].length;
          const args = [term()];
          skip();
          while (src[at] === ",") {
            at += 1;
            args.push(term());
            skip();
          }
          if (src[at] !== ")") throw new Error(`unbalanced ${call[1]}() in: ${expression}`);
          at += 1;
          return call[1] === "min" ? Math.min(...args) : Math.max(...args);
        }
        const length = /^([\d.]+)(rem|px|vw)/.exec(src.slice(at));
        if (!length) throw new Error(`cannot evaluate "${src.slice(at)}" in: ${expression}`);
        at += length[0].length;
        const value = Number(length[1]);
        return length[2] === "rem"
          ? value * rootPx
          : length[2] === "vw"
            ? (value * viewportWidth) / 100
            : value;
      }
      const result = term();
      skip();
      if (at !== src.length) throw new Error(`trailing input in: ${expression}`);
      return result;
    }
    const rootToken = (name: string): string =>
      new RegExp(`--${name}:\\s*(min\\([^;]+\\));`).exec(css)?.[1] ?? "";

    it("defines the horizontal gutter unit as min(1rem, 5vw): 1rem from a 320px phone up, but never more than 5vw", () => {
      const gutter = rootToken("g");
      expect(gutter).toBe("min(1rem, 5vw)");
      // Unchanged at the default text size for every width the app supports...
      for (const width of [320, 360, 375, 412, 768, 1280, 1920]) {
        expect(evalMin(gutter, width, 16)).toBe(16);
      }
      // ...and no longer doubles with the text: a 320px phone keeps a 16px gutter at 200% text.
      expect(evalMin(gutter, 320, 32)).toBe(16);
      expect(evalMin(gutter, 375, 32)).toBeCloseTo(18.75);
      // Wide screens still scale it with the text (there is room).
      expect(evalMin(gutter, 1280, 32)).toBe(32);
    });

    it("caps the drawn check/radio box at 32px (1.65rem at the default size), and sizes its mark from the box", () => {
      const box = rootToken("box");
      expect(box).toBe("min(1.65rem, 32px)");
      expect(evalMin(box, 320, 16)).toBeCloseTo(26.4);
      expect(evalMin(box, 320, 32)).toBe(32);
      const boxRule = rulesFor(/^input\[type="checkbox"\],\s*input\[type="radio"\]$/s);
      expect(declaration(boxRule, "width")).toContain("var(--box)");
      expect(declaration(boxRule, "height")).toContain("var(--box)");
      expect(declaration(rulesFor(/^input\[type="checkbox"\]::after$/), "width")[0]).toContain(
        "var(--box)",
      );
      expect(declaration(rulesFor(/^input\[type="radio"\]::after$/), "width")[0]).toContain(
        "var(--box)",
      );
    });

    it("builds every nested horizontal gutter on the unit, so five panels cannot add up to the whole line", () => {
      const sides = (rules: string[]): string => declaration(rules, "padding")[0] ?? "";
      expect(
        sides(rulesFor(/^\.landing-screen,\s*\.player-screen,\s*\.gm-screen,\s*\.table-screen$/s)),
      ).toContain("max(var(--g), env(safe-area-inset-right))");
      expect(sides(rulesFor(/^\.step,\s*\.scene-card/s))).toBe("1.25rem var(--g) 1.25rem");
      expect(sides(rulesFor(/^fieldset$/))).toBe("1.1rem calc(var(--g) * 0.85) 0.85rem");
      expect(sides(rulesFor(/^\.pending-action-card,\s*\.roster-panel-list li/s))).toBe(
        "0.85rem calc(var(--g) * 0.85)",
      );
      const optionRow = rulesFor(/^\.gear-option,\s*\.form-field--checkbox$/);
      expect(sides(optionRow)).toBe("0.4rem calc(var(--g) * 0.65)");
      expect(declaration(optionRow, "gap")).toEqual(["calc(var(--g) * 0.85)"]);
      expect(sides(rulesFor(/^summary$/))).toBe("0.5rem calc(var(--g) * 0.85)");
      expect(sides(rulesFor(/^details > :not\(summary\)$/))).toBe("0.75rem calc(var(--g) * 0.85)");
      for (const sheetPart of [/^\.sheet-header$/, /^\.sheet-body$/]) {
        expect(sides(rulesFor(sheetPart))).toContain("var(--g)");
      }
      expect(sides(rulesFor(/^\.sheet-footer$/))).toContain("var(--g)");
      // Text entry and buttons too (their side padding was 0.8rem / 1.25rem).
      expect(
        sides(
          rulesFor(
            /^input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\),\s*select,\s*textarea$/s,
          ),
        ),
      ).toBe("0.65rem calc(var(--g) * 0.8)");
      expect(sides(rulesFor(/^\.primary-action,\s*\.secondary-action$/s))).toBe(
        "0.7rem calc(var(--g) * 1.25)",
      );
    });

    it("lets an option row's text wrap inside the row (the bare text node needs the rule on the row), but never breaks a button label", () => {
      const row = rulesFor(/^\.gear-option,\s*\.form-field--checkbox$/);
      // `anywhere`, not the body's `break-word`: only `anywhere` lowers the min-content width, so the
      // flex row can shrink the text to its column instead of widening the page.
      expect(declaration(row, "overflow-wrap")).toEqual(["anywhere"]);
      expect(declaration(row, "min-width")).toContain("0");
      const rowButton = rulesFor(/^\.gear-option button$/);
      expect(declaration(rowButton, "overflow-wrap")).toEqual(["normal"]);
      // ...and never narrows it: a button has an explicit min-width (the tap size), which switches off the
      // automatic minimum, so without `flex: none` a squeezed row shrank "Reveal" below its own label.
      expect(declaration(rowButton, "flex")).toEqual(["none"]);
      expect(declaration(rulesFor(/^body$/), "overflow-wrap")).toEqual(["break-word"]);
    });

    it("wraps a row's own button onto a second line once the text would be narrower than 8rem, and leaves wide rows alone", () => {
      // Scoped to rows that hold a button: wrapping a checkbox row would drop its box onto its own line.
      expect(declaration(rulesFor(/^\.gear-option:has\(> button\)$/), "flex-wrap")).toEqual([
        "wrap",
      ]);
      const text = rulesFor(/^\.gear-option:has\(> button\) > span$/);
      // The basis decides when the button wraps (8rem grows with the text size); growing is capped at the
      // text's own width, so where there is room the button still follows the text immediately.
      expect(declaration(text, "flex")).toEqual(["1 1 8rem"]);
      expect(declaration(text, "max-width")).toEqual(["max-content"]);
    });

    it("keeps a decorative icon inside an option row from taking the label's column at 200% text", () => {
      expect(declaration(rulesFor(/^\.gear-option \.etr-icon$/), "width")).toEqual([
        "min(1.1em, 24px)",
      ]);
      expect(declaration(rulesFor(/^\.gear-option \.stat-icon$/), "margin-right")).toEqual([
        "min(0.3em, 6px)",
      ]);
    });

    it("keeps a closed <select>'s value window open at 200% text: the chevron and its reserve are capped in px", () => {
      const select = rulesFor(/^select$/);
      expect(declaration(select, "padding-right")).toEqual(["min(2.75rem, 44px)"]);
      expect(declaration(select, "background-position")).toEqual([
        "right min(0.85rem, 14px) center",
      ]);
      expect(declaration(select, "background-size")).toEqual(["min(1rem, 18px) min(1rem, 18px)"]);
      // Default size: 44px and 13.6px / 16px, i.e. unchanged.
      expect(evalMin("min(2.75rem, 44px)", 320, 16)).toBe(44);
      expect(evalMin("min(0.85rem, 14px)", 320, 16)).toBeCloseTo(13.6);
      expect(evalMin("min(1rem, 18px)", 320, 16)).toBe(16);
    });

    it("sizes button labels so 'Correction' and 'Allocation' fit a 320px button at 200% text, never below the text itself, and untouched at the default size", () => {
      const label = declaration(rulesFor(/^\.primary-action,\s*\.secondary-action$/s), "font-size");
      expect(label).toEqual(["min(1.25rem, max(1rem, 7vw))"]);
      for (const width of [320, 375, 412, 768, 1280])
        expect(evalMin(label[0]!, width, 16)).toBe(20);
      // A label follows the text-size setting: never smaller than the root (body) text, and it never
      // shrinks as the text grows (a plain 7vw would have frozen it at 22.4px on a 320px phone).
      let previous = 0;
      for (const root of [16, 20, 24, 28, 32]) {
        const size = evalMin(label[0]!, 320, root);
        expect(size).toBeGreaterThanOrEqual(root);
        expect(size).toBeGreaterThanOrEqual(previous);
        previous = size;
      }
      expect(evalMin(label[0]!, 320, 20)).toBeCloseTo(22.4);
      expect(evalMin(label[0]!, 320, 32)).toBe(32);
    });

    it("has the sheet choose between a pinned layout and one scrolling page from measured sizes", () => {
      // Pinned: no capped, nested scroller on the action row (the hook proved there is room for all of it).
      const pinnedFooter = rulesFor(/^\.sheet\[data-layout="pinned"\] \.sheet-footer$/);
      expect(declaration(pinnedFooter, "max-height")).toEqual(["none"]);
      expect(declaration(pinnedFooter, "overflow")).toEqual(["visible"]);
      // Page: the sheet is the one scroller; the body and the action row take their natural height.
      expect(declaration(rulesFor(/^\.sheet\[data-layout="page"\]$/), "overflow-y")).toEqual([
        "auto",
      ]);
      expect(
        declaration(rulesFor(/^\.sheet\[data-layout="page"\]$/), "overscroll-behavior"),
      ).toEqual(["contain"]);
      // The sheet is the scroller now, so it keeps a focused field clear of its edges like the body does.
      expect(
        declaration(rulesFor(/^\.sheet\[data-layout="page"\]$/), "scroll-padding-block"),
      ).toEqual(["1rem"]);
      const pageBody = rulesFor(/^\.sheet\[data-layout="page"\] \.sheet-body$/);
      expect(declaration(pageBody, "flex")).toEqual(["none"]);
      expect(declaration(pageBody, "overflow")).toEqual(["visible"]);
      const pageFooter = rulesFor(/^\.sheet\[data-layout="page"\] \.sheet-footer$/);
      expect(declaration(pageFooter, "max-height")).toEqual(["none"]);
      expect(declaration(pageFooter, "overflow")).toEqual(["visible"]);
      // They must come after the base rules they override.
      const baseFooter = css.indexOf(".sheet-footer {");
      expect(css.indexOf('.sheet[data-layout="pinned"] .sheet-footer')).toBeGreaterThan(baseFooter);
      expect(css.indexOf('.sheet[data-layout="page"] {')).toBeGreaterThan(baseFooter);
    });

    it("keeps the base rules as the no-JavaScript fallback (the 40% action-row cap and the 10rem container query)", () => {
      expect(declaration(rulesFor(/^\.sheet-footer$/), "max-height")[0]).toContain("* 0.4");
      expect(css).toMatch(/@container sheet \(max-height: 10rem\)/);
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
