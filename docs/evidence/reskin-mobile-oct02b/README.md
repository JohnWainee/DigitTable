# Mobile pop-out / option-list re-audit (2026-10-02)

Branch `worktree-reskin-mobile-session-oct02b`, from `b599abd`. Local only: nothing deployed, no Firebase project touched (emulators use the fake `demo-digitable` project).

## What was audited

Source inventory (`<select`, `<details`, `role=dialog|menu|listbox`, `popover`, `aria-haspopup`, `position: fixed`, every `<button>`, every `<label>` wrapping more than an input) of `apps/web/src` at `b599abd`: the same six native selects, one `<details>`, and one modal (`SheetDialog`) as the 2026-09-18 reskin audit, so that audit's findings for them stand. What had changed since: the roster commit `5e8907b` added the **action pickers' utility-item controls** (ComposeStep2 items list, ChooseInjuryPanel2), which no audit had covered.

## Reproduced defect (real Chrome, real `styles.css`)

`repro-before.html` / `scripts/playtest/measure-layout.mjs`, emulated mobile viewports:

| Width | Before: "Mark and regain Blood" button | After |
| ---: | --- | --- |
| 320 | 61 × 89 px (word-stacked sliver beside the label text) | 242 × 67 px (two lines, below the label) |
| 375 | 61 × 89 px | 256 × 48 px |
| 768 | 142 × 48 px | 256 × 48 px |
| 1280 | 179 × 27 px in the probe's one-line case (in the real flow the text wraps and it measures ~47 px, so the audit's 44 px threshold passes it) | 256 × 48 px |

No horizontal overflow before or after (`docW` equals the viewport at every width). Screenshots: `before-*.jpg`, `after-*.jpg`.

Root causes: (1) the button was a child of the checkbox's `<label>` (invalid: a labelable element inside a label), so the label text and the button competed for one flex row and the button's text also became part of the checkbox's accessible name; (2) neither new button had a class, so both rendered as default grey browser buttons outside the theme's tap/focus/hover rules (see `flow-before-*.jpg` vs `flow-after-*.jpg`, captured from the real create → claim → compose flow). The `reskinContract` scan that was meant to catch this could not: its regex stopped at the `>` of `=>` in `onClick`, and class-less buttons were assumed to be the steppers only.

## Fix

`ComposeStep2`: each item is `div.gear-item` holding the label and, as a sibling, a `secondary-action` button. `ChooseInjuryPanel2`: the hat button is `secondary-action`. `.gear-item` CSS. Handlers, render conditions, disabled/pool-eligibility semantics and keys are unchanged; no engine, contracts, rules, Functions or projection code is touched.

## Regression coverage

- `apps/web/test/player2/ComposeStep2UtilityItem.a11y.test.tsx` (3 tests, with jest-axe): button not inside any label, shared tap class, handler still fires, no checkbox label wraps a button, hat button class. Mutation-verified: against the pre-fix sources the new tests fail.
- `apps/web/test/styles/reskinContract.test.ts`: new scan that fails on any class-less `<button>` outside the two stepper files.

## Gates (this branch)

- `npm run check`: exit 0, 693 passed, 11 todo (baseline 690).
- `npm run build`: passed (existing chunk-size warning).
- `npm run test:emulator`: exit 0, 18 rules + 86 Functions + 4 web.
- `node scripts/playtest/ui-audit.mjs` against a local emulator build (`ui-audit-report.json`): 150 states, 1,542 controls, 0 control issues, 0 overflow states, 0 axe hard violations, 0 failures. One best-practice note (`page-has-heading-one` on the intentional no-such-room route, unchanged). 320 px / 200 % text sheet geometry remains the documented non-gating limit.
- The audit script itself was stale: `openCorrection` looked for a character named "Rook", which the sourcebook roster removed, so the GM step timed out after 108 states on `b599abd` with or without this change. It now corrects whichever character the audit's player claimed.

## Limits (still open, nobody has verified these)

Headless Chrome cannot shrink only the visual viewport, so the iOS Safari on-screen-keyboard path for `SheetDialog` is covered in jsdom only; native `<select>` option popups are drawn by the OS and cannot be screenshotted; no physical device, VoiceOver/TalkBack or Windows High Contrast pass was done. The audit's player (Iryna) does carry the Cigarettes row, so its compose states include the button; but the audit's 44 px threshold did **not** flag the pre-fix button (a 61 px-wide, 3-line sliver on phone passes `min(width,height) >= 43.5`), so the audit alone could not have caught this defect. The audit also has run-to-run dice variation (allocation states had 11 vs 16 controls between runs). The layout probe, real-flow captures and jsdom tests are the regression evidence. **Physical-device gate remains John's.**
