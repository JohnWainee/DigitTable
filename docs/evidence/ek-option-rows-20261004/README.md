# Option rows stack at large text, lane `sonnet-ek` (2026-10-04)

Base: `92c2b6e` (pushed). **Source change:** presentational only (markup wrappers and CSS). Not merged, not deployed. No Firebase
project, cloud resource, authorization, privacy, projection or engine contract was touched. Staging was not contacted.

## The defect and the fix

`sonnet-ej` recorded six word breaks in checkbox/radio option rows at 150-200% text on 320-375px phones (`Phantasmagoria`,
`Panzerfaust`, `submachine`, `Fragmentation`) and called them an arithmetic limit of the layout, naming "stack the label under the box" as
considered but not tried. This lane tried it, and the first version was wrong in an instructive way (below).

1. **Stack the label.** Every option label's text is `<span className="option-text">` (14 rows in 6 files: compose
   stat/items/abilities/bonus/threats, allocation, injury category, GM correction, GM pending action, landing "written down").
   `.gear-option` is `flex-wrap: wrap`; `.option-text` is `flex: 1 1 min-content; min-width: 0; max-width: 100%;
   overflow-wrap: break-word`. A flex line breaks on the item's hypothetical size, and the flex *basis* is the label's longest word, so the
   label stays **beside** the box while that word fits and otherwise takes its own full-width line **under** it. No breakpoint, no guessed
   text-size threshold, and a normal-size row never stacks. `break-word` (not the row's `anywhere`, which shrinks min-content to one letter
   and so could never stack) keeps the basis at the longest word. The zero minimum plus `max-width: 100%` is the last resort: a word wider
   than the whole stacked line shrinks to it and breaks inside it, so nothing ever overflows.
