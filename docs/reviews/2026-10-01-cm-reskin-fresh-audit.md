# Fresh reskin UI/UX and mobile pop-out audit (2026-10-01, read-only)

- **Branch:** `sonnet-cm/reskin-fresh-20261001` at `edbb2f8` (contains `98bb2db`, the cj item-action and landscape-keyboard fixes; verified present in the tree, not just in the handoff).
- **Outcome:** **no reproducible P0/P1 defect; no source change made.** Nothing was deployed, merged or provisioned. Only the loopback `demo-digitable` emulators were used.
- **Scope read first:** `AGENTS.md`, `CLAUDE_HANDOFF.md`, and the reskin reviews from `2026-09-18-sonnet-d` through `2026-10-01-cj`. Findings there are treated as settled; this pass re-measured rather than re-litigated.

## Pop-out inventory (source)

`rg` over `apps/web/src` finds exactly: six native `<select>`s (`SceneDirector` x2, `GmToolsPanel` x4), one `<details>` ("Why?", `ComposeStep2`), one modal (`SheetDialog`, used only by `CorrectionDialog`), and the `AllocationStepper` spinbutton, which is **not imported by any shipped component** (only by its own tests; the player allocation UI and the correction sheet use plain buttons and radios/checkboxes). There is no custom popover, menu, listbox, combobox, tooltip, `aria-haspopup`, `aria-expanded`, `title=`-only hint, or hover-only control. The OS owns every option list, so no option list can clip.

## Evidence (this run, production emulator-mode build, headless Chrome, `ui-audit.mjs` unchanged)

| Run | Result |
| --- | --- |
| Committed harness, 6 viewports x 25 states, 200% text at 320/375, 14+ modal scenarios | 150 states, 50 large-text sweeps, 1,470 controls, **0 control issues, 0 overflow, 0 hard axe, 0 failures**; one best-practice note (`page-has-heading-one` on the intentional no-such-room route) |
| Same harness with the 200%-text sweep re-aimed (untracked scratch copy, deleted) at 812x375, 667x375, 568x320 landscape and 768x1024 | 100 sweeps, 1,422 controls, **0 issues, 0 overflow, 0 failures** |
| `npm run check` | format, lint, typecheck clean; **708 passed, 11 todo** (73 files, 1 skipped) |

An independent read-only source review of the inventory, boundary diff and observations confirmed them (it did not re-run the browser numbers) and found the unmounted-component omission fixed above. Both reports were written under the job's scratch directory and are not committed. The harness is the committed `scripts/playtest/ui-audit.mjs`; rerun it with the emulator-mode build to reproduce.

## Boundaries

`git diff 5e8907b..HEAD` touches nothing under `packages/`, `templates/`, `apps/functions/`, `firestore.rules` or `database.rules.json`: the reskin since the roster commit is presentation only, so projection and hidden-input isolation are unchanged and remain covered by the existing property tests. The correction sheet is rendered only on the GM surface.

## Observations (all P2/P3, source-read, not reproduced in a browser, none fixed)

1. **Stepper `max` (unmounted component; latent only) can drop below `value`** (`AllocationStepper`): `aria-valuenow` may exceed `aria-valuemax` if the budget shrinks after a value is set, and `aria-valuetext` quotes `maxUses`, not `max`. Cosmetic for assistive tech; the buttons clamp correctly.
2. **Disabled-button focus loss:** the correction sheet's item-use `−`/`+` buttons (and the unmounted `AllocationStepper`'s) disable at the bounds, so a keyboard user stepping to 0 or max loses focus to `body`. In the sheet the Tab trap recovers it (focus goes to the first control); outside the sheet it is not recovered. Not reproduced.
3. **Escape closes the correction sheet with unsaved edits and no confirmation.** Deliberate per the sheet contract; a dirty-state guard would be a UX improvement, not a defect.
4. **Background live regions are `inert` while the sheet is open** (the connection-status strip is behind it), so a connection change is not announced until the sheet closes. Acceptable for a short GM-only modal.
5. **Blood-change display** can read `+5` while the clamped result changes by less (the adjacent "Blood a -> b" status states the true result).

## Not verified (unchanged physical-device gap)

Real iOS Safari visual-viewport and keyboard behaviour (headless Chrome shrinks the layout viewport, so the `--vv-*` path is covered only by pinch-zoom scenarios and jsdom), Android Chrome/Firefox, screen readers, Windows High Contrast, real browser text-size settings (the harness scales root `font-size`; media queries such as `max-height: 28rem` use the UA default), touch feel, and 200% text in landscape with the keyboard open. The harness cannot reach these; they remain John's two-device rehearsal.
