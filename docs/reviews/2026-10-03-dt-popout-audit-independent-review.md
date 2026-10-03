# Independent review: pop-out and visual-viewport audit, lane `sonnet-dt` (2026-10-03)

- **Scope:** `sonnet-dt/reskin-hourly-20261003` on `47bc087`. No source change; the claim under review is "no new in-scope defect".
- **Reviewer:** one fresh read-only subagent (not the author). Method: source and log read-through only. It ran no browser, jsdom probe, check, build or emulator suite, and started no servers.
- **Verdict:** could not disprove "no defect"; no findings.

Verified by reading: viewport meta has no `maximum-scale`/`user-scalable`, no `touch-action: none`; the only pop-outs are native `<select>` (with full-text echo), the single `SheetDialog` and the `ActionDock`; no datalist, date/time inputs, `title` tooltips, toasts, menus or autocomplete lists; only fixed elements are the sheet backdrop and the inert `body::before`; z-index dock 10 / sheet 100 with the page inert under the sheet; every `100vh`/`100vw` is a fallback inside `var(--vv-*)` with `dvh` overrides; safe-area insets, 16px inputs, reduced-motion handling present. Dock panels contain only radios/checkboxes/steppers, so the dock never meets an on-screen keyboard. Evidence logs in `docs/evidence/dt-audit-20261003/` are mutually consistent.

Not verified by the reviewer (author-run gates only): `npm run check`, build, emulator suites, real iOS Safari behaviour, the sheet's mount-time `inert` snapshot against a late `<body>` child (documented as not occurring; one `SheetDialog` consumer).
