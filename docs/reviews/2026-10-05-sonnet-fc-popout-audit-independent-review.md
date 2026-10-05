# Pop-out audit and landscape-keyboard compact sheet: independent review

- **Date:** 2026-10-05
- **Branch:** `worktree-digitable-sonnet-fc-reskin-mobile-20261005` (from `86e6c93`)
- **Reviewed:** the uncommitted diff of `useVisualViewportBox.ts`, `styles.css`, two tests and `ui-audit.mjs`, plus the byte-identity of the copied rig files.
- **Reviewer:** one independent Claude review agent in a fresh context with no access to the author's reasoning; read-only; it read the diff and did not run the tests (the author ran them).
- **Verdict:** approve, no blockers; no change outside presentation; engine, contracts, projection and privacy untouched.
- Evidence: [`docs/evidence/fc-reskin/`](../evidence/fc-reskin/README.md).

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | Medium | Compact decision ran on every visualViewport `scroll` and read root font size (forced style recalculation while panning a zoomed page); not re-evaluated on a text-size change | **Fixed** (partly): evaluated on mount and `resize` only, comment added. A root font-size change while a sheet is open is still not re-evaluated (rare; accepted) |
| 2 | Medium | Pinch-zoom ≥4× or 200% text on a landscape phone engages compact | **Accepted as intended**, documented in the hook |
| 3 | Medium | No compact mode where `window.visualViewport` is undefined | **Accepted, not added**; recorded as a limit (the `max-height: 34rem` block remains the fallback) |
| 4 | Low | Test did not guard `Math.min(visual.height, innerHeight)` | **Fixed**: added a test with a tall visual viewport and a short layout viewport |
| 5 | Low | Contract test checked 4 declarations only | **Fixed**: now also asserts the compact backdrop `padding-top`/`padding-bottom` and the footer's safe-area bottom padding |
| 6 | Low | Safe-area override leaking between scenarios | Verified not an issue (`scenario()` resets it) |
| 7 | Nit | CSS comment said "only the notch inset (top)" though side padding also remains | **Fixed** |

Verified correct by the reviewer: compact selectors out-rank the base `.sheet-footer`, the `@supports dvh` rule and the `34rem` block regardless of order; safe-area insets are not counted twice; no effect on reduced motion, forced colors or focus; no feedback loop in the hook; the copied rig files are byte-identical to the source branch; the audit's compact checks are not vacuous (`compactModeEngaged` is asserted).
