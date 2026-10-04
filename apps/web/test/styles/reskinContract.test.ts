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

/**
 * Every `<button ...>` opening tag in a JSX source, found by scanning to the tag's real closing `>`:
 * `{...}` attribute expressions (an arrow function contains `=>`) and quoted strings are skipped over, so a
 * `className` written after an inline handler still belongs to the tag it is in. (A bare
 * `/<button\b[^>]*?>/` stops at the `>` of `=>` and mis-reads such a tag.)
 */
function buttonTags(source: string): { readonly tag: string; readonly index: number }[] {
  const found: { tag: string; index: number }[] = [];
  for (const start of source.matchAll(/<button\b/g)) {
    const from = start.index;
    let depth = 0;
    let quote: string | null = null;
    let end = source.length - 1;
    for (let i = from + "<button".length; i < source.length; i += 1) {
      const ch = source[i]!;
      if (quote !== null) {
        if (ch === quote && source[i - 1] !== "\\") quote = null;
      } else if (ch === '"' || ch === "'" || (ch === "`" && depth > 0)) {
        quote = ch;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
      } else if (ch === ">" && depth === 0) {
        end = i;
        break;
      }
    }
    found.push({ tag: source.slice(from, end + 1), index: from });
  }
  return found;
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
        for (const { tag } of buttonTags(source)) {
          const className = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(tag);
          if (className === null) continue;
          for (const token of (className[1] ?? className[2] ?? "").split(/\s+/).filter(Boolean)) {
            if (!covered.has(token)) uncovered.push(`${file.split("/src/")[1]}: ${token}`);
          }
        }
      }
      expect(uncovered).toEqual([]);
      const buttonRule = rulesFor(/\.primary-action.*\.stepper-controls button/s);
      expect(declaration(buttonRule, "min-height")).toContain("var(--tap)");
    });

    it("leaves no class-less <button> anywhere except the +/- steppers the tap rule names by position", () => {
      // The scan above only sees buttons that HAVE a className, so a class-less button (rendered as the
      // browser's own grey button: no tap size, no type, no focus treatment) slipped straight through it.
      // The only legitimate ones are the +/- buttons inside `.stepper-controls`, pinned per file.
      const allowed: Record<string, number> = {
        "shared/AllocationStepper.tsx": 2,
        "gm2/CorrectionDialog.tsx": 4,
      };
      const found: Record<string, number> = {};
      for (const file of sourceFiles(join(here, "../../src"))) {
        const source = readFileSync(file, "utf8");
        const name = file.split("/src/")[1]!;
        for (const { tag, index } of buttonTags(source)) {
          if (/className=/.test(tag)) continue;
          found[name] = (found[name] ?? 0) + 1;
          // Each must sit inside a stepper row: `.stepper-controls` opens shortly before it.
          const before = source.slice(Math.max(0, index - 700), index);
          expect(before, `${name}: a class-less <button> outside .stepper-controls`).toContain(
            "stepper-controls",
          );
        }
      }
      expect(found).toEqual(allowed);
    });

    it("styles a gear row's own action button and the select echo, and flags invalid fields", () => {
      expect(rulesFor(/^\.gear-item$/).join("")).toMatch(/flex-direction:\s*column/);
      // Its own left margin must fit inside the row (a bare 100% would overflow the row by the margin).
      expect(declaration(rulesFor(/^\.gear-item > \.secondary-action$/), "max-width")).toEqual([
        "calc(100% - 0.65rem)",
      ]);
      expect(rulesFor(/^\.scene-director-detail$/).join("")).toMatch(/flex-direction:\s*column/);
      expect(
        declaration(rulesFor(/^\.scene-director-detail h3:not\(:first-child\)$/), "margin-top"),
      ).toEqual(["0.5rem"]);
      expect(rulesFor(/^\.select-echo$/).join("")).toMatch(/overflow-wrap:\s*anywhere/);
      // Invalid inputs change weight as well as hue (colour is never the only channel). The selector must
      // out-specify the base `input:not([type=checkbox]):not([type=radio])` rule or the border stays grey
      // (a bare `input[aria-invalid]` is (0,1,1) against the base's (0,2,1)).
      const invalid = rulesFor(
        /^input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)\[aria-invalid="true"\],/s,
      );
      expect(invalid).toHaveLength(1);
      expect(declaration(invalid, "border-width")).toEqual(["3px"]);
      expect(declaration(invalid, "border-color")).toEqual(["var(--riot)"]);
      expect(rulesFor(/^\.field-error::before$/).join("")).toContain('content: "Error: "');
      // Equal specificity with the :focus-visible border rule: the invalid rule must come after both it
      // and the base input rule, or the focused invalid field loses its red border (a vitest-invisible
      // slip that only a computed-style check in a browser would otherwise catch).
      const at = (needle: string): number => {
        const found = css.indexOf(needle);
        expect(found, needle).toBeGreaterThanOrEqual(0);
        return found;
      };
      const invalidAt = at('[type="radio"])[aria-invalid="true"]');
      expect(
        at('input:not([type="checkbox"]):not([type="radio"]),\nselect,\ntextarea {'),
      ).toBeLessThan(invalidAt);
      expect(at('input:not([type="checkbox"]):not([type="radio"]):focus-visible')).toBeLessThan(
        invalidAt,
      );
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

    it("makes the whole sheet scroll as one page when too little height is visible (data-compact)", () => {
      // Landscape phone + on-screen keyboard leaves ~70-140px in real iOS Safari: a pinned header and
      // action row cannot fit, so nothing may be pinned or clipped.
      // The wide-viewport rule pads the backdrop 1.5rem on every side; compact must take that dead band
      // back (it left the focused field 36/48px visible at 70px) and keep only the device insets.
      const backdrop = rulesFor(/^\.sheet-backdrop\[data-compact\]$/);
      // The footer carries the bottom inset already (asserted below): adding it on the backdrop as well
      // counted it twice and clipped the focused field at 60-70px with a real inset.
      expect(declaration(backdrop, "padding-bottom")).toEqual(["0"]);
      expect(declaration(backdrop, "padding-top")).toEqual([
        "max(env(safe-area-inset-top, 0px), 0.25rem)",
      ]);
      const header = rulesFor(/^\.sheet-backdrop\[data-compact\] \.sheet-header$/);
      expect(declaration(header, "padding-top")).toEqual(["0.25rem"]);
      expect(declaration(header, "padding-bottom")).toEqual(["0.35rem"]);
      const sheet = rulesFor(/^\.sheet-backdrop\[data-compact\] \.sheet$/);
      expect(declaration(sheet, "overflow-y")).toEqual(["auto"]);
      expect(declaration(sheet, "overscroll-behavior")).toEqual(["contain"]);
      const body = rulesFor(/^\.sheet-backdrop\[data-compact\] \.sheet-body$/);
      expect(declaration(body, "overflow")).toEqual(["visible"]);
      expect(declaration(body, "flex")).toEqual(["none"]);
      const footer = rulesFor(/^\.sheet-backdrop\[data-compact\] \.sheet-footer$/);
      expect(declaration(footer, "max-height")).toEqual(["none"]);
      expect(declaration(footer, "overflow")).toEqual(["visible"]);
      // Tight padding, so a 48px action button can fit the ~54px a 60px-high sheet shows.
      expect(declaration(footer, "padding-top")).toEqual(["0.25rem"]);
      expect(declaration(footer, "padding-bottom")[0]).toContain("env(safe-area-inset-bottom");
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

  describe("zine v2 layer", () => {
    it("keeps the heading highlighter legible: ink text on every role accent it can fill with", () => {
      for (const accent of ["riot", "pink", "cyan", "acid"]) {
        expect(contrast("ink-0", accent), accent).toBeGreaterThanOrEqual(4.5);
      }
      expect(declaration(rulesFor(/^\.step h2,/), "color")).toEqual(["var(--ink-0)"]);
    });

    it("draws the photocopy texture behind all content, inert, and drops it in forced-colors", () => {
      const rule = rulesFor(/^body::before$/);
      expect(declaration(rule, "z-index")).toEqual(["-1"]);
      expect(declaration(rule, "pointer-events")).toEqual(["none"]);
      expect(declaration(rule, "position")).toEqual(["fixed"]);
      expect(mediaBlock("(forced-colors: active)")).toMatch(/body::before\s*\{\s*display:\s*none/);
    });

    it("keeps the dimmest body text legible on the brightest photocopy streak", () => {
      // axe measures contrast against the flat ink, so it cannot see the texture. Measured in Chrome
      // (canvas read-back of the SVG): the streak's peak alpha is 0.683 x its opacity attribute (0.34
      // at the original 0.5). Composite that white over the page's brightest base and demand the dimmest text colour
      // that sits directly on the page (--mute) still clears AA there.
      const url = declaration(rulesFor(/^body::before$/), "background-image").join("");
      const opacity = Number(/opacity='([.\d]+)'\/%3E%3C\/svg%3E/.exec(url)?.[1]);
      expect(opacity).toBeGreaterThan(0);
      const alpha = 0.683 * opacity;
      const channels = (hex: string): number[] =>
        [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      // The worst base under the streak is the body's riot glow at its peak (rgba(255,51,72,.2) over
      // --ink-0); the halftone dots and grain are far fainter and sparse.
      const riot = channels(token("riot"));
      const base = channels(token("ink-0")).map((v, i) => v * 0.8 + riot[i]! * 0.2);
      const streak = base.map((v) => Math.round(v * (1 - alpha) + 255 * alpha));
      const hex = `#${streak.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      const lum = luminance(hex);
      const mute = luminance(token("mute"));
      expect((mute + 0.05) / (lum + 0.05)).toBeGreaterThanOrEqual(4.5);
    });

    it("drops the photocopy texture for visitors who ask for more contrast", () => {
      expect(mediaBlock("(prefers-contrast: more)")).toMatch(/body::before\s*\{\s*display:\s*none/);
    });

    it("never recolours a disabled landing button", () => {
      expect(css).toMatch(
        /\.landing-actions--primary > \.primary-action:nth-child\(2\):not\(:disabled\)\s*\{/,
      );
    });

    it("decorates panels with backgrounds only (no positioned pseudo-element that columns could split)", () => {
      const zine = css.slice(css.indexOf(".landing-screen {\n  --role-accent"));
      expect(zine).not.toMatch(/::after\s*\{[^}]*position:\s*absolute/);
      expect(declaration(rulesFor(/^\.step,/), "background").join("")).toContain(
        "repeating-linear-gradient",
      );
    });

    it("gives each surface its own accent", () => {
      for (const surface of ["landing", "gm", "player", "table"]) {
        expect(rulesFor(new RegExp(`^\\.${surface}-screen$`)).join("")).toContain("--role-accent");
      }
    });
  });
  describe("action dock (sticky commit row)", () => {
    const dock = (): string[] => rulesFor(/^\.action-dock$/);

    it("pins to the bottom of the visible viewport inside its panel, above everything it scrolls past", () => {
      expect(declaration(dock(), "position")).toContain("sticky");
      expect(declaration(dock(), "bottom")).toContain("0");
      expect(Number(declaration(dock(), "z-index")[0])).toBeGreaterThan(0);
      // It must stay below the pop-out sheet (z-index 100).
      expect(Number(declaration(dock(), "z-index")[0])).toBeLessThan(100);
      // An opaque surface: text scrolling underneath it must never show through.
      expect(declaration(dock(), "background")).toEqual(["var(--ink-0)"]);
    });

    it("clears the home indicator and caps its height with a vh base and a dvh override", () => {
      expect(declaration(dock(), "padding").join(" ")).toContain("env(safe-area-inset-bottom");
      // (The short-viewport rule later lifts the cap with `none`.)
      expect(declaration(dock(), "max-height").slice(0, 2)).toEqual(["45vh", "45dvh"]);
      expect(css).toMatch(
        /@supports \(height: 100dvh\)\s*\{\s*\.action-dock\s*\{\s*max-height:\s*45dvh/,
      );
      // The vh base precedes the dvh override (a later base would win).
      expect(css.indexOf("max-height: 45vh")).toBeLessThan(css.indexOf("max-height: 45dvh"));
      expect(declaration(dock(), "overflow-y")).toEqual(["auto"]);
      // No scroll trap: when the dock is scrolled to its end a touch-drag on it still moves the page.
      expect(declaration(dock(), "overscroll-behavior")).toEqual([]);
    });

    it("drops the pinned bar for a zoomed or short VISUAL viewport, which no media query can see", () => {
      const unpinned = rulesFor(/^\.action-dock\[data-unpinned\]$/);
      expect(declaration(unpinned, "position")).toEqual(["static"]);
      expect(declaration(unpinned, "max-height")).toEqual(["none"]);
      expect(declaration(unpinned, "box-shadow")).toEqual(["none"]);
      // Must come after the base rule and its dvh override, or the cap and sticky would win again.
      expect(css.indexOf(".action-dock[data-unpinned] {")).toBeGreaterThan(
        css.indexOf("max-height: 45dvh"),
      );
      // No scroll-padding for a bar that no longer overlays the page, and it out-specifies the base rule.
      expect(
        declaration(
          rulesFor(/^html:has\(\.action-dock\[data-unpinned\]\)$/),
          "scroll-padding-bottom",
        ),
      ).toEqual(["0"]);
      expect(css.indexOf("html:has(.action-dock[data-unpinned])")).toBeGreaterThan(
        css.indexOf("html:has(.action-dock) {"),
      );
    });

    it("puts the actions first only while the dock overflows its cap, and restores the row layout when wide", () => {
      expect(
        declaration(rulesFor(/^\.action-dock\[data-clipped\] > \.action-dock-actions$/), "order"),
      ).toEqual(["-1", "0"]);
      // The reset sits inside the min-width media block, after the base rule.
      const reset = css.lastIndexOf(".action-dock[data-clipped] > .action-dock-actions");
      expect(reset).toBeGreaterThan(css.indexOf("@media (min-width: 34rem)"));
    });

    it("keeps a focused control clear of the dock (WCAG 2.2 SC 2.4.11) and gives the room back when short", () => {
      const rule = rulesFor(/^html:has\(\.action-dock\)$/);
      expect(declaration(rule, "scroll-padding-bottom")[0]).toContain("var(--action-dock-height");
      // Under 20rem of height a pinned bar would leave almost no page: it falls back into the flow.
      const short = mediaBlock("(max-height: 20rem)");
      expect(short).toMatch(/\.action-dock\s*\{[^}]*position:\s*static/);
      expect(short).toMatch(/scroll-padding-bottom:\s*0/);
    });

    it("bleeds to its panel's own edges, with the card's smaller padding declared where it differs", () => {
      const margin = declaration(dock(), "margin").join(" ");
      expect(margin).toContain("var(--dock-bleed-x, 1rem)");
      expect(margin).toContain("var(--dock-bleed-b, 1.25rem)");
      // .step pads 1rem / 1.25rem, so the defaults match it; the GM card pads 0.85rem all round.
      expect(declaration(rulesFor(/\.pending-action-card/), "padding")).toContain("0.85rem");
      const card = rulesFor(/^\.pending-action-card$/).join(" ");
      expect(card).toContain("--dock-bleed-x: var(--pending-pad)");
      expect(card).toContain("--dock-bleed-b: var(--pending-pad)");
      // The card pads by the same capped amount the dock bleeds by, in px so 200% text cannot inflate it.
      expect(card).toContain("--pending-pad: min(0.85rem, 12px)");
      expect(card).toContain("padding: var(--pending-pad)");
    });

    it("caps the GM card's nested inline padding in px so 200% text cannot squeeze its rows", () => {
      expect(declaration(rulesFor(/^\.pending-action-card fieldset$/), "padding-inline")).toEqual([
        "min(0.85rem, 10px)",
      ]);
      const option = rulesFor(/^\.pending-action-card \.gear-option$/);
      expect(declaration(option, "padding-inline")).toEqual(["min(0.65rem, 8px)"]);
      expect(declaration(option, "gap")).toEqual(["min(0.85rem, 12px)"]);
      expect(declaration(option, "overflow-wrap")).toEqual(["anywhere"]);
      expect(
        declaration(rulesFor(/^\.pending-action-card \.action-dock$/), "padding-inline"),
      ).toEqual(["min(1rem, 12px)"]);
      expect(
        declaration(
          rulesFor(/^\.pending-action-card \.action-dock-actions > button$/),
          "padding-inline",
        ),
      ).toEqual(["min(1.25rem, 14px)"]);
    });

    it("stacks status over a full-width, wrapping action row below 34rem (phones)", () => {
      expect(declaration(dock(), "flex-direction")[0]).toBe("column");
      const actions = rulesFor(/^\.action-dock-actions$/);
      expect(declaration(actions, "display")).toEqual(["flex"]);
      expect(declaration(actions, "flex-wrap")).toEqual(["wrap"]);
      const button = rulesFor(/^\.action-dock-actions > button$/);
      // A 12rem basis that may shrink to nothing: two buttons share a row only when they fit.
      expect(declaration(button, "flex")[0]).toBe("1 1 12rem");
      expect(declaration(button, "min-width")[0]).toBe("0");
    });

    it("wraps instead of squeezing: two long buttons at 540-720px never crush the status", () => {
      const row = mediaBlock("(min-width: 34rem)");
      expect(row).toMatch(/\.action-dock\s*\{[^}]*flex-wrap:\s*wrap/);
      expect(row).toMatch(/\.action-dock-status\s*\{[^}]*flex:\s*1 1 10rem/);
      expect(row).toMatch(/\.action-dock-actions\s*\{[^}]*flex:\s*0 1 auto/);
      expect(row).not.toMatch(/flex:\s*none/);
    });

    it("marks a die's chosen target with its own legend colour (text carries the state too)", () => {
      expect(
        declaration(rulesFor(/^\.allocation-die-group:has\(:checked\) > legend$/), "background"),
      ).toEqual(["var(--volt)"]);
      expect(contrast("ink-0", "volt")).toBeGreaterThanOrEqual(4.5);
    });

    it("renders status and actions legibly: AA text on the ink surface, one row once there is room", () => {
      expect(contrast("ink-0", "acid")).toBeGreaterThanOrEqual(4.5);
      expect(contrast("ink-0", "paper")).toBeGreaterThanOrEqual(4.5);
      expect(declaration(rulesFor(/^\.action-dock-status$/), "color")).toEqual(["var(--paper)"]);
      expect(declaration(rulesFor(/^\.action-dock-status strong$/), "color")).toEqual([
        "var(--acid)",
      ]);
      expect(mediaBlock("(min-width: 34rem)")).toMatch(/flex-direction:\s*row/);
      // A wrapped, flexible action row: a long second button never forces horizontal overflow.
      expect(declaration(rulesFor(/^\.action-dock-actions$/), "flex-wrap")).toEqual(["wrap"]);
    });

    it("is the commit row of every long decision form, and only presentational markup", () => {
      const root = join(here, "../../src");
      for (const file of [
        "player2/ComposeStep2.tsx",
        "player2/AllocationPanel2.tsx",
        "player2/ChooseInjuryPanel2.tsx",
        "gm2/PendingActionsPanel.tsx",
      ]) {
        const source = readFileSync(join(root, file), "utf8");
        expect(source, file).toContain("<ActionDock");
        // The primary button of each form names the dock's status as its description.
        expect(source, file).toMatch(
          /aria-describedby=(?:"(?:compose|allocation|injury)-dock-status"|\{`pending-\$\{roll\.rollId\}-dock-status`\})/,
        );
      }
    });
  });

  describe("pop-outs, menus and option lists", () => {
    it("has no anchored popover, menu or custom listbox: choices are native selects, inline lists or the sheet", () => {
      // A dropdown anchored to a trigger can clip off a narrow screen, hide behind the on-screen
      // keyboard, or trap a touch user. Native <select> hands the popup to the OS; everything else
      // here is an inline control or the SheetDialog bottom sheet. Introducing an anchored popover
      // pattern needs a recorded design decision, not a drive-by.
      const offenders: string[] = [];
      for (const file of sourceFiles(join(here, "../../src"))) {
        const source = readFileSync(file, "utf8");
        for (const pattern of [
          /\bpopover\b/,
          /aria-haspopup/,
          /role=["'](?:menu|menubar|listbox|combobox|tooltip)["']/,
          /<datalist\b/,
          /\bposition:\s*absolute[^;]*;[^}]*\bz-index/,
        ]) {
          if (pattern.test(source)) offenders.push(`${file}: ${pattern}`);
        }
      }
      expect(offenders).toEqual([]);
      expect(css).not.toMatch(/\[popover\]|:popover-open|anchor-name|position-anchor/);
    });
  });

  describe("shared table display legibility", () => {
    const wide = mediaBlock("(min-width: 80rem)");
    const ruleFor = (selector: string): string => {
      const re = /([^{}]+)\{([^{}]*)\}/g;
      for (let m = re.exec(wide); m; m = re.exec(wide)) {
        if (m[1]!.split(",").some((part) => part.trim() === selector)) return m[2]!;
      }
      throw new Error(`no ${selector} rule in the wide-screen block`);
    };

    it("sizes secondary text relative to the table base so it scales with the wall display", () => {
      // Root-rem secondary text (0.75-0.9rem) stays 12-14px while .table-screen grows to 18-22px.
      for (const selector of [
        ".table-screen .form-hint",
        ".table-screen h3",
        ".table-screen .party-member-stats",
        ".table-screen .connection-status",
      ]) {
        const size = /font-size:\s*([\d.]+)em\b/.exec(ruleFor(selector));
        expect(size, selector).not.toBeNull();
        // Never below 0.9x the table's own (>= 1.15rem = 18.4px) size: >= ~16.5px on screen.
        expect(Number(size![1]), selector).toBeGreaterThanOrEqual(0.9);
      }
    });

    it("keeps the larger table text inside a non-scrolling display", () => {
      // Larger chips would stack one per column and push a full party past 1080px.
      expect(ruleFor(".table-screen .party-strip")).toMatch(/column-span:\s*all/);
      const huge = mediaBlock("(min-width: 110rem)");
      expect(huge).toMatch(/\.table-screen \.scene-card-art--banner\s*\{[^}]*height:\s*18rem/);
      expect(huge).toMatch(/\.table-screen \.route-map\s*\{[^}]*max-width:\s*38rem/);
    });
  });
});
