# ia reskin increment evidence (2026-10-09)

Branch `sonnet/ia-reskin-orchestrated-20261009`, base `554c622` (fq reskin + hq/hu pop-out hardening). Local Firebase emulators on remapped ports (`demo-ia`, a peer lane held the defaults) and `vite preview` builds of the base (`before/`) and this change (`after/`). **Nothing was deployed; no staging playthrough was run.** Everything here is from this undeployed branch against local emulators; the last deployed evidence is the 2026-09-19 staging smoke recorded in `CLAUDE_HANDOFF.md` (commit `5e8907b`) and does not include this work.

## Method
A fresh inventory of every pop-out surface in `apps/web/src`: one modal sheet (`SheetDialog`, the GM correction), six native `<select>`s (OS picker, no custom popover), one `<details>` ("Why?"), and the allocation/option rows. No other menu, popover, tooltip, listbox or datalist exists. The existing audit already measured geometry (viewport containment, keyboard, safe areas, zoom, 200% text, selects); it did **not** check *word integrity*. A new gating probe (`WORD_BREAK_PROBE` in `scripts/playtest/ui-audit.mjs`) walks every character of every visible button/link/label/legend/summary/h1-h3/option with `Range` rects and fails when one word's letters sit on different lines. It runs in every per-state sweep (150 states x 6 viewports) and in four modal scenarios (320, 375, 768, 320 @150% text).

## Defects found (all presentation-only) and fixed
1. **Sheet "Apply correction" split mid-word** ("APPLY CORRECTIO / N") on a 375 px phone: the Apply/Cancel pair used 9rem minimum columns, which fit two columns but not the label. Columns are now `minmax(min(100%, 13rem), 1fr)`: the pair stacks full width on phones, two columns on tablet/desktop.
2. **GM "Reveal" button split** ("REVE / AL") on the console at 320/375 px: the hidden-threat row is a flex row whose button shrank. The row now wraps and the button keeps its natural width (`.gear-option:has(> button)`).
3. **"Reinforcements mode" legend and "Switch to simplified" button split mid-word at 150% text on a 320 px phone.** Button inline padding, legend padding and legend tracking are now `min(<old>, <vw>)`, each equal to the old value at 320 px / 100% text.

## Results
| Check | Base build (new probe) | This change |
| --- | --- | --- |
| `ui-audit.mjs` word probe | 4 failures: sheet label @375, sheet legend + button @320/150%, Reveal @320 and @375 | 0 |
| `ui-audit.mjs` (full, 150 states, 6 viewports + modal + selects) | n/a | 150 states, 1,566 controls, 0 control issues, 0 overflow states, 0 axe hard violations, **UI AUDIT PASSED** |
| `npm run check` | | format, lint, typecheck, 719 passed / 11 todo |
| `npm run build` | | passed |
| `two-device-smoke.mjs --reload` (local emulators) | | all steps passed |
| `test:emulator` (remapped ports, project `demo-digitable`, a copy of the tree) | | 18 + 86 + 4 passed |

Only axe best-practice note: `page-has-heading-one` on the intentional nonexistent-room route (pre-existing, non-gating).

## Screenshots
`before/` and `after/` pair the GM correction sheet and the GM console (with a hidden threat) at 320, 375, 768, 1280 and 1920, plus the table display after a roll at 375/768/1280/1920. Reports: `reports/` (`ui-audit-base-with-new-probe.json` is the base build run with `--no-shots`).

## Limits
Headless Chrome only; no physical iOS/Android keyboard or native picker, screen reader or Windows High Contrast pass. The visual language (ink, punk palette, grain, hazard tape) is unchanged from fq/hq/hu; this increment is the word-integrity defect class and its gate.
