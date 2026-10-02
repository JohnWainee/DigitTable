# Mobile entry and audit evidence — 2026-10-02

This isolated candidate was checked against a local `demo-digitable` Firebase emulator stack only. Nothing was deployed.

- `before/` holds representative signed-out join-form captures from the unmodified `origin/main` baseline at phone (375x812), tablet (768x1024), desktop (1280x800), and table (1920x1080) widths.
- `after/` holds the corresponding captures from the candidate plus recovery-form captures at those four widths.
- `after/report.json` is the final real-browser report: 168 states, 1,548 controls, zero control findings, zero horizontal-overflow states, and zero hard WCAG axe violations. Its only note is the existing non-gating `page-has-heading-one` best-practice warning on the intentional nonexistent-room route.

The full raw captures remain at `/private/tmp/digitable-cz-audit-before` and `/private/tmp/digitable-cz-final-audit` for this workspace session.
