# Reskin follow-up audit: pop-out, selection and large-text controls (2026-10-01, hourly follow-up)

- **Branch:** `factory/reskin-oct01-hourly-followup`, from reviewed candidate `98bb2db`. **No source change.**
- **Scope:** every select, disclosure, modal sheet, drawer, option list, allocation stepper and action picker at 320/375, landscape phones (812×375, 667×375, 926×428), tablet, desktop and table widths; dynamic visual viewport, safe areas, on-screen keyboard, 150%/200% text, touch targets, reduced motion. The earlier staging report was treated as deployed-baseline evidence only; nothing was deployed or merged.
- **Method:** (1) read the pop-out inventory from source; (2) ran the committed `ui-audit.mjs` and `two-device-smoke.mjs` unchanged on a fresh production build of `98bb2db`; (3) ran an untracked scratch copy of the harness (deleted, not committed) that adds the combinations the committed harness does not cover; (4) focused tests plus the full gate.

## Inventory (source)

Native `<select>`s in `gm2/SceneDirector.tsx` and `gm2/GmToolsPanel.tsx` (the OS owns the option list, so it cannot clip); native `type="number"`/`text` inputs in the same panels, all in normal page flow (none inside the sheet); one inline `<details>` ("Why?") in `ComposeStep2.tsx`; `AllocationStepper` (spinbutton plus tap buttons); radio/checkbox rows; one modal, `SheetDialog` (used by `CorrectionDialog`). The only `position: fixed` element is the sheet backdrop. There is no custom popover, menu, listbox, combobox or drawer.

## Results

| Run | Outcome |
| --- | --- |
| `ui-audit.mjs` (committed harness, build of `98bb2db`) | 150 states, 50 large-text sweeps, 1,482 controls, 0 control issues, 0 overflow states, 0 hard axe violations, 0 failures (`report-full-audit.json`). Only best-practice note: `page-has-heading-one` on the intentional no-such-room route, as before. |
| Extra sheet scenarios, 150%/200% text on 812×375, 667×375, 926×428, 768×1024, 1024×768, 1280×400 | All checks pass: dialog inside viewport, no page overflow, action row and last field reachable. Sheet body 168–614px (`report-extended-text-modal.json`). |
| `two-device-smoke.mjs --reload` | 17/17 steps; no horizontal overflow at 375/768/1024/1280/1920. |
| Focused vitest (`shared`, `styles`, `player2`, `gm2`) | 15 files, 132 tests pass. |
| `npm run check` | exit 0: Prettier, ESLint, `tsc`, 708 passed / 11 todo (73 files passed, 1 skipped). |
| `npm run build` | Functions and web builds pass (existing chunk-size warning only). |

## Observation, not a defect: 150–200% text with the keyboard open in landscape

The prior review listed this combination as unverified, so it was probed (`report-text-plus-keyboard-probe.json`; 55% keyboard in landscape, 45% in portrait):

- At 100% text the committed gate passes (field and label inside the body, both actions visible).
- At 150–200% root text with the keyboard open, the action row is partly or wholly below the visible area and, in landscape (a 169px viewport), a 72–96px field cannot fit a 44–57px body.
- **Both actions stay reachable.** The footer's documented backstop (`max-height: 40%`, `overflow-y: auto`) scrolls them into view (probe check `actionsReachableByFooterScroll` passed in all five cases), Escape closes the sheet, and dismissing the keyboard restores the full layout. The only probe failures are "fully visible without scrolling" checks where the 200%-scaled button is taller than the 40% footer region (e.g. 130px button, 125px footer at 320px wide), which is a size limit by construction.
- No fix was made: shrinking rem-based targets would defeat the text-scaling contract (WCAG 1.4.4), and no reflow, containment, focus or authorization property fails. This is a physical-device item, together with the iOS visual-viewport path the headless harness cannot produce.

## Preserved

Ink-black punk system, contrast tokens, keyboard/touch/reduced-motion behaviour, form semantics, and authorization/privacy/projection isolation: untouched (no engine, template, rules or Functions change).

## Process notes and limits

- The default emulator ports (9099/8080/5001) were held by another session's emulators (a different worktree whose `apps/functions`, `packages`, `templates` and `firestore.rules` are identical to `98bb2db`). The build bakes those ports, so the audit ran against that already-running backend; it was not stopped or modified.
- `npm run test:emulator` was **not** rerun: it needs those same ports and no source changed. Last complete result: 108/108 on `98bb2db`'s lineage (`docs/reviews/2026-10-01-cj-reskin-redteam-review.md`).
- No source changed, so no second-pass code review was required; this document is the independent audit record. Not verified: real iOS/Android keyboards, screen readers, Windows High Contrast, real browser text-size settings.
