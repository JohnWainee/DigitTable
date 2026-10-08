# HM reskin pass: evidence (2026-10-08)

Lane `sonnet-hm`, branch `worktree-digitable-sonnet-hm-reskin-orchestrated-20261008`, fast-forwarded from
`b599abd` onto `sonnet-hl/reskin-integration-20261008` (`041d56c`: HE reskin + HK compact-sheet fix), then
three fixes on top. Presentation only. Unmerged, undeployed.

## Rig

A `/private/tmp` copy of the tree (the worktree lives under `~/Documents`, where builds can hang), `npm ci`,
emulators remapped to 47xxx (peer lanes hold 9099/8080/9000/5001; none were touched), `vite preview` on
47173, a rig-only `.env.local` and a rig-only port edit in `apps/web/src/session/emulatorConfig.ts`. The rig
edits are not in the commit. The unit/format/lint/typecheck gate and the full build were run on pristine
sources (rig edits removed).

## Inventory (no custom pop-out exists)

Six native `<select>`s (`SelectField`: GM scene director and tools), one `<details>` ("Why?"), one modal
(`SheetDialog`: GM correction sheet), text inputs on create/join/recover/table-join/GM tools/director,
checkbox/radio option rows, the allocation stepper (buttons). Native `<select>` popups are OS pickers; they
were audited closed only (see limits).

## Defects found and fixed

| #   | Defect (reproduced before fixing)                                                                                                                                                                                       | Fix                                                                                                  | Evidence                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| 1   | Browser Back with the GM correction sheet open left the director console for `#/create` and destroyed the sheet and the typed reason (real Chrome probe, negative control).                                              | Ported the reviewed `useBackDismiss` hook (218bfea) into `SheetDialog`.                              | `sheet-history-probe.mjs`: before FAIL A (route `#/create`, console gone, 1 hashchange); after PASS A, B, C |
| 2   | In forced-colors (Windows High Contrast) the "Why?" disclosure marker, a clipped solid box, was repainted as Canvas: computed white on a white surface, so the open/closed indicator was nearly invisible.             | `summary::before { forced-color-adjust: none; background: CanvasText }` inside the forced-colors block. | `forced-colors-probe.mjs`; `forced-colors-before.png` / `forced-colors-after.png` here |
| 3   | Passphrase, recovery code, room/table code and GM item/member ids had no `autoCorrect`/`spellCheck`/`autoCapitalize="none"`, so mobile keyboards could silently alter a correctly typed secret.                          | `shared/textEntry.ts` attribute sets spread on those inputs; free-text names/reasons keep defaults.  | `test/shared/textEntryHints.test.tsx` (4 tests, mutation-checked)     |
| 4   | At 320 px and 200% text the console behind the sheet overflowed by 4 px (`modal-text-200-phone-small`: `dialogInsideViewport` and `noPageOverflow` recorded as "not gating" by earlier lanes).                           | `.gear-option, .form-field--checkbox { min-width: 0; overflow-wrap: anywhere }`.                      | `before/` vs `after/gm-correction-text-200-phone-small.jpg`; audit logs: the two INFO lines disappear |

Screenshots: `before/` and `after/` hold five key states at phone (375x812), tablet (768x1024), desktop
(1280x800) and table (1920x1080) plus the 320 px / 200% text sheet. Full sets (176 images each) were
captured to `/private/tmp/hm8-before` and `/private/tmp/hm8-after` and are not committed. The two
`ui-audit-report.json` files are the complete machine reports.

## Results

- `ui-audit.mjs` (150 states x 6 viewports, every control >= 44 px and >= 16 px text-entry, axe A/AA +
  best-practice including colour contrast, sheet at keyboard/safe-area/pinch-zoom/200% text/reduced motion):
  before 150 states, 1,422 controls, 0 failures (2 recorded non-gating items); after 150 states, 1,518 controls,
  0 control issues, 0 overflow states, 0 hard axe violations, 0 failures, 0 non-gating items. The single
  best-practice item (`page-has-heading-one` on the intentional nonexistent-room route) is unchanged.
- `two-device-smoke.mjs --reload`: ALL STEPS PASSED (17).
- `npm run check`: before 699 tests; after 712 tests (74 files, 1 skipped, 11 todo), exit 0.
- `npm run build`: exit 0. Emulator suites (remapped ports): 18 + 86 + 4 passed.