2. **Ease the two side paddings down with the text size.** After (1) the stacked text column at 320px / 200% is still only ~196px, and
   `Phantasmagoria` is 223px. So `fieldset` side padding and `.gear-option` side padding became `--gutter-sm-fit` / `--gutter-xs-fit`:
   `clamp(4px, calc(27.2px - 0.85rem), min(0.85rem, 13.6px))` (and 20.8 / 0.65 / 10.4). That is exactly the old value at a 16px root (the
   clamp is a no-op, so the default-size layout does not move), 6.8px at 24px (150%), and 4px from 28px up. Plain `calc` on one length
   (no length division). The GM pending-action card's own tighter px paddings got the same treatment (23.6 / 18.4 intercepts). This frees
   ~32px at 200% on a phone: at 320px / 200% the stacked text column goes from ~196px to 228px (row 240px - 4px borders - 8px
   padding) against the 223px word, **a 5px margin measured with one system font** (macOS; a wider fallback font such as DejaVu would still
   break the word, safely, inside its row). Scope, stated plainly: the easing is keyed on the root `rem`, so it applies to **every**
   `fieldset` and `.gear-option` (GM tools, the correction sheet, all steps) whenever the root font grows, and the GM pending-action
   card, whose px paddings are already tighter, reaches its 4px floor at 150%. It does not ease where a browser scales text without
   changing the root size (iOS Safari's text-size control); there the stacking still applies and the word would break inside its row.
3. The GM "Reveal" row keeps `row-gap: var(--gutter-sm)` (the default-size gap when its button drops under the label) and its
   label span keeps its original `min-width: 0`; the pending-card `gap` override became `column-gap`.

Unchanged: 48px row height (`min-height: var(--tap)`, `align-content: center`), the whole row is still the label (tap target), the
`:has(:checked)` highlight and border, focus ring, disabled style, box and mark sizes, safe-area handling. Accessible names are the same
(the span is inside the `<label>`).

### What went wrong on the way (kept, because it changes how to read the numbers)

- First attempt: `min-width: min-content` on `.option-text`, with `max-width: 100%` as the "last resort". The independent review pointed out
  that in CSS `min-width` beats `max-width`, so a word wider than the row would **overflow** it. The new probe proves it (247 failures on that
  variant, `stress/min-content-variant.json`) - and it also exposed that this variant's clean audit had been a false pass: at 320px / 200%
  that JSON records "text overruns its row by 15px" and "a row scrolls 17px sideways" (the audit's detector only looks for a word split
  across lines, and the overrun stayed inside the fieldset). The honest basis-plus-zero-minimum version then showed the
  two remaining 320px / 200% words (`Phantasmagoria`, `Fragmentation`) really did not fit, which is what motivated step 2.
- A first version also tightened `row-gap` for every option row; the default-size layout diff caught the GM "Reveal" row becoming 11px
  shorter, hence step 3.

## Evidence (this worktree; stack on remapped ports, peers untouched)

Private stack: Firebase emulators on 61xxx (auth 61099, firestore 61080, functions 61001, hub 61400), Vite previews 61173 (base bundle)
and 61174 (candidate); the emulator-suite run used 62xxx. The throwaway Vite config / emulator config swapped only port numbers and were
deleted, not committed. Every Chrome run used its own `--port` (9371-9386). No peer process was touched.

| Check | Before (base `92c2b6e`) | After (final stylesheet) |
| --- | --- | --- |
| `ui-audit.mjs`, 288 states, phone / tablet / desktop / table + 150% / 200% text (`ui-audit-*.log`, `-report.json`) | **6 failures**, all word breaks: `Phantasmagoria` at 320px/150%, 320px/200%, 375px/200%; `Panzerfaust`, `submachine`, `Fragmentation` at 320px/200% | **0 failures** ("UI AUDIT PASSED") |
| control-size / viewport / 16px type failures | 0 | 0 |
| horizontal overflow states (incl. 256 text-scale states) | 0 | 0 |
| axe hard violations | 0 (one existing best-practice note on the nonexistent-room route) | 0 (same note) |
| pixel contrast failures | 0 | 0 |
| sheet cases, keyboard-focus checks, pinch scenarios, validation scenarios | 23, 87, 4, 8 | 23, 87, 4, 8 |

Controls audited: 3,256 (before) vs 3,320 (after final); dock-focus checks 275 vs 363. The roster sweep and the GM roll draw different
random dice per run, which changes how many controls exist (a review traced 3,256 -> 3,336 in an earlier after-run to exactly 16
allocation states x 5 more dice controls); it is run-to-run variance, not a change in what is tested. The allocation panel was therefore
never compared on the same roll. Contrast: 5 pages are still scored on truncated slices and ~310-330 boxes are "insufficient to judge"
(none a failure), as in earlier lanes.

A known cosmetic nit, not fixed (it would have invalidated the audit again): `.gear-item > .secondary-action` (a utility item's own
"Mark and regain Blood" button) keeps `margin-left: var(--gutter-xs)` (10.4px) while its row's padding now eases to 4px at large text, so
the button sits a few px right of the label column there.

An earlier after-run (design step 1 only, zero-minimum, before step 2) failed exactly two of these (`Phantasmagoria`, `Fragmentation`
at 320px / 200%); that run is not kept, and its failure is the reason for step 2.

### Stress probe (`scripts/playtest/option-row-stress.mjs`, outputs in `stress/`, one `.txt` and `.json` per stylesheet)

The audit stops at 200% text on >= 320px. The probe renders the real built stylesheet on a page with the app's step / fieldset / row
nesting (and the GM card) in iframes (an iframe's viewport *is* its width; a headless window will not go under ~500px - a first version
that used window sizes silently tested the wrong width and "passed"), at 240, 280, 320, 375, 412 and 768px and 100-300% text. Hard
failures: overflow of the page, a row or its text; a box or text outside its row; a row under 48px; a word cut while still beside its
box; a word cut though it fits stacked; any broken word at <= 200% on >= 320px. The synthetic page's row is 221px at 320px, the same
as the real compose row in the layout dump (the earlier belief that it was narrower came from a 15px scrollbar in the iframe, since
removed).

| Stylesheet (built CSS file) | Result |
| --- | --- |
| final (`index-BSb4s0dM.css`, `stress/final.*`) | **PASSED**: 0 overflow anywhere. At 320px no word breaks through 200% (rows 240px at 200%); words break only at 320px >= 250%, 375px >= 300%, 412px 300%, and below 320px at 150-200%, always inside the row |
| final **without the padding easing** (`nofit.css`, derived by reverting the four `clamp` values; `stress/no-padding-easing.*`) | FOUND PROBLEMS (4): `Phantasmagoria` and `Fragmentation` break at 320px / 200% (223px / 200px words, 196px text column) - the negative control for step 2 |
| `min-width: min-content` variant (`index-8QmDBjsK.css`, the first attempt; `stress/min-content-variant.*`) | FOUND PROBLEMS (247): rows scroll sideways, text overruns its row (15px at 320px / 200%) |
| base `92c2b6e` (`index-gs-V57Xe.css`, `stress/base-92c2b6e.*`) | FOUND PROBLEMS (199): words cut beside their box |

The probe does not model the stat rows' icon or the `.gear-item` action button, uses six fixed names (words of 8+ letters), and measures a
word's unbroken width with the shorthand `font` (letter-spacing is 0 on these rows). The real-screen audit covers those.

So the supported range (<= 200% text, >= 320px) is clean, and beyond it the failure mode is a word broken inside its row, never overflow.
A 14-letter name at 250-300% text on a 320-375px phone is wider than the row and still breaks; that is the remaining physical limit.

### Default-size layout is unchanged (`scripts/playtest/layout-diff.mjs`)

Dumps of every visible element's box at the default text size, base bundle vs final candidate (idle machine): 184 comparable
state/viewport pairs (11,592 elements), **184 identical, 0 differ**. The tool exits 1 only because 104 states have a different DOM (the new
span) and are skipped by design (and, with its default floor, because the 8-9 element not-found pages are "too small to prove anything").
Those were compared with the new span dropped from the candidate dump by the committed `scripts/playtest/layout-diff-ignoring.mjs`
(harness test in `auditHarnessContract.test.ts`; output in `layout-diff.log`): 264 comparable states, 201 identical; of the differing
elements 60 are a random room code's `<strong>` width and 78 are translations with the size unchanged (the pinned `position: sticky` action
dock and its zero-size sprite container, whose recorded top depends on the scroll position at dump time; it also moved between runs of
the same state on the base bundle); **0 elements changed size**. 24 states stay uncomparable (a different dice roll). The tool's
guarantee is "no size changed"; a pure translation is reported, not proven benign, and the sticky-dock explanation is the author's
reading of which elements moved.

