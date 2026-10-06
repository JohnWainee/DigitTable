# Compact threshold, page dimming and route headings: independent review

- **Date:** 2026-10-05
- **Branch:** `sonnet-fg/reskin-orchestrated-20261005` (from `4a91dd2`)
- **Reviewed:** `git diff 4a91dd2` at the point where the dimming was `html.sheet-open #root { opacity: .18 }` over a still-dimming backdrop (the first commit on the branch, `b803ca9`, had carried a `box-shadow` scrim, which real Safari showed to be ineffective; see "Process note").
- **Reviewer:** one independent Claude review agent in a fresh context, read-only; it ran focused vitest (3 files, 81 tests passed) and read the diff. It did not run browsers or the iOS rig (the author did, see the evidence README).
- **Verdict:** no Blocker, no High; presentation/markup only; AGENTS.md boundaries respected (nothing under engine, contracts, templates, rules, projections or session code changed).
- Evidence: [`docs/evidence/fg-reskin/`](../evidence/fg-reskin/README.md).

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | Medium | The `#root` dim shrinks the seam rather than removing it: inside the visual viewport the page sits under both the page opacity (.18) and the backdrop (.82), outside only under .18 (about 3% vs 18%) | **Fixed**: the backdrop is now transparent (explicit `Canvas` under forced colors), `#root` opacity is the only dimming, and the body's hazard rail/grain are dropped while a sheet is open. The contract test pins all four. Real Safari (iPhone 17 Pro, landscape, keyboard up) shows an even dim with no seam |
| 2 | Low | The page snapped dark while the backdrop faded in over 0.18 s | **Fixed**: `html.sheet-open #root { transition: opacity .18s ease-out }` inside the `prefers-reduced-motion: no-preference` block (reduced motion keeps the instant change) |
| 3 | Low | Raising the threshold also changes small phones in portrait with the keyboard up (≈270 px visible): Apply/Cancel scroll with the sheet, and the layout flips when Safari's toolbar crosses 288 px | **Accepted and documented** in the evidence README and handoff; only the Chrome `medium-keyboard-phone-small-*` scenarios cover it (no SE-class device exercised) |
| 4 | Low | `ui-audit.mjs` never runs axe with a sheet open, so "0 axe violations" says nothing about contrast with the dim active; a future axe-with-sheet pass would flag the inert page | **Fixed** (documented): a comment in `ui-audit.mjs` and the README limits |
| 5 | Nit | Handoff text still described the `box-shadow` scrim and a "no blockers" review of it | **Fixed**: handoff, README and this file rewritten to the final code |

Verified correct by the reviewer: the sheet is portalled to `<body>` so `#root`'s opacity does not dim it; the only `position: fixed` in `src` is the backdrop; live regions inside `#root` are inert while the sheet is open and opacity does not change the accessibility tree; forced colors keeps the page hidden through the backdrop's Canvas; `sheet-open` cleanup is counter-based and unchanged; exactly one `<h1>` per dead-end/loading branch with the main state's text, no duplicates or skipped levels; the new tests fail on the old code (headings 7/7; threshold boundary at 266/287 compact and 288/292 pinned fails at the old 15rem; the 32 px case; the dimming contract).

The review was run on the code before findings 1, 2 and 4 were fixed; those fixes were verified by the author's re-runs (unit contract, Chrome audits at 100/150/200% and forced colors, real Safari) rather than by a second reviewer pass, and are small and mechanical (CSS and a comment).

## Process note

A second Claude session (`digitable-reskin-fg-finish`) was attached to the same worktree. While this work was in progress it committed and pushed `b803ca9` (the then-uncommitted tree plus evidence, a handoff section and a review file) with claims that included the `box-shadow` scrim as the fix. The author found the scrim ineffective in real Safari, asked that session to stop (it acknowledged and did not touch the tree again) and replaced the claims with results re-run on the final source. The earlier review text in `b803ca9` is superseded by this file.
