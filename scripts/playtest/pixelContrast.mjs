// Pixel-sampled text contrast for the real-browser audit (scripts/playtest/ui-audit.mjs).
//
// axe-core computes colour contrast from CSS colours only. Wherever text sits on a background IMAGE or a
// gradient (every panel here carries a procedural grain texture, a hazard-tape band and a vignette) axe
// reports the node as "incomplete", not as a violation, so the audit's hard-axe gate cannot see a
// contrast regression there. This module measures what is actually drawn instead:
//
//   A. a viewport screenshot with every glyph made transparent (the true background under the text),
//   B. the same viewport with every glyph forced to pure magenta (marks exactly where glyph pixels are),
//
// and, for each text box, takes only the fully covered glyph pixels from B, reads the background under
// those same pixels from A, and computes the WCAG contrast ratio of the element's real text colour
// against each of them. The 5th-percentile (worst) ratio is compared with 4.5:1, or 3:1 for large text
// (>= 24px, or >= 18.66px bold). It is a measurement of the rendered page, not of the design tokens.
//
// Pure helpers (PNG decode, luminance, the per-box evaluation) are unit-tested in ui-audit-selftest.mjs
// without a browser. The in-page expressions are plain strings run through CDP Runtime.evaluate.

import { inflateSync } from "node:zlib";

/** Decodes an 8-bit, non-interlaced RGB or RGBA PNG (what Chrome's Page.captureScreenshot emits). */
export function decodePng(buffer) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i += 1) {
    if (buffer[i] !== signature[i]) throw new Error("not a PNG");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const depth = body[8];
      colorType = body[9];
      if (depth !== 8 || (colorType !== 2 && colorType !== 6) || body[12] !== 0) {
        throw new Error(
          `unsupported PNG (depth ${depth}, colour type ${colorType}, interlace ${body[12]})`,
        );
      }
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * 4, 255);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? line[x - channels] : 0;
      const up = previous[x];
      const upLeft = x >= channels ? previous[x - channels] : 0;
      let add = 0;
      if (filter === 1) add = left;
      else if (filter === 2) add = up;
      else if (filter === 3) add = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      line[x] = (line[x] + add) & 255;
    }
    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      pixels[to] = line[from];
      pixels[to + 1] = line[from + 1];
      pixels[to + 2] = line[from + 2];
      if (channels === 4) pixels[to + 3] = line[from + 3];
    }
    previous = line;
  }
  return { width, height, data: pixels };
}

/** WCAG relative luminance of an sRGB colour with 0-255 channels. */
export function relativeLuminance(r, g, b) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(lumA, lumB) {
  const hi = Math.max(lumA, lumB);
  const lo = Math.min(lumA, lumB);
  return (hi + 0.05) / (lo + 0.05);
}

/** `rgb(1, 2, 3)` / `rgba(1, 2, 3, .5)` / `rgb(1 2 3 / 50%)` -> [r, g, b, a], or null. */
export function parseCssColor(value) {
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(
    String(value).trim(),
  );
  if (!m) return null;
  let alpha = m[4] === undefined ? 1 : Number(m[4]);
  if (m[5] === "%") alpha /= 100;
  return [Number(m[1]), Number(m[2]), Number(m[3]), alpha];
}

/** Text at or above this size (CSS px), or bold at or above the second, needs only 3:1 (WCAG 1.4.3). */
export function isLargeText(sizePx, weight) {
  return sizePx >= 24 || (weight >= 700 && sizePx >= 18.66);
}

const MAGENTA = [255, 0, 255];

/**
 * For each text box measured in the page, the worst-case contrast of its text colour against the
 * rendered background under its fully covered glyph pixels.
 *
 * `background` and `glyphs` are decoded screenshots of the same viewport (glyphs transparent / glyphs
 * pure magenta). A box with fewer than `minCore` fully covered glyph pixels (a hairline of small text)
 * is reported as `insufficient`, not as a pass.
 */
