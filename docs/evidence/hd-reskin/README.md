# hd reskin lane (2026-10-07) — evidence and pop-out inventory

Branch `sonnet-hd/reskin-orchestrated-20261007`. Screenshots are real-Chrome captures from
`scripts/playtest/ui-audit.mjs` against the local emulators (live-mode build, `demo-digitable`), at the audit's
phone (375×812), tablet (768×1024), desktop (1280×800) and table (1920×1080) viewports. `before/` is the
integrated baseline (`456f3ec`); `after/` is `8d31c11`. Full reports: `reports/ui-audit-{before,after}.json`.

## What this lane did

- Integrated the newest reviewed reskin lineage (`origin/codex/staging-playthrough-20261007`: fq reskin,
  Back-dismiss sheets, option rows) and the cx 320px/200% gutter cap (`319a05a`). `5663d7f` (cx utility-item
  tap target) and the rest of cx's mobile-entry commits were intentionally not taken: fq rewrote the same option
  rows and text-entry hints, and applying them produced conflicts or duplicate JSX props.
- Fixed a typecheck break the integration left in `reskinContract.test.ts` (it lost its `uiAudit` read).
- Recovery codes are trimmed and upper-cased at submit (`JoinScreen.tsx`), with a regression test.
- Visual pass: the page wash is cut to ≤0.2 alpha (blacker), and a non-empty GM review queue gets a riot slab
  and pink-stamped cards (`.step.needs-attention`) so pending work outranks every other console panel.

## Pop-out inventory (every select, menu, disclosure, modal, drawer, option list)

| Control | Where | Behaviour | Evidence |
| --- | --- | --- | --- |
| 6 native `<select>` | `SceneDirector` ×2, `GmToolsPanel` ×4 | Browser/OS owns the option list (full-width picker on touch). `SelectedEcho` shows the full selected text because a closed select cannot wrap. 16px type, ≥44px tall. | `controlIssues: 0` over 1,434 controls |
| 1 modal `SheetDialog` | `CorrectionDialog` (GM correction) | Visual-viewport bottom sheet: internal scroll, safe-area aware, inert background, focus trap, Escape and Back dismiss, scroll lock, text-field reveal with its label. | 17 modal scenarios all pass (320×568, 375×812, landscape 812×375 and 667×375, tablet, desktop, keyboard open, 140px and 160px visible heights, safe-area insets, pinch-zoom, 200% text, reduced motion) |
| 1 `<details>` | `ComposeStep2` "Why?" pool explanation | Native disclosure, in-flow (not a floating popover). | axe clean |
| Radio/checkbox option rows | `ComposeStep2`, `AllocationPanel2`, `ChooseInjuryPanel2`, `PendingActionsPanel` | In-flow `.gear-option` rows, whole row is the target, ≥44px. | `ComposeOptionRows.a11y.test.tsx` |
| Allocation steppers | `AllocationStepper` | `role="spinbutton"` with tap +/− buttons; never opens the on-screen keyboard. | `AllocationStepper.test.tsx` |

No anchored popover, menu, listbox, drawer or `<dialog>` exists in `apps/web/src` (grep for `role="menu"`,
`role="listbox"`, `aria-haspopup`, `popover`, `<dialog`, `<datalist`: no matches), so no further conversion
to bottom sheets is needed.

## Known limits

- The iOS-Safari case (visual viewport shrinks while the layout viewport does not) cannot be produced in
  headless Chrome; it is covered in jsdom and by the pinch-zoom scenarios. Physical-device evidence stays open
  for John.
- Native `<select>` option lists on desktop Chrome are drawn by the browser and cannot be restyled.
