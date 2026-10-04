# Fresh reskin audit and option-row cascade guard, lane `sonnet-eo` (2026-10-04)

Base: `29444c3` (the unmerged `sonnet-em` option-row fix). **Source change: none** under `apps/web/src`. The only code change is a
unit-test guard in `apps/web/test/styles/reskinContract.test.ts`. Not merged, not deployed; no Firebase project, cloud resource, secret,
authorization, projection, engine or template change. Staging was not contacted and **this does not validate staging with the current
code** (no changed build may be deployed).

## What changed

An independent review of `29444c3` found one minor gap: the cascade allow-list pinned only `padding`/`margin` on fieldsets and option
rows, so a later rule or an `@media (max-width: …)` block setting `flex-wrap: nowrap` (or changing `flex`, `display`, `min-width`,
`overflow-wrap`) on `.gear-option`, `.form-field--checkbox`, `.option-text`, `.gear-item` or a fieldset would put the 320px/200%-text
word breaks back and pass the suite. Added `optionRowLayoutRules()` (a depth-aware scan that records the enclosing at-rule) and two
tests: an exact allow-list of every layout declaration on those boxes (plus "no `nowrap`/`pre`/`break-all`"), and a synthetic
stylesheet proving the scan sees a nested `@media` rule, a later equal-specificity rule and `flex-flow: row nowrap`.
Mutation check: appending `@media (max-width: 400px) { .gear-option { flex-wrap: nowrap; } }` to the real stylesheet fails both tests
(`@media (max-width: 400px) :: .gear-option -> flex-wrap:nowrap`); reverted.

## Verification (this lane's own runs, isolated ports 53xxx/52xxx; the `em` lane's default-port emulators were not touched)

| Check | Result |
| --- | --- |
| `npm run check` (`check.log`) | prettier, eslint (0 errors, 1 pre-existing warning), typecheck, **854 passed**, 11 todo, 1 file skipped |
| `npm run build` (`build.log`) | passed (known chunk-size warning) |
| Real-browser `ui-audit.mjs` on the `29444c3` source bundle (`ui-audit-base.log`, `ui-audit-base-report.json`) | 288 states, 3,336 controls, **0 failures**; 0 control/overflow/hard-axe/contrast failures; 87 keyboard-focus, 385 dock-focus, 4 pinch, 8 validation, 23 sheet cases; one non-blocking axe best-practice note on the intentional nonexistent-room route; 5 contrast pages use truncated samples |
| `two-device-smoke.mjs --reload` (`smoke.log`) | ALL STEPS PASSED (17), incl. no horizontal overflow at 375/768/1024/1280/1920 |
| Emulator suites, APFS clone with every port remapped to 52xxx (`emulator-suite.log`) | 18 rules + 86 Functions + 4 web passed, exit 0 |

The audit and smoke ran on a bundle built from the unchanged `apps/web/src`, so they also describe this tip (only a test file differs).
The audit covers native selects, details, SheetDialog, dock, allocation/action pickers, keyboard/short-visual-viewport, safe-area,
pinch and 150/200% text at 320/375/390/412 phone, landscape, 768 tablet, 1280 desktop and 1920 table.

## Screenshots

`shots/` (after, this bundle): compose at phone/tablet/desktop/table, compose at 200% text on a 320px phone, GM pending-actions at
phone/tablet/desktop/table, allocation at phone/desktop/table. Before (base `92c2b6e`) captures of the same states are
`../em-option-rows-20261004/shots/before/`; the source is unchanged since `29444c3`, so after-here equals after-there.

## Not covered (unchanged residuals)

Physical iOS/Android, VoiceOver/TalkBack, Windows High Contrast, real browser-chrome collapse, a native `<select>` popup (OS-owned),
a real TV, Firefox; a word wider than a whole row at 250-300% text on 320-375px still breaks inside the row (contained, non-overflowing).
