# Rendered-screen evidence (C05)

Real screenshots of the actual running app (`apps/web`, built with `vite build`, served with `vite preview`), captured with a headless Chrome driven directly over the DevTools Protocol (Node's built-in `WebSocket`, no `puppeteer`/`playwright` npm dependency added — see the reasoning below). Every flow step was driven with real DOM events against the real fixture gateway/store (`FixtureSessionGateway`, `fixturePlayLoopStore`); nothing here is a mockup.

Each file is named `<NN>-<step>-<width>x<height>[-noimg].png`. Full-page captures (the whole scrollable screen, not just the first viewport) at the three required widths: **375×812** (phone), **1280×800** (desktop/GM), **1920×1080** (table/large display).

## Flow steps captured

1. `01-landing` — `/` with the fixture-mode label and connection status.
2. `02-create-reveal` — the one-time secrets reveal card after `createRoom`.
3. `03-gm-console` — the director console (invite panel, scene director, empty pending actions, roster before anyone joins).
4. `04-claim` — the character-claim roster grid with all six real portraits and per-stat icons.
5. `05-player-dashboard` — the compose step, real scene background, party strip.
6. `06-declared` — the "waiting for the GM" state right after declaring an action.
7. `07-gm-pending-review` — the GM's pending-actions card for the same declaration.
8. `08-allocation` — kept/discarded dice chips and the allocation steppers, after the GM rolled.
9. `09-resolved` — the confirmed outcome: objective rating reduced, an injury marked, party strip updated live.
10. `10-table` — the read-only table display: route map, scene, party strip. No controls, no code/passphrase anywhere in the DOM (asserted in `apps/web/test/gm2/GmDirectorFlow.a11y.test.tsx`).

## With and without images

The `-noimg` files repeat the same ten steps with `Network.setBlockedURLs` blocking every `*.png`/`*.webp` request, proving `docs/ETR_ART_BRIEF.md` section 5's "usable without images" requirement live rather than only in jsdom (where images never load anyway — see `apps/web/test/shared/artFallbacks.test.tsx` for that automated half). `05-player-dashboard-375x812-noimg.png` is the clearest single example: the scene-card fallback (bone-noise gradient with the location name), the threat-glyph fallback on both Station Patrol entries, and the monogram portrait fallback in the party strip all render correctly, and every piece of information needed to play (stats, item uses, pool count, dice, ratings) is text or SVG, never conveyed only by a raster image.

## Tooling note

No headless-screenshot library (`playwright`, `puppeteer`) is in `package-lock.json`, and Sonnet C does not add dependencies there. These screenshots were produced by a small local script (not committed — see `.claude/worktrees/sonnet-c-screens` session history, or reconstruct from this note) that:

1. Launches the machine's existing `Google Chrome.app` with `--headless=new --remote-debugging-port=9333`.
2. Speaks the Chrome DevTools Protocol directly over Node 22's built-in `WebSocket` (`Emulation.setDeviceMetricsOverride` for the viewport, `Page.navigate`, `Runtime.evaluate` to drive the same DOM interactions a real user would, `Network.setBlockedURLs` for the no-images pass, `Page.captureScreenshot` with `captureBeyondViewport` sized to the full page).

This was necessary because Chrome's `--headless --screenshot=` CLI flag does not reliably lay out the page at the requested `--window-size` before capturing (a known Chromium limitation, confirmed by comparing its output against this CDP approach on the same page). If Sonnet A wants this reproducible in CI, `playwright`'s own screenshot API is the natural replacement once that package is deliberately added to `package-lock.json`.

## Known deviations

- A few full-page captures with dense generated-art content run slightly over the ≤300 KB/file guidance (largest: `10-table-1920x1080.png` at ~342 KB); no PNG-recompression tool (`pngquant`/`optipng`) was available locally to shrink them further without adding a dependency, and re-encoding as JPEG was judged worse for a documentation artifact than a modestly larger PNG.
