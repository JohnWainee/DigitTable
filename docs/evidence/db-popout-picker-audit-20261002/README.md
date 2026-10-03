# Mobile pop-out, picker and form audit — 2026-10-02 (branch `sonnet-db/reskin-mobile-20261002`)

Everything here was produced against a **local** Firebase emulator stack (`demo-digitable`, a fake project) and
local builds served by `vite preview`. Nothing was deployed, no real Firebase project was contacted, and no new
art, font or licensed asset was added (the screenshots show the existing original art; its provenance is in
`assets/generated/eat-the-reich/README.md`). Browsers: headless Google Chrome (CDP) and **Mobile Safari in the iOS
Simulator** (iOS 26.5 and 27.0). **No physical iPhone, Android phone, VoiceOver, TalkBack, NVDA or Windows High
Contrast check was performed**; those remain a manual release gate (`docs/evidence/today-qwen/CHECKLIST.md`,
section E2).

## Layout

| Path | What it is |
| --- | --- |
| `before/` | The **unmodified `d6e2c85` build** run through the **final** audit script: representative captures at phone 375×812, tablet 768×1024, desktop 1280×800 and table 1920×1080 (files wider than 1000 px are downscaled), plus the complete `report.json` (154 failures). |
| `after/` | The final build, same states and widths, plus the inline-error captures at phone-small 320×568 and phone, the full-roster and full-party states, the correction sheet with the keyboard emulated, and the complete `report.json` (0 failures). |
| `ios-simulator/` | Real Mobile Safari captures and measurements from `scripts/playtest/ios-simulator/` (iPhone 17 Pro on iOS 26.5, iPhone 17e and iPad mini on iOS 27.0). Landscape JPEGs carry an EXIF orientation tag: open them in a browser or image viewer that honours it. |

## Results

