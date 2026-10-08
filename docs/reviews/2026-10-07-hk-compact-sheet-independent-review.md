# HK mobile viewport follow-up: compact sheet, independent review

- **Date:** 2026-10-07
- **Branch:** `sonnet-hk/reskin-mobile-viewport-20261007` (from `91977ca`, the HE reskin tip)
- **Reviewer:** one fresh read-only Claude agent with no access to the author's reasoning. It ran only the stylesheet contract test and read the diff; it did not run the browser audit.
- **Verdict:** no High or Medium findings. The one Nit and two Lows were handled or recorded below.

## Audit scope

Every picker in the app: six native `<select>`s (`SelectField`: GM scene director and tools), one `<details>` (the player's "Why?" pool disclosure), and one modal (`SheetDialog`, used by the GM correction sheet). There is no custom menu, listbox, drawer or popover.
Widths audited by `ui-audit.mjs` on the real app against a port-remapped emulator rig: 320, 375, 812x375, 667x375 (landscape), 768, 1280, 1920. The modal also at emulated keyboards, safe-area insets, pinch-zoom, 150/200% text, reduced motion on/off.

## The defect (independently reproduced)

With the sheet's visible area short (an on-screen keyboard), the pinned header and pinned footer leave `.sheet-body` almost nothing, and the footer is clipped by the sheet's `overflow: hidden`.
Measured with a static page that links the real built stylesheet, in headless Chrome (`docs/evidence/sonnet-hk-reskin/probe.html` with `scripts/playtest/sheet-compact-probe.mjs`; usage: serve both with the built `app.css` in one folder, then `node sheet-compact-probe.mjs PORT URL CASES_JSON LABEL`; screenshots land in `/tmp`):

| case (visible height) | before                                                 | after                              |
| --------------------- | ------------------------------------------------------ | ---------------------------------- |
| 667x375 landscape, 140 | body 24 px; Apply/Cancel not hit-testable              | whole sheet scrolls; both reachable |
| 667x375 landscape, 90  | Apply/Cancel outside the frame                         | reachable after scrolling           |
| 320x568 portrait, 260  | body 68 px; Cancel outside the frame                   | reachable after scrolling           |
| 375x812, 300           | body 119 px                                            | reachable after scrolling           |
| 320, 375, 667x375 (no keyboard), 768, 1280, 1920 | pinned | unchanged (pinned, same body heights) |

In the real app the stand-in `visualViewport` scenarios (`vv-keyboard-*`, added to `ui-audit.mjs`) fail on the old stylesheet (`reasonReachable` at 140 px) and pass on the new one (9 of 9).

## Fix

CSS only (`styles.css`): `.sheet-backdrop` becomes a size container (`container: sheet-box / size`; its width and height are always explicit) and `@container sheet-box (max-height: 288px)` lets the whole `.sheet` scroll (header, body, footer in one flow). 288 px is 18rem at default text, written in px so that large text keeps the pinned layout. Engines without container queries keep the old layout. `scroll-padding-block: 1rem` on `.sheet` in compact mode (reviewer Nit). No change to `SheetDialog` behaviour (comment only), the engine, projections, authorization, Firebase or assets.

## Review findings

| Sev  | Finding                                                                                                   | Disposition |
| ---- | --------------------------------------------------------------------------------------------------------- | ----------- |
| Nit  | `scroll-padding-block` lived on the body, which no longer scrolls in compact mode                         | Added to `.sheet` in the container block; asserted |
| Nit  | Stale comment in `SheetDialog.tsx` ("scrolls only the sheet body")                                        | Reworded |
| Low  | Trigger depends on backdrop padding: about 312 px visible in portrait, about 335 px with a 47 px notch, about 296 px with the Android layout-viewport keyboard | Recorded; harmless (the sheet is usable on either side). The audit's `compact` is 312 for zero-inset portrait only |
| Low  | Browser zoom of 400% or more also becomes compact; "large text keeps pinned" holds for text scaling only | Recorded, arguably better |
| Low  | The contract test does not tie the 288 px to the audit's 312 px threshold; the 288 to 340 range is not sampled | Recorded, open |
| Low  | The legacy `modal-keyboard` scenario now scrolls to the end before checking actions, so it cannot catch a clipped pinned footer; the `vv-keyboard-*` scenarios keep an unscrolled check when not compact | Recorded |

## Provenance note

When I started, `scripts/playtest/ui-audit.mjs` already carried 69 uncommitted lines (the `vv-keyboard-*` scenarios) that I did not write. A second Claude session had been started in the same worktree by mistake; it said they were not its work either and moved to a separate worktree. I read them, ran them against both stylesheets, extended them (`SCROLL_SHEET_TO_END`, compact-aware checks, 288 px comment) and adopted them. The file also changed on disk twice while I worked. Treat the audit script as this change's co-authored test; the stylesheet and contract test are mine.

## Verification

See `CLAUDE_HANDOFF.md`. Evidence: `docs/evidence/sonnet-hk-reskin/{before,after}`.

## Limits (not hidden)

- No physical iPhone or Android, and no real Safari pass: headless Chrome cannot shrink only the visual viewport, so keyboard cases use a stand-in `visualViewport` plus layout-viewport shrink. The iOS Simulator was not used in this lane. Native `<select>` popups are OS pickers and were audited closed only.
- The emulator rules/Functions suites were not re-run: default ports 9099/8080/9000/5001 are held by peer lanes, and this change touches no rules, Functions or engine code.
- No deploy, merge or production resource.
