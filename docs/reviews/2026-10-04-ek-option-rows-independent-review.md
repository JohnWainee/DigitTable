# Independent review: option rows stack at large text, lane `sonnet-ek` (2026-10-04)

- **Scope:** `sonnet-ek-reskin-option-rows-20261004` on base `92c2b6e`: every checkbox/radio label's text wrapped in `.option-text`; `.gear-option` made `flex-wrap: wrap` so a label drops under its box when its longest word cannot sit beside it; `fieldset` and `.gear-option` side padding eased down as the root text grows (replaces the six recorded word breaks).
- **Reviewer:** one fresh read-only subagent (not the author), asked twice: a first pass on the initial candidate and a second pass, after the corrections below, by the same reviewer resumed with its context. It read diffs, evidence JSON and screenshots and re-ran `reskinContract.test.ts`; it ran no browser, server or emulator. **This is model review, not human review**, and the second pass shares the first pass's blind spots.

## First pass: approve with fixes

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | **Wrong claim: `max-width: 100%` is not a "last resort".** `min-width` beats `max-width`, so with `min-width: min-content` a word wider than the row **overflows** it. The audit only reaches 150-200% text on >= 320px; nothing probed 250-300% text, a viewport under 320px or the nested pending-action card. Same flaw in the Reveal-row span rule. | **Confirmed and fixed.** `.option-text` is `flex: 1 1 min-content; min-width: 0; max-width: 100%` (the longest word is the flex *basis*, which decides where the line breaks; the zero minimum lets an over-wide word shrink to the row and wrap inside it). The Reveal span is back to its original `min-width: 0`. New real-browser probe `scripts/playtest/option-row-stress.mjs`: 0 overflow on the fix; 247 failures on the `min-content` variant, 199 on the base stylesheet. |
| 2 | JSX: no semantic change (only wrapping; expression order, whitespace and the `id` on the `<label>` unchanged). | No action. |
| 3 | Evidence: base has exactly 6 `brokenWords`, candidate 0; the control-count difference is a different random dice roll; the allocation panel was never compared on the same roll. | Recorded in the evidence README. |
| 4 | Tests: the source scan missed some shapes and `toContain` was weak. | Hardened: all label text must sit in exactly one `.option-text` span; guard against `min-width: min-content` there; mutation check (reverting the rule fails the test). |
| 5 | Scope clean; handoff and review doc missing. | Added. |

## What the corrections uncovered (author, after the first pass)

With the zero-minimum rule the real audit failed exactly two cases it had passed before: `Phantasmagoria` and `Fragmentation` at 320px / 200%. The real compose row is 221px (layout dump), the stacked text column ~196px, the word 223px. The `min-content` variant had passed only by letting the word overrun its row: its probe JSON records "text overruns its row by 15px" and "a row scrolls 17px sideways" at 320px / 200%. That led to the padding easing (`--gutter-sm-fit` / `--gutter-xs-fit` and the pending-card analogues), which is exactly the old value at a 16px root. Negative control: the final stylesheet with the four `clamp` values reverted fails the probe's supported-range check with those four 320px / 200% findings.

## Second pass: approve with fixes (no behavioural blocker)

Confirmed by the reviewer: the clamp math (13.6px / 10.4px exactly at a 16px root; non-increasing above it; equal to the old rem value below it); standard CSS support for `calc` with `rem` inside `clamp`/`min`; the 4px floor plus the 2px border leaves a visible gap at 200% on 320px (viewed in the screenshots); the full audit is clean; the probe mechanics (iframe viewport, `overflow: hidden` not masking `scrollWidth`, row-level checks, system fonts) and its negative controls discriminate.

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | README overstated "the word was spilling ~27px" with nothing committed behind it; "232px+" column was wrong (it is 228px). | Fixed: the claim now cites the committed probe JSON (15px overrun, 17px sideways scroll); 228px with a stated 5px margin measured with one system font. |
| 2 | Stale `option-row-stress-final.json` / `-rerun.json` (old stylesheet, a failed run); the stress text lacked CSS filenames and the variant's failure list was cut off. | The stale files were moved out of the tree (kept in the job directory, not deleted). Replaced by `stress/` with one `.txt` and one full `.json` per stylesheet, naming the CSS file. |
| 3 | README ("same as the real row") and this review ("16px narrower") contradicted each other. | The README is right: the synthetic row is 221px, equal to the real compose row; the earlier "narrower" belief was wrong and the sentence is removed. |
| 4 | 102MB `post-review-ui-audit` and 5.3MB `post-review-smoke` in the evidence folder, unreferenced. | They came from the earlier (dead) session on the pre-correction stylesheet. Moved out of the tree, not committed, not deleted. The README cites only the final run. |
| 5 | `check.log` was stale (a new lint warning at `reskinContract.test.ts:762:64` after it). | The warning was fixed (explicit return types); `npm run check` was re-run on the final tree and recorded (see handoff). |
| 6 | The span-stripped layout comparison was an uncommitted ad-hoc script, with no layout-diff log. | Committed as `scripts/playtest/layout-diff-ignoring.mjs` with a harness test (passes on a wrapper-only change; fails on a resize; counts translations and random-code widths) and `layout-diff.log`. |
| 7 | This section said no second pass happened. | Updated. |
| 8a | Add a probe negative control with the padding easing removed. | Done (`stress/no-padding-easing.*`). |
| 8b | `.gear-item > .secondary-action` keeps a 10.4px left margin while the row's padding eases. | **Not fixed, documented**: the fix touches the stylesheet and would invalidate the final full audit again; it is cosmetic (a few px at large text on the utility-item button). |
| 8c | State that the easing is rem-keyed and affects all fieldsets / option rows; state the 5px headroom is one system font. | Done in the README. Also noted there: it does not ease where a browser scales text without changing the root size (iOS Safari text size), where the word would break inside its row. |

The second pass did not view the GM pending, GM correction, 150% or desktop/table screenshots; the author viewed `player3-compose-text200-phone-small` before/after only. Pairs at other sizes are covered by the audit and layout metrics, not by human eyes.

## Still open

Physical iOS/Android hardware, real keyboards, a native `<select>` popup, screen readers, Windows High Contrast, a real TV, the real-Safari lanes (not rerun), and a human review. At 250-300% text on 320-375px a 13-14 letter name is still wider than its row and breaks inside it (probe-reported, no overflow).
