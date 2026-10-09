# ib reskin increment evidence (2026-10-09)

Branch `sonnet/ib-reskin-orchestrated-20261009`, base `6cf8647`. Local Firebase emulators on remapped ports (`demo-ib`, ports 29099/28080/29000/25001; peers held the defaults) and static builds of the base (`before`) and this change (`after`). **Nothing deployed; no staging playthrough.**

## Inventory (what was already covered)
Sheet, six native selects, one `<details>`, option rows, word integrity, 200% text, keyboard, safe areas, zoom, reduced motion: all gated by hq/hu/ia. Not covered: **focus survival when a stepper reaches its bound.**

## Defect found and fixed (presentation only)
In the GM correction sheet, item-uses `-`/`+` buttons disable themselves at 0 / max. Activating the button that reaches the bound disabled the focused control, so Chrome moved focus to `<body>`: keyboard and screen-reader users were dropped out of the sheet (outside its focus trap) mid-adjustment (WCAG 2.4.3). Reproduced in real Chrome on the base build at phone, tablet, desktop and table widths (`before/`). Fix: `UsesStepper` in `CorrectionDialog.tsx` hands focus to the opposite button in a layout effect once the new value has rendered (so it is enabled even for one-use items); the shared `AllocationStepper` (not currently mounted in the app) hands focus to its always-enabled spinbutton.

## Results
| Check | Base | This change |
| --- | --- | --- |
| `ui-audit.mjs` new `stepper-focus-*` scenarios (phone/tablet/desktop/table) | 4 failures (`focus on BODY`) | pass |
| `ui-audit.mjs` full (150 states, 6 viewports, modal, selects, word probe) | n/a | 1,434 controls, 0 control issues, 0 overflow states, 0 axe hard violations, PASSED (only the pre-existing `page-has-heading-one` best-practice note on the nonexistent-room route) |
| new unit tests (`CorrectionDialogFocus`, `AllocationStepper`) | 3 fail (verified by reverting the source) | pass |
| `npm run check` | | 725 passed / 11 todo |
| `npm run build` | | passed |
| `two-device-smoke.mjs --reload` (local emulators) | | all steps passed |
| `firebase emulators:exec` suites (`--config` remapped ports, `demo-ib`) | | 18 + 86 + 4 passed |

Screenshots: `before/` vs `after/gm-stepper-focus-{phone,tablet,desktop,table}.jpg` (sheet after the last tap; after shows a focus ring on the enabled `+`), plus `after/` sheet/keyboard/safe-area/short-viewport/text-scale shots and table display at phone/tablet/desktop/table widths. Reports in `reports/`.

## Limits
Headless Chrome only. Real iOS/Android keyboard and native pickers, VoiceOver/TalkBack announcement of the hand-off, Windows High Contrast and a physical-device pass remain open. One accidental smoke run hit a peer lane's default-port stack (a throwaway room; no repo effect).
