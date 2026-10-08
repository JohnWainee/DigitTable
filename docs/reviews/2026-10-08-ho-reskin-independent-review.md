# ho reskin large-text / pop-out audit: independent review

- **Date:** 2026-10-08
- **Reviewed:** commit `8c6bf4e` (parent `187bf4c`) on `sonnet/ho-reskin-orchestrated-20261008`; findings resolved in the follow-up commit recorded in `CLAUDE_HANDOFF.md`.
- **Author:** Sonnet ho session. **Reviewer:** a separate fresh general-purpose subagent with no access to the author's reasoning, read-only (it ran the focused vitest suites and read the diff, CSS and evidence; it did not run the browser audits, the layout diff or the iOS rig, and did not view the images).
- **Verdict:** approve with changes (no blocker). The CSS reasoning that the default-size layout is unchanged was independently confirmed: `--gx` is exactly 16 px for every viewport >= 320 px at a 16 px root, the derived multiples equal the old rem values, the vw caps never bite at default size on any viewport >= 320 px, safe-area handling is unchanged, and no engine/contracts/template/Functions/rules/projection file or dependency changed.

## Findings and dispositions

| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | major | The text sweep printed findings but could not fail a run unless `--text-sweep-gating` was passed, so a regression to REV/EAL would exit 0 | **Fixed.** Gating is the default; `--text-sweep-advisory` opts out. The final run (`reports/ui-audit-after-final-gating.json`) passes with the gate on. |
| 2 | minor/major | vw font caps stop headings/buttons/legends scaling with the text setting (h1 ~108% of default at 200%/320 px) | **Accepted and recorded** (CSS comment, evidence README, handoff). It is a deliberate WCAG 1.4.4 trade against mid-word breaks; it never applies at default size. |
| 3 | minor | `min-width: min-content` replaces the 3rem width floor instead of adding to it | **Documented** in the CSS comment (width now comes from label + 2 x 1.25 x `--gx` padding; every label is a word; an icon-only button must use a class that keeps the floor). `max(var(--tap), min-content)` is invalid CSS. |
| 4 | minor | `min-content` turns a mid-word break into overflow in a column narrower than a label (sheet actions grid, `.landing-actions--primary`) | **Recorded.** Not reachable at >= 320 px (320 px / 200% sheet scenario now gates and passes); untested below 320 px. |
| 5 | minor | Layout diff stopped at the first divergence per state, so "only the Reveal row changed" was inferred; the dump has no open-sheet captures | **Fixed.** `layout-diff.mjs` now compares every element and lists those whose own x/width/height changed; the origin is the hidden-threat row. The sheet is argued from the modal scenarios and the iOS run (stated in the evidence README). |
| 6 | minor | `BROKEN_WORDS` excluded every `<dd>`, hiding prose in the create-session reveal | **Fixed.** Only `<dd>` values that are not `<em>` prose are excluded. |
| 7 | minor | `--font-fallback sans` leaked into later captures | **Fixed.** `--font-display` is restored at the end of each sweep. |
| 8 | nit | Stale `layoutDump` comment | **Fixed.** |
| 9 | nit | Tests are string pins; sheet-header cap and `.gear-option--action > span` untested; the `closest("label")` assertion already passed before the change | **Partly fixed.** Added the sheet-header cap and span rule pins (mutation-checked: both fail when reverted). The `closest("label")` assertion is kept as a guard; the class assertion is the one that fails on revert. Other bare-rem gutters are intentionally not pinned. |
| 10 | process | No handoff update or review record | **Fixed** (this file; `CLAUDE_HANDOFF.md`). |

## Not verified by the reviewer

Browser audits, text sweep, layout diff, iOS Simulator rig, evidence images, sub-320 px widths, fractional text scales, other pages' `.link-button`/stepper at large text. Those were run by the author (see `docs/evidence/ho-reskin/README.md`) and are author evidence, not reviewer-verified.
