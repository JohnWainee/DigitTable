# fu fresh pop-out / mobile-viewport audit review

- **Date:** 2026-10-06
- **Audited commit:** `ccb9f2d` (branch `sonnet-fu/reskin-fresh-20261006`); **no source change was made.**
- **Author:** Sonnet fu session. **Independent reviewer:** a separate fresh subagent, read-only, static inspection.
- **Verdict:** no new genuine defect; no cosmetic churn. The audit is recorded, nothing else changes.

## Pop-out inventory (reviewer and author agree)

One modal (`shared/SheetDialog.tsx`, used by `gm2/CorrectionDialog.tsx`); six native `<select>`s
(`gm2/SceneDirector.tsx`, `gm2/GmToolsPanel.tsx`) with `SelectedEcho`; one in-flow `<details>`
(`player2/ComposeStep2.tsx`). No custom listbox/menu/tooltip/popover/toast. The sheet is the only
`position: fixed` element: visual-viewport sized (`--vv-*`, `100dvh` fallback), safe-area insets,
inert background, scroll lock, Back-dismiss, focus trap, pinch-zoom allowed. `viewport-fit=cover` and
`interactive-widget=resizes-content` are set; text-entry controls are 1rem with 44px minimum height.

## Evidence (local emulators remapped to ports 1xxxx because peer lanes hold the defaults)

| Check | Result |
| --- | --- |
| `npm run check` | format, lint, typecheck, 714 passed / 11 todo |
| `npm run build` | passed (existing chunk-size warning only) |
| `ui-audit.mjs` (150 states x 6 viewports) | 1,542 controls, 0 control issues, 0 overflow states, 0 axe hard violations; modal scenarios pass; report in `docs/evidence/fu-fresh-audit/` |
| `two-device-smoke.mjs --reload` | 17/17 |
| emulator suites (remapped ports, config not committed) | 18 rules + 86 Functions + 4 web passed |

Best-practice note unchanged: `page-has-heading-one` on the intentional nonexistent-room route.

## Recorded limit (not fixed)

At 320 px with 200% root text the GM console behind the sheet overflows the page by ~5 px
(`.gear-option` inside `.pending-action-card`: rem-scaled nested padding leaves ~65 px). The audit
measures it with the sheet open (inert, scroll-locked, sheet itself in bounds). The reviewer agreed
it is an acceptable limit, but noted that with the sheet closed it would be real horizontal scroll;
that closed-sheet state was **not** measured. Backlog: shrink nested padding at narrow rem widths and
re-audit with real browser font-size scaling (the audit's style override does not scale `em` media queries).

## Not verified

No real iOS Safari / Android keyboard, screen reader, Windows High Contrast or physical device pass;
no staging playthrough of this build (needs the staging web API key, not read). The reviewer did not
re-run the browser audit.