| | `d6e2c85` (before) | final (after) |
| --- | --- | --- |
| Previous audit (size, overflow, 16 px type, axe) | 168 states, 1,488 controls, 0 findings | — (superseded by the stronger audit) |
| **Stronger audit** states / controls audited | 216 / 2,514 | 216 / 2,442 |
| Control findings | **65** | **0** |
| Hard WCAG axe violations; horizontal-overflow states | 0; 0 | 0; 0 |
| Other failures (validation, sheet, keyboard, tight-keyboard) | 89 | 0 |
| **Total failures** | **154** | **0** |
| Text-entry controls proved visible and uncovered with the on-screen keyboard emulated (phone-small, phone, phone-landscape) | 87, all pass | 87, all pass |
| Signed-out forms submitted invalid (4 forms × 2 phone sizes) | 8 scenarios, all fail (native bubbles) | 8, all pass |
| Correction-sheet cases (6 characters; 6 viewports for the first, 3 for the rest) | 21 | 21 |
| Tight-keyboard sheet cases (90, 70 and 60 px visible; with and without a landscape iPhone's safe-area insets; two widths) | **all 12 fail** (no compact mode; field clipped) | all 12 pass |
| `npm run check` | 703 passed, 11 todo | **752 passed, 11 todo** (77 files; +49 tests) |
| `npm run build` | passes | passes (existing chunk-size warning) |
| `npm run test:emulator` | 18 + 86 + 4 | **18 rules + 86 Functions + 4 web** pass |
| iOS Simulator harness (`run.sh`) | **fails**: the field overlaps the action row; no inline errors | passes on iPhone 17 Pro (iOS 26.5), iPhone 17e and iPad mini (iOS 27.0) |

The controls-audited figure varies by a hundred or so between runs because the allocation state depends on the dice roll (a roll with more kept dice has more radio rows); it is not a regression. The before/after pair differ in what they were run against, not in which script ran: both used the final `ui-audit.mjs`.

The only remaining best-practice note is the pre-existing, non-gating `page-has-heading-one` on the intentional
nonexistent-room route. 320 px with 200 % text stays a recorded, non-gating limit (see
`docs/reviews/2026-09-18-sonnet-d-reskin-independent-review.md`).

## What the stronger audit found that the old one could not

The old control check measured each control's box (≥ 44 px, inside the viewport, 16 px type). A control can pass that
and still be broken, so the audit now also checks structure, appearance and context, and has to be seen to fail
(`scripts/playtest/ui-audit-selftest.mjs` feeds each detector a bad and a good synthetic page; the whole audit was
run against `d6e2c85` to show it goes red).

| # | Finding | How the audit saw it | Fix |
| --- | --- | --- | --- |
| P1 | Iryna's "Mark and regain Blood" (and the Cowboy-hat action) were class-less `<button>`s: the browser's grey default button, one **nested inside the checkbox `<label>`** and squeezed to a ~60 × 90 px, four-line sliver at 375 px. The size check passed (the box is over 44 px on both axes). | nested-in-label, class-less button, label squeezed onto ≥ 4 lines (every player state, all viewports) | Sibling `.secondary-action` button in a `.gear-item` wrapper; contract test enforcing "no class-less `<button>` except the +/- steppers" (the old scan only looked at buttons that *had* a class) |
| P2 | All four signed-out forms relied on the **browser's native validation bubble**: unstyled, drawn by the browser, anchored wherever it decides (on a phone often under the keyboard), gone in seconds. | form without `noValidate` + submit-invalid scenarios (no `aria-invalid`, no alert, wrong focus) | `noValidate` + inline, `aria-linked` errors, one alert beside the button, focus on the first invalid field; styled and checked in computed style (3 px riot border) |
| P3 | A closed native `<select>` ellipsises its value; at 320–375 px `The Abandoned Métro Platf…`, and `Threat: Station Patrol A/B` collide. | selected option wider than the control with no visible full-text echo | `SelectedOptionEcho` beneath the scene, edit-target and advance selects |
| P4 | **iOS Safari only.** Landscape with the software keyboard up leaves roughly 70–140 px (estimated from the Simulator screenshots; XCUITest cannot read `visualViewport`). The sheet pinned a header and a footer and let only the body scroll: the title scrolled away, the reason field **overlapped** the actions and the buttons were clipped (`ios-simulator/…-BEFORE.jpg`). Chrome emulation could not produce it. | iOS Simulator XCUITest (field frame overlaps the action row); then Chrome tight-keyboard scenarios (90, 70, 60 px; with and without safe-area insets) | Below 15 rem of visible height the whole sheet scrolls as one page (`data-compact`); the typed-in field stays in view, title and actions are reachable by scrolling |
| P5 | "1 of 1 die still **need** a target" | code read | number agreement, test |
| P6 | Objectives/Threats labels ran into each other in the scene director | screenshot | spacing |
| P7 | The audit only ever visited the *first* roster character: five other compose screens and six correction sheets were never audited. | audit design | `rosterSweep` (five more players claim in roster order; every sheet at three phone sizes) |

## Pop-out inventory (updated; source grep + the audit)

| Pattern | Where | State |
| --- | --- | --- |
| Modal bottom sheet / centred card | `CorrectionDialog` → `SheetDialog` | Visual-viewport sized, safe-area aware, inert background, focus trap, pinned header/footer **or** whole-sheet scroll when compact; 21 audited cases + 2 tight-keyboard; real iOS portrait and landscape |
| Native `<select>` × 6 | `SceneDirector`, `GmToolsPanel` | The OS/browser draws the option list, so it cannot clip (iOS picker captured: `ios-simulator/…native-select-picker.jpg`); closed control is full-width, 48 px, 16 px; long chosen labels echoed in full under three of them |
| `<details>` "Why?" | `ComposeStep2` | In-flow, 48 px summary, never floats |
| Browser **validation bubbles** | the four signed-out forms | **Removed** (replaced by inline errors) |
| Per-die allocation picker, injury picker, stat/item/ability/threat pickers | `AllocationPanel2`, `ChooseInjuryPanel2`, `ComposeStep2`, `PendingActionsPanel` | In-flow radio/checkbox rows (48 px label rows), not pop-outs; audited at six widths for every character |
| Custom menu, popover, tooltip, toast, drawer, `<datalist>`, `<dialog>`, `title=` tooltip, `alert/confirm/prompt` | — | None exist in `apps/web/src` |
| OS overlays (Safari's address pill, the keyboard's accessory bar) | iOS | Not ours. Observed: with the keyboard up the sheet fits the area above it; the strip WebKit marks as obscured, between the sheet and the accessory bar, shows the (inert) page because it lies outside the layout viewport, so no CSS can dim it |

## Reproduce

```bash
# Chrome audit (emulators + an emulator-mode build; see scripts/playtest/ui-audit.mjs header)
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4176 --label run --out /tmp/audit
node scripts/playtest/ui-audit-selftest.mjs            # the detectors themselves, on synthetic pages
# iOS Simulator (real Mobile Safari)
scripts/playtest/ios-simulator/run.sh --base http://127.0.0.1:4176 "iPhone 17 Pro" "iPhone 17e" "iPad mini (A17 Pro)"
```

## Not covered (manual release gate)

Physical iPhone/Android hardware (real keyboards, Dynamic Type, Display Zoom, bottom-bar and gesture-bar
behaviour), VoiceOver, TalkBack, NVDA, Windows High Contrast, Firefox, and any real network. Headless Chrome and
the Simulator emulate touch and keyboards but are not devices. One non-obvious residual: in landscape with the
keyboard up on a phone the sheet is compact, so Apply is reached by scrolling the sheet or by dismissing the
keyboard (its Done restores the pinned actions); that trade-off is deliberate (nothing is clipped) and needs a
physical-device look.
