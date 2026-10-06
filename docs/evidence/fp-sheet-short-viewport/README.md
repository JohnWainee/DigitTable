# fp: correction sheet with very little visible height (2026-10-06)

Base: `ec2b96a` (`codex/reskin-fi-integration-20261006`). Everything ran locally (own Firebase emulators,
`demo-digitable`, `vite preview`, headless Chrome, iOS Simulator). Nothing deployed, no merge, no
production or staging contact.

**Defect (reproduced on the base):** with ~140px or less visible (a landscape phone with the iOS
keyboard up), the sheet's pinned header and footer left `.sheet-body` its padding only; the Apply/Cancel
row was clipped by the sheet's `overflow: hidden` and the Reason field by a 24px body. At >= 200px
visible everything was reachable.

**Fix (presentation only, `styles.css`):** `.sheet-backdrop` is a size container; `@container sheet-box
(max-height: 18rem)` lets the whole sheet scroll as one page. No JS, markup, engine, contract, template,
Firebase, authorization, projection or dependency change.

| Evidence | Base `ec2b96a` | Fixed |
| --- | --- | --- |
| New audit scenarios `vv-keyboard-{phone-landscape,phone-667x375}-{288,200,140,100}` (real Chrome, `--vv-*` stood in, scroll-aware reachability) | **12 failing checks** (reason/apply/cancel unreachable at 140 and 100) | 0 failing |
| Real Mobile Safari, iPhone 17 Pro simulator (`before/ios-safari-*`, `after/ios-safari-*`; static page + the real built stylesheet, visible height stood in at 140 and 100) | header, empty body strip, "APPLY" clipped | both actions fully visible and tappable (page scrolled by the probe) |
| Full `ui-audit.mjs` on the fixed build | n/a | 150 states, 1,374 controls, 0 control issues, 0 overflow states, 0 hard axe violations, 0 failures |
| Tablet / desktop / table widths | `gm-correction-sheet-{tablet,desktop}.jpg`, `sheet-static-table-1920x1080.png` | identical (the one-page layout only engages when little height is visible; the table crop is byte-identical) |

Phone portrait/landscape captures at normal height are `gm-correction-sheet-phone.jpg` before/after;
vv captures at 140/100 are `gm-correction-vv-phone-landscape-*` and `gm-correction-vv-phone-667x375-*`.
`modal-report.json` in each folder is the audit's modal report.

**Limits, not hidden:**
- The visible height is stood in via the same `--vv-*` variables `useVisualViewportBox` sets; no real
  on-screen keyboard (physical device or Simulator keyboard) was driven. The table crop is a static page
  using the real stylesheet, not the live app.
- The container measures the backdrop's content box, so the layout engages at roughly 20-21rem visible,
  not 18rem. At 200% text a 320x568 phone enters the one-page layout even without a keyboard (header and
  actions then scroll with the body instead of staying pinned); reachability still passes.
- Engines without size container queries keep the old pinned layout.
- Sibling lane `sonnet-fn` (`84017f6`, unmerged) built the same idea independently; this lane re-implemented
  it on this lineage and did not merge it. The other recorded sibling items (iPad `data-compact`, page
  dimming seam, route h1s) were not reproduced here and were not touched.
