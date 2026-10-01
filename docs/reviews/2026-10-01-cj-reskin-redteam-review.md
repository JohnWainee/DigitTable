# Reskin red-team: mobile pop-out, selection and large-text audit (2026-10-01)

- **Branch:** `sonnet-cj/reskin-redteam-20261001`, from `c718289` (`factory/reskin-ca-integration-20260930` lineage; contains the `ebac344` secret-entry fix).
- **Scope:** every select, disclosure, modal sheet, drawer, option list, allocation/action picker and secret-entry flow at phone (320/375/landscape 667×375, 812×375), tablet, desktop and table widths; dynamic visual viewport, safe areas, on-screen keyboard, 200% text, reduced motion, keyboard and touch; plus the ink-black / punk / distressed visual hierarchy, contrast and original-asset provenance.
- **Method:** the existing `scripts/playtest/ui-audit.mjs` harness first (unchanged baseline), then an untracked scratch probe (not committed) that added what the harness did not measure: 200% text and WCAG 1.4.12 text-spacing on every surface, landscape on-screen-keyboard sheet geometry, 2560/3840/640px widths. Findings were then turned into gating checks in `ui-audit.mjs` and proven to fail on the pre-fix build.

## Baseline (unchanged `c718289` build, existing harness)

150 states, 1,542 controls in this run (the count varies by run, 1,422–1,542 across the earlier passes and this one, with what the session renders), 0 control issues, 0 overflow states, 0 hard axe violations, 0 failures, 14/14 modal scenarios. Same zero-failure result the earlier passes recorded; the pop-out system was not re-litigated.

## Defects found (both real, both reproduced, both fixed)

1. **Marked-use item action overflowed at 200% text** (`ComposeStep2.tsx`). The "Mark and regain Blood" `<button>` was a child of the item's checkbox `<label>`: invalid HTML (interactive content in a label), its text was folded into the checkbox's accessible name, and as a flex item squeezed beside the label text it pushed the page **57px wider than the 320px viewport and 16px wider at 375px** at 200% text (WCAG 1.4.4/1.4.10); at 100% text it wrapped to a four-line sliver. Every earlier pass only checked that the button had a tap-size class. Fix: the button is now a sibling of the label inside a `.gear-item` wrapper, indented under the label text and allowed to wrap (`.gear-item-action`).
2. **Modal sheet body collapsed with the keyboard open on a landscape phone** (`styles.css`, `SheetDialog.tsx`). With a realistic ~55% landscape keyboard the visual viewport is ~170px; the title, action row and padding left the scrolling body **24px tall** (65px at best; measured with the probe, not recorded in the committed reports), less than one 48px field. The old harness reported "field visible" because it measured the field's unclipped rectangle, not the sheet body that clips it. Fix: a `@media (max-height: 28rem)` block compacts header/body/footer chrome and drops scroll-padding; `reveal()` now scrolls the focused field's `.form-field` (label + field) into view when the pair fits the body's usable height (clientHeight minus scroll padding), else the field alone. Measured after (real Chrome, keyboard emulated as a shrunken viewport): body 76px at 812×169 and 667×169 with label 32.2–52.6 and field 58.2–106.2 against body 29.6–105.8 (the field's bottom is 0.4px past the body edge, within the audit's 1px tolerance), and body 100px at 926×193. **What this proves:** the CSS compaction. Chrome's emulation shrinks the layout viewport, so no `visualViewport` resize fires and the browser run does not exercise the new `reveal()` label+field logic; that logic is covered only by the jsdom tests with mocked geometry and still needs a physical iOS pass.

## Harness changes (`scripts/playtest/ui-audit.mjs`)

- The 25 distinct captured states are re-measured at 320px and 375px with 200% root text (50 sweeps; the 150 `states` are those 25 × 6 viewports); overflow or any control problem fails the run (`largeText` in the report).
- The modal scenarios add a 926×428 landscape phone (15 modal records, all passing). The keyboard scenario uses a 55% keyboard for landscape viewports (45% portrait) and gates on **field and label both inside the sheet body**; the keyboard geometry is recorded in the report.
- Proof the new checks bite: against the pre-fix build the new audit fails with 14 findings (12 large-text overflow/outside-viewport findings on the compose, compose-why-open and paused states, and 2 landscape-keyboard sheet findings); against the fixed build it passes (`docs/evidence/cj-reskin-redteam-20261001/`).

## Regression tests (mutation-verified)

- `apps/web/test/player2/ComposeStep2.itemActions.test.tsx`: button is not inside a label, the checkbox name excludes the action text, it is a sibling in the same row, click dispatches the item id. Fails on the pre-fix `ComposeStep2.tsx`.
- `apps/web/test/shared/SheetDialog.test.tsx`: reveals the `.form-field` pair; falls back to the field alone when label + field exceed the usable height (mocked geometry). The first test fails if `reveal()` targets the field only.
- `apps/web/test/styles/reskinContract.test.ts`: `.gear-item-action` wraps (`max-width` 100%-based, `overflow-wrap: anywhere`), `.gear-item` `min-width: 0`; the className-coverage list names `gear-item-action` (a layout-only modifier of `link-button`).

## Checked and found sound (no change)

Evidence tiers: items marked *(source)* come from reading the code, *(harness)* from the committed `ui-audit.mjs` runs, and *(scratch probe)* from the uncommitted probe, which is not reproducible from the committed evidence.

