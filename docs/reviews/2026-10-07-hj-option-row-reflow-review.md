# hj option-row reflow fix: audit and independent review

- **Date:** 2026-10-07
- **Base:** `354e7c9` (branch `sonnet-hj/reskin-orchestrated-20261007`)
- **Author:** Sonnet hj session. **Independent reviewer:** a separate fresh read-only subagent (static inspection plus jsdom style tests only; no browser).
- **Verdict:** approve with non-blocking notes. No blocking findings.

## Audit

A fresh `ui-audit.mjs` of the unchanged candidate passed (150 states, 1,422 controls, 0 hard failures), but it
carried the fu-recorded non-gating limit: 320 px at 200% text. The audit only measured that state with the
correction sheet open (inert, scroll-locked), which hid real behaviour. A new closed-sheet measurement showed:

1. The GM console scrolled sideways 5 px with the sheet closed (`closedPageNoOverflow` false).
2. Nested rem padding (shell, panel, card, fieldset, option row) left a ~65 px column, so the "Engaged threats"
   legend broke letter by letter and option rows were unusable.

Pop-out inventory is unchanged from the fu review (one modal sheet, native selects, one in-flow disclosure); the
sheet stays within the visual viewport in every scenario, before and after.

## Root causes and change

- Option-row label text was a bare text node (an anonymous flex item), unreachable by
  `.gear-option > span { min-width: 0; overflow-wrap: anywhere }`, so it never shrank. All 14 option rows
  (`PendingActionsPanel`, `CorrectionDialog`, `CreateSessionScreen`, `ComposeStep2`, `AllocationPanel2`,
  `ChooseInjuryPanel2`) now wrap their text in `<span>`; accessible names are unchanged.
- `--pad-unit: min(1rem, 5vw)` (exactly 1rem at default text on any phone >= 320 px) now drives the horizontal
  padding of shells, panels, cards, fieldsets and option rows, so large text yields instead of stacking ~250 px.
  Safe-area floors on the shells are kept.

## Tests and evidence

- New `apps/web/test/styles/optionRowText.test.ts` (fails on the old markup, verified by reverting one file) and a
  `reskinContract` case pinning `--pad-unit` and its multipliers.
- `ui-audit.mjs`: closed-sheet overflow is a gating check; 320 px / 200% is now gating.
- Before/after: `docs/evidence/hj-reskin/{before,after}/` (phone-small, phone, tablet, desktop, table for the GM
  pending console, player compose and allocation, plus 150/200% text shots and both `report.json`s). Before:
  `closedPageNoOverflow` false, 5 px; after: all text-scale checks pass.

## Reviewer notes (non-blocking)

1. Row regex would miss a label with `>` in a template-literal className or one using only `form-field--checkbox`
   (no such TSX label exists today). Accepted.
2. The test pins markup shape; shrinking is proven only by the browser audit. Accepted.
3. Multipliers were not asserted: fixed in this change.
4. Other plain-rem paddings (`.sheet-body`, a few panels) were not measured as narrow columns; the audit found none
   overflowing. Backlog if a browser audit ever shows one.
5. Dead `informationalChecks` slot in the audit loop: left; harmless.

## Not verified

Real iOS Safari/Android keyboard, screen reader, Windows High Contrast, physical device, scrollbar-bearing
desktop at 5vw, and a staging playthrough of this build. The single remaining legibility wart: at 320 px / 200%
long words ("Station") and the H1 ("DIRECT/OR CONSO/LE") still break mid-word (`overflow-wrap: anywhere`); it no
longer overflows. Backlog.
