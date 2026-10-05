# Independent review: pop-out and mobile-control audit, lane `sonnet-et` (2026-10-05)

- **Scope:** `5ef9c2b` plus evidence-only commit under `docs/evidence/et-reskin-audit-20261005/`. Claim: no new real defect; no source change.
- **Reviewer:** one fresh read-only subagent (not the author). It read `SheetDialog.tsx`, `useVisualViewportBox.ts`, the sheet/select/details/safe-area/reduced-motion CSS and the "Why?" details in `ComposeStep2.tsx`. It did **not** read `ActionDock.tsx`, option rows, allocation pickers, the screenshots or the reports; those rest on the author-run Chrome audit (288 states / 3,464 controls / 0 failures), the real-Safari Simulator run and earlier reviews (`em`, `eo`, `dq`, `dt`).
- **Verdict:** could not disprove "no defect"; no findings.
- **Residual notes (theoretical, no failing scenario, no change made):** focus restore is a no-op if the trigger unmounts while the sheet is open; the inert set is a mount-time snapshot (documented in code); Escape with a desktop native select popup open is browser-dependent.