- **Selects** *(source, harness)*: six native `<select>`s; the OS owns the option list (iOS wheel / edge-aware desktop popup), so a popover can never clip; closed control is 48px, 16px type, ellipsised. No custom popover, menu or listbox exists in `apps/web/src`.
- **Disclosure** *(source, harness)*: one inline `<details>` ("Why?"), in flow, 48px summary; expanded at all widths in the audit.
- **Allocation/action pickers:** `AllocationStepper` (+/− buttons ≥48px, spinbutton with Arrow/Home/End), radio/checkbox rows ≥48px; no drag required.
- **Sheet:** portal + `inert` siblings, root scroll lock, `touch-action: auto` (pinch-zoom works with the sheet open: proven by the synthesized pinch scenario), safe-area-aware padding, reduced-motion collapses animation (`0.18s` → `1e-06s`), focus returns to trigger. 14/14 modal scenarios.
- **Secret entry:** the `ebac344` attributes (`autoCapitalize`/`autoCorrect`/`spellCheck`) and recovery normalisation are present; unchanged.
- **Forced colors** block exists for checks/radios/sheet *(source)*. **Text spacing (WCAG 1.4.12)** override at 320/375, and **2560, 3840 and 640px** widths: no clipping, overflow or control problem on any surface *(scratch probe; not committed)*. **Reduced motion:** gated *(harness)*.

## Visual hierarchy and contrast (ink-black / punk / distressed)

Reviewed screenshots at phone/tablet/desktop/table (`docs/evidence/cj-reskin-redteam-20261001/after/`, and the full set under the audit output). The hierarchy reads as intended: near-black ink surfaces; one condensed display face for titles and primary actions; mono stamp labels (cyan) for fieldset legends and metadata; acid-yellow fills reserved for the primary action, riot red for hard offset shadows and danger; grain/halftone texture drawn with CSS/SVG (procedural, no licensed raster; provenance in `assets/generated/eat-the-reich/README.md`). Independently computed contrast on the token palette: paper 13.7–17.3:1, dim 7.2–9.1:1, mute 5.4–6.8:1, acid ≥12.7:1, cyan ≥10.6:1, pink ≥5.1:1, riot 5.0–5.7:1 on ink-0/1/2 (4.47:1 only on `--ink-3`, where it is not used for text); `--rule` (2.1–2.3:1) is used only for decorative container borders and dividers, never as the sole boundary of a control (controls use `--mute`/`--cyan`/`--acid` borders at ≥5.4:1). axe (WCAG 2.x A/AA + best practice) reports zero hard violations; one best-practice note remains (`page-has-heading-one` on the intentional nonexistent-room route). Not fabricated: no new art, fonts or licensed material were added.

## Independent review

A fresh read-only agent reviewed the diff (no browser, no edits): **approve with nits, no P0/P1**. Dispositions:
- P2 reveal fit-test ignored scroll padding → fixed (usable height = clientHeight − scroll padding) and the "field alone" branch now has a test. The measured geometry then showed the padding itself blocked the pair from fitting in the ~76px body, so the compact block also sets `scroll-padding-block: 0`.
- P2 test gap for the fallback branch → added.
- P2 short desktop windows (e.g. 1280×400) now get a flush card; the stale "strip stays visible" comment was updated. Accepted (small, readable, and it keeps the sheet usable).
- P2 `28rem` (the threshold was 26rem at review time) is measured against the browser's initial font size, so a real 200% browser text setting matches the compact block on desktop too (title 1.1rem instead of ~1.9rem, same proportions); accepted. The harness sets root font-size, which media queries ignore, so this branch is physical-browser territory.
- P2 phones taller than the original 416px threshold in landscape (926×428, 932×430) kept the roomy chrome and, by the reviewer's arithmetic, a body too short for label + field. Fixed: threshold raised to 28rem and 926×428 added to the audited viewports (body 100px, label + field inside).
- A second read-only pass over the final delta (reveal padding fix, `scroll-padding-block: 0`, harness geometry gate, new test, these documents) found no P0/P1 and approved with P2 nits; its documentation nits (the 50-sweep wording, the unsupported 926×428 arithmetic, the control-count wording, evidence tiers, and the "inside the body" tolerance) are applied in this file.
- Nits accepted: `--gear-indent` repeats `.gear-option` metrics; `new RegExp(item.name)` in the test; `gear-item-action` in the covered-class set.

## Verification

- `npm run check`: Prettier, ESLint (zero warnings), `tsc`, **708 passed | 11 todo** (73 files passed, 1 skipped; baseline 704).
- `npm run build`: Functions and web builds pass (existing chunk-size warning only).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator`: **108/108** (18 testing, 86 Functions, 4 web).
- After the last change (threshold 26rem → 28rem, 926×428 case added; no other CSS touched) the modal/keyboard audit was rerun on that exact build: **15/15 modal records pass** (`after/report-modal-926x428-rerun.json`). The full 150-state sweep below ran on the build immediately before that one-number change; its states (all ≥ 568px tall) lie outside the changed media query.
- Full browser audit (production live-mode build, local `demo-digitable` emulators, loopback only): **150 states, 50 large-text sweeps, 1,422 controls, 0 control issues, 0 overflow states, 0 hard axe violations, 0 failures**, 14/14 modal scenarios incl. landscape keyboard (`docs/evidence/cj-reskin-redteam-20261001/after/report-final-full-audit.json`).
- `two-device-smoke.mjs --reload` against that build: **17/17** steps.
- `git diff --check`: clean.

## Not verified (remaining physical-device gap)

Real iOS Safari visual-viewport keyboard behaviour (headless Chrome shrinks the layout viewport, so the `--vv-*` path is only proven via pinch-zoom and jsdom), real landscape keyboard heights, Android Chrome and Firefox, screen readers, Windows High Contrast, real browser text-size settings (the harness scales root font-size), 200% text in landscape with the keyboard open (a 96px tap-sized field cannot fit a 170px viewport with chrome; it scrolls), and touch feel. Nothing was deployed or merged.
