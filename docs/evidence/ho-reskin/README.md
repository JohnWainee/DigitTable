# ho reskin audit evidence (2026-10-08)

Branch `sonnet/ho-reskin-orchestrated-20261008`, starting from the reviewed-but-unmerged fq candidate `187bf4c`.
Everything ran against **local** Firebase emulators (`demo-digitable`, remapped to ports 62xxx/63xxx because
peer lanes hold the defaults) and local `vite preview` builds of the pre-change (`187bf4c`) and changed trees.
**Nothing was deployed.** Presentation only: no engine, contracts, template, Functions, rules, projection or
authorization file changed.

- `before/`, `after/` — same states at the four form factors: `phone` 375x812, `tablet` 768x1024,
  `desktop` 1280x800, `table` 1920x1080 (downscaled to <= 720 px). Also the correction sheet (phone, tablet,
  desktop, emulated keyboard) and `text200-320px-*` frames: 320 px wide at 200% text, top 1,700 px.
- `reports/` — machine-readable output. `ui-audit-before.json` / `ui-audit-after-final-gating.json` (150 states x
  6 viewports, 17 pop-out scenarios), `text-scale-*.json` (the new 100/150/200% sweep, display font and
  system-sans fallback, before and after), `ui-audit-after-forced-colors.json`, `layout-diff.txt`.
- `ios-simulator/before|after/` — real Mobile Safari in the iOS 26.5 Simulator (iPhone 17 Pro): correction
  sheet with the software keyboard (portrait and landscape), the native `<select>` picker, Back closing only the
  sheet, and the signed-out form with the keyboard up. Logs record every measured frame against the keyboard.
- `forced-colors/` — three frames of the emulated `forced-colors: active` run.

## What the fresh audit found (genuine defects, all in `apps/web/src/styles.css` / `gm2/SceneDirector.tsx`)

The pop-outs themselves held up: the one modal (`SheetDialog`), the six native selects, the in-flow "Why?"
disclosure and the radio/checkbox option and allocation rows all stayed inside the visual viewport and safe
areas, internally scrolled, had >= 44 px targets and no horizontal overflow at every width, with the keyboard
emulated, under pinch-zoom, and in real Mobile Safari. The new **whole-page text-scale + mid-word sweep**
(100 / 150 / 200% root text on 320 and 375 px, every state, sheet closed) found what the 100%-text audits could not:

| Defect | Evidence before | Fix |
| --- | --- | --- |
| The GM **Reveal** button split mid-word (REV/EAL) **at default text size**, 375 and 320 px: a 3rem `min-width` floor let flex squeeze it, and the inherited `overflow-wrap: break-word` split it | `text-scale-before-*.json` rows at scale 100 | `.primary-action, .secondary-action { min-width: min-content }`; label+button rows (`.gear-option--action`) wrap the button under the text |
| Five nested rem gutters (screen > panel > fieldset > option row > check box + gap) compounded under larger text: ~35 px text column at 200%/320 px, words broken mid-way (`Correct`, `Claim`, `uses`, ...) and up to 47 px horizontal overflow (player compose, paused, allocation; GM console pending) | 56 findings with the display font, 76 with the system-sans fallback | `--gx: min(1rem, 5vw)` (exactly 1rem at default size on any phone >= 320 px) for every horizontal gutter in the chain and the sheet; check/radio box capped at 34 px |
| Display type grew with the text setting past a phone column (`h1` floor 83 px at 200%; button labels, legends) | same | `vw` caps on h1/h2/sheet h2/button/legend sizes |
| The known 320 px / 200% closed-sheet overflow (~5 px, previously a recorded non-gating limit) | `ui-audit-before.json` modal `text-200-phone-small` | fixed by the gutter cap; that scenario is now gating |

After: **0 findings** in the same sweep (display font and sans fallback), 0 control issues, 0 overflow states,
0 axe hard violations over 150 states, all 17 pop-out scenarios pass, smoke 17/17.

**Default-size layout is unchanged** except the intended Reveal row: `reports/layout-diff.txt` compares every
element's box across 150 state x viewport dumps (allocation/resolved states are skipped: their dice are random
per run; a per-run room code in `<strong>` is ignored). 148 states are identical; 2 differ, both at phone widths only, and the
the origin of the change is the hidden-threat row
(`div.gear-list > div.gear-option > span`, which now sits on one line with the button beneath it); every other
listed element is an ancestor that grew by the same ~11 px or a sibling shifted down.
The dump does not include the open sheet; its default-size behaviour is covered by the modal scenarios and the
real-Safari run.

## Honest limits

- `ui-audit-after-final-gating.json` and `ui-audit-after-forced-colors.json` carry the same `startedAt` because the two runs were launched together from one command (the forced-colors run used `--no-text-sweep`, hence 0 sweep states and a different control count); they are separate runs against the same final build.
- `ui-audit.mjs`, the text sweep and the forced-colors run are headless Chrome. Forced colors is an
  **emulation** (`forced-colors: active`, axe `color-contrast` disabled because axe reads the authored colours);
  it is not a Windows High Contrast run.
- The Simulator is **not** a physical device. No physical iOS/Android keyboard, VoiceOver, TalkBack, NVDA, or
  Windows High Contrast pass was done, and the changed build was **not** deployed, so there is **no
  candidate-on-staging evidence** (a changed candidate cannot receive staging evidence without an authorized
  deployment, which this lane was not given).
- The `vw` caps are a recorded trade-off: at 200% text on a 320 px phone the h1 is ~108% of its default size,
  buttons <= 144%, legends <= 138%, i.e. they grow less than body text; the alternative was words broken mid-way.
- iOS "before" run: the sheet test passed first time; the Back test hit the known first-run rig typing error
  ("Neither element nor any descendant has keyboard focus") and passed on rerun; the join-form test then
  asserted an app-drawn inline error that this lineage does not draw (it validates natively, and iOS draws its
  own "Fill out this field" bubble, visible in `before/join-errors-keyboard-up.jpg`), so the rig's assertion was
  corrected rather than the page. The final run of all three on the changed build passed (`after/`).
- Smoke and audit reports are not committed in full: they contain throwaway room codes.

## How it was produced

```bash
# clone/worktree outside ~/Documents; npm ci; npm run build --workspace @digitable/functions
# throwaway Vite config (NOT committed) swaps only the three emulator client ports in session/emulatorConfig.ts
PATH=/opt/homebrew/opt/openjdk/bin:$PATH npx firebase emulators:start --config <remapped-ports>.json --only auth,firestore,functions --project demo-digitable
npx vite preview --outDir <dist> --host 127.0.0.1 --port <p>          # one for 187bf4c, one for the changed tree
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:<p> --label <x> --out <dir> --port <chrome-port>
node scripts/playtest/ui-audit.mjs ... --text-only [--font-fallback sans] [--text-shots] --no-shots
node scripts/playtest/ui-audit.mjs ... --no-shots --no-text-sweep --layout-dump a.json   # then layout-diff.mjs a.json b.json --skip-state allocation --skip-state resolved --ignore-tag strong
node scripts/playtest/ui-audit.mjs ... --forced-colors --no-text-sweep
scripts/playtest/ios-simulator/run.sh --base http://127.0.0.1:<p> --out <dir> --only testJoinFormValidationWithKeyboard --only testCorrectionSheetWithKeyboardAndPicker --only testBackClosesOnlyTheSheet "<dedicated simulator>"
```
