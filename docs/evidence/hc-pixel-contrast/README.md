# hc pixel-contrast pass (2026-10-07)

Base `b73f3cd` (reskin lineage, `cb6bec5` + the hc no-source-change record). Local Firebase emulators and local `vite preview` builds only (private port range; peer lanes hold the defaults and were not touched). Nothing deployed.

## Gap found

axe-core cannot compute a colour for text over a background image or gradient, and most panels sit on the grain/dust/halftone layers. It reports those nodes as "incomplete", never as violations, so the prior green audits (0 axe violations) said nothing about them. `scripts/playtest/ui-audit.mjs` now has a pixel pass: it renders each state with glyphs transparent, forced white and forced black, derives a glyph mask from the differences, and measures the 2nd-percentile (worst-lit) contrast of each text run's computed colour (alpha composited) against the real pixels under its glyphs. Thresholds: 4.5:1, or 3:1 for large text (>= 24 px, or >= 18.66 px bold). Disabled controls and inert/aria-hidden content are skipped. Enabled by default at 320/375/768/1280/1920 (`--pixel-viewports` to change).

## Defect (before, `ui-audit-pixel-before-fix.json`)

Only one thing fails across 150 states x 5 viewports: the table surface's `Objective` and `Threats` `h3` labels (13.6 px mono, `--sc` = hot pink there) measured 3.04-3.71:1 at their worst-lit pixels over the card's dust speckle. Cyan (player) and acid (GM) accents on the same ground already pass.

## Fix

`.table-screen h3` gets a flat `--ink-0` chip (`width: fit-content; max-width: 100%; padding`). Pink on `--ink-0` is 6.49:1. Hue, order, semantics, targets unchanged. CSS only; regression test in `apps/web/test/styles/reskinContract.test.ts`.

## Results (`ui-audit-after.json`)

| Check | Result |
| --- | --- |
| States x viewports | 150 captures; pixel pass on 125 (landscape phone excluded by default) |
| Text runs measured / skipped (too few glyph pixels) / truncated (page > 6000 px) | 3,966 / 75 / 0 |
| Pixel-contrast failures | 0 (30 before) |
| Controls audited, control issues, overflow states, axe hard violations | 1,494, 0, 0, 0 (only the intentional `page-has-heading-one` note) |
| `npm run check` | 718 passed, 11 todo |
| Emulator suites (private ports, scratch clone with ports sed-ed) | 18 + 86 + 4 passed |
| `two-device-smoke.mjs --reload` (local emulators) | 17/17 |

Screenshots: table surface at phone 375, tablet 768, desktop 1280, table 1920, before/after (`table-idle-*`).

## Limits

Headless Chrome, default text size for the pixel pass (the large-text sheet scenarios are geometry-only), no hover/focus state colours, no forced-colors (the chip's author background is replaced by Canvas there; text stays legible), no real iOS Safari/Android, screen reader or physical-device pass. The pixel pass is a lossy detector: text with fewer than 4 fully covered glyph pixels is counted as skipped, ancestor opacity is not modelled, and overlapping elements can be mis-attributed.
