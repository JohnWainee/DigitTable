# fo: option rows that carry their own action (2026-10-06)

Lane `sonnet-fo`, base `6f5896e` (verified integration lineage). Raw `report.json` files stay
untracked (ephemeral room codes); this is the redacted summary. Presentation only: no engine,
contracts, template, authorization, projection, Firebase, asset or dependency change.

## Defects (reproduced on `6f5896e`, real Chrome against the emulators)

1. **GM "Reveal" split mid-word at default text.** Beside a hidden threat the button is a flex item
   that could shrink below its own word: `REVE` / `AL` at 100% text on a 375px and a 320px phone,
   and at 150% text on a 1280px desktop (`before/row-gm-console-*`).
2. **Player "Mark and regain Blood" squeezed to a sliver and nested in a label.** On a 375px phone
   at 100% text the button was 48px wide and 99px tall (four stacked words). At 200% text on a
   phone the button sat outside the viewport (`x=367` of 320; page overflow 143px at 320px, 88px at
   375px). It also lived inside the item's checkbox `<label>`: invalid markup (a button is a
   labelable element) and the checkbox's accessible name swallowed the button text.

The existing audit passed all of this (150 states, 0 failures): it has no split-word check, its
geometry checks only measure control boxes and whole-page overflow at 100% text, and it never
looked at the option rows' accessible names or nesting.

## Fix

- `ComposeStep2.tsx`: the action is a sibling of the checkbox label inside a
  `.gear-option.gear-option--row` wrapper. Handlers, `disabled`, `checked` and payloads are
  untouched.
- `styles.css`: rows that hold a button wrap; the button never shrinks below its content
  (`flex: 0 0 auto; max-width: 100%`); the item action takes its own line under the label; the
  label carries the row's padding (the whole 48px row stays the checkbox's tap target, no taller
  than before), keeps the box and text together, inherits the row's type and muted colour (not the
  global mono `label` style), and carries the `not-allowed` cursor itself, not the row.

## Evidence

- `before/` and `after/`: row crops at phone-small (320), phone (375), tablet (768), desktop (1280)
  and table (1920) widths at 100% and 200% root text, for the player item row and the GM Reveal
  row; whole-page player compose at phone and table widths; `probe-summary.json` per side
  (geometry, broken words, nested-label flag, overflow with and without the rows).
- `apps/web/test/player2/ComposeOptionRows.a11y.test.tsx` (6 tests) and two new
  `reskinContract.test.ts` tests. Mutation check: with `ComposeStep2.tsx` and `styles.css` reverted
  to `6f5896e`, **4 fail** (2 structure, 2 stylesheet); with the fix, 0.
- `scripts/playtest/ui-audit.mjs` new `auditOptionRows()` (player compose after the claim; GM
  console after the scene advance, where the hidden threat row appears), 5 viewports x 100/150/200%
  text = 30 cases. Gates: at least one row on screen, action not in a label, checkbox name excludes
  the action, no word split across lines, action and row inside the viewport, action >= 43.5px
  tall. Negative control against the `6f5896e` build: **41 failures** (all `option-rows/*`). Fixed
  build: **0 failures**, 150 states, 1,482 controls, 0 control issues, 0 overflow states, 0 hard
  axe violations (the control total varies run to run with the number of allocation dice rolled).
- `npm run check`: **710 tests passed** (11 todo; +8). `npm run build`: passed (existing chunk
  advisory). `npm run test:emulator` (`demo-digitable`): **18 + 86 + 4 passed**.

## Not fixed / not covered

- At 200% text on a 320-375px phone the column (about 130-185 CSS px) is narrower than the word
  `REVEAL` at the button's display size, so it still splits there (recorded as informational by the
  audit, not gating). The 320px / 200% player page keeps 47px of page overflow that exists with
  the option rows hidden: the stacked rem gutters, a separate pre-existing issue.
- No real iOS Safari / physical-device pass; headless Chrome only.