export function evaluateBoxes(boxes, background, glyphs, { minCore = 6, tolerance = 14 } = {}) {
  if (background.width !== glyphs.width || background.height !== glyphs.height) {
    throw new Error("background and glyph screenshots differ in size");
  }
  const { width, height } = background;
  const results = [];
  for (const box of boxes) {
    const fg = parseCssColor(box.color);
    if (!fg) {
      results.push({ ...box, status: "unparsed-colour" });
      continue;
    }
    const left = Math.max(0, Math.floor(box.l));
    const right = Math.min(width, Math.ceil(box.r));
    const top = Math.max(0, Math.floor(box.t));
    const bottom = Math.min(height, Math.ceil(box.b));
    const ratios = [];
    for (let y = top; y < bottom; y += 1) {
      for (let x = left; x < right; x += 1) {
        const at = (y * width + x) * 4;
        if (
          Math.abs(glyphs.data[at] - MAGENTA[0]) > tolerance ||
          Math.abs(glyphs.data[at + 1] - MAGENTA[1]) > tolerance ||
          Math.abs(glyphs.data[at + 2] - MAGENTA[2]) > tolerance
        ) {
          continue;
        }
        const bg = [background.data[at], background.data[at + 1], background.data[at + 2]];
        // Opacity (own or inherited) lets the background show through the glyph.
        const alpha = fg[3] * (box.opacity ?? 1);
        const color = fg.slice(0, 3).map((c, i) => c * alpha + bg[i] * (1 - alpha));
        ratios.push(
          contrastRatio(
            relativeLuminance(color[0], color[1], color[2]),
            relativeLuminance(bg[0], bg[1], bg[2]),
          ),
        );
      }
    }
    const required = isLargeText(box.size, box.weight) ? 3 : 4.5;
    if (ratios.length < minCore) {
      results.push({ ...box, status: "insufficient", core: ratios.length, required });
      continue;
    }
    ratios.sort((a, b) => a - b);
    const p5 = ratios[Math.floor(ratios.length * 0.05)];
    results.push({
      ...box,
      status: p5 + 1e-9 >= required ? "pass" : "fail",
      core: ratios.length,
      min: Number(ratios[0].toFixed(2)),
      p5: Number(p5.toFixed(2)),
      required,
    });
  }
  return results;
}

/**
 * In the page: one entry per rendered text line of every visible text node, in viewport coordinates
 * (the audit's screenshots are 1 CSS px per device px). Clipped to the viewport and to every
 * scrolling/clipping ancestor, so text scrolled out of a container is not sampled, and text lines that
 * another element is drawn over are skipped and counted in `occluded`. Excludes disabled controls (WCAG
 * exempts inactive components), SVG text and inert subtrees. Returns `{ boxes, occluded }`.
 */
export const TEXT_BOXES_EXPRESSION = `(() => {
  const vw = document.documentElement.clientWidth;
  const vh = innerHeight;
  const clipOf = (el) => {
    let box = { l: 0, t: 0, r: vw, b: vh };
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(hidden|auto|scroll|clip)/.test(cs.overflowX + cs.overflowY) || cs.clipPath !== "none") {
        const r = p.getBoundingClientRect();
        box = { l: Math.max(box.l, r.left), t: Math.max(box.t, r.top), r: Math.min(box.r, r.right), b: Math.min(box.b, r.bottom) };
      }
    }
    return box;
  };
  const out = [];
  let occluded = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode()); ) {
    const text = node.nodeValue.replace(/\\s+/g, " ").trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el || el.closest("svg, script, style, [inert], option, optgroup")) continue;
    if (el.closest(":disabled, [aria-disabled='true'], fieldset:disabled")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    let opacity = 1;
    for (let p = el; p; p = p.parentElement) opacity *= parseFloat(getComputedStyle(p).opacity);
    if (opacity === 0) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    const clip = clipOf(el);
    for (const r of range.getClientRects()) {
      const l = Math.max(r.left, clip.l);
      const t = Math.max(r.top, clip.t);
      const rr = Math.min(r.right, clip.r);
      const b = Math.min(r.bottom, clip.b);
      if (rr - l < 3 || b - t < 3) continue;
      // Text under another element (the pinned action dock over the page, say) is not on show: another
      // element's glyphs would be sampled against it. Probe three points along the line's mid-height.
      const y = Math.min(vh - 1, Math.max(0, (t + b) / 2));
      const hidden = [0.25, 0.5, 0.75].some((f) => {
        const hit = document.elementFromPoint(Math.min(vw - 1, Math.max(0, l + (rr - l) * f)), y);
        return !hit || !(hit === el || el.contains(hit) || hit.contains(el));
      });
      if (hidden) { occluded += 1; continue; }
      const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\\s+/)[0] : "";
      out.push({ l, t, r: rr, b, color: cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color, size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10) || 400, opacity, text: text.slice(0, 28), element: el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + cls });
    }
  }
  return { boxes: out, occluded };
})()`;

/** Injected for pass A (glyphs invisible) and B (glyphs pure magenta). Shadows go in both so the two match. */
export const GLYPHS_TRANSPARENT_CSS =
  "*,*::before,*::after,::placeholder{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important;caret-color:transparent!important}";
export const GLYPHS_MAGENTA_CSS =
  "*,*::before,*::after,::placeholder{color:#f0f!important;-webkit-text-fill-color:#f0f!important;text-shadow:none!important;text-decoration-color:#f0f!important;caret-color:transparent!important}";