### Other gates (this worktree)

| Gate | Result |
| --- | --- |
| `npm run check` (`check.log`) | see the handoff for the final result on the committed tree |
| `npm run build` (`build.log`) | exit 0 |
| `two-device-smoke.mjs --reload` on the final bundle (`smoke.log`, `smoke-report.json`) | ALL STEPS PASSED, no overflow at 375/768/1024/1280/1920 |
| `ui-audit-selftest.mjs` (harness unchanged) | SELF-TEST PASSED (run once earlier; unlogged) |
| Emulator suites on 62xxx, test ports remapped for the run and reverted (`emulator-suite.log`) | 18 rules/testing + 86 Functions + 4 web passed, exit 0. Run on an earlier stylesheet; none of the code under test (Functions, rules, session client) changed since, only CSS and presentational markup |

### Captures (`shots/before`, `shots/after`; same state names, full page, final stylesheet)

`player3-compose` (long-name roster: Phantasmagoria, Panzerfaust): 320px at 100%, 150%, 200%; 375px at 100% and 200%; tablet 768; desktop
1280; table 1920x1080. `gm-console-pending` (GM card with option rows): 320px at 100% and 200%, tablet, desktop, table. `gm-correction`
sheet at 200% on 320px, plus tablet and desktop. `player-allocation` at 200% on 320px.

## Audit coverage (every control family)

Native `<select>` (scene director, GM tools) and its text echo; the `<details>` "Why?" disclosure; the single `SheetDialog` (GM
correction: visual-viewport hook, internal scroll, safe-area, compact mode, focus trap, `inert` background, emulated keyboard, pinch zoom,
reduced motion); radio/checkbox option rows and `AllocationStepper`; the sticky `ActionDock` (pin/unpin, focus clearance, short and
landscape viewports). There is no anchored popover, menu, datalist, tooltip or toast, so no popover needed a bottom-sheet fallback; the
sheet already is the full-width bottom sheet on phones. All run at 320, 375, 390, 412, 812x375 landscape (with and without browser
bars), 768, 1280 and 1920x1080, plus 150% and 200% text on the phones.

## Not covered (still open)

Physical iOS/Android hardware, real keyboards and browser-chrome collapse, a native `<select>` popup (OS-owned, not capturable headless),
screen readers, Windows High Contrast, a real TV. Real-Safari lanes (`sonnet-ed`, `sonnet-ei`) were not rerun for this change. Text at
250-300% on 320-375px phones: a 13-14 letter name breaks inside its row (see the probe).
