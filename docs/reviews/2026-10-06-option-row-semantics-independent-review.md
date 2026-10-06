# Option-row semantics independent review — 2026-10-06

- **Scope:** Follow-on to `sonnet-fg/reskin-orchestrated-20261005` (`f3fc981`): separate a player utility-action button from its checkbox label and retain narrow/mobile option-row layout guarantees.
- **Method:** Independent read-only review of the tracked diff, with `AGENTS.md`, the canonical architecture, and the UX resolution guidance in scope. The reviewer did not modify the patch.
- **Verdict:** **Approved after three P2 evidence corrections.** No product, accessibility, privacy, or authorization findings remain.

## Checks and conclusions

- The checkbox label and utility action are sibling controls, eliminating the previous nested-interactive markup without changing action dispatch or any authority/projection path.
- The label remains a 48 px practical target; flex wrapping preserves the action's width and avoids squeezing it on narrow or enlarged-text layouts.
- The dedicated axe/keyboard/source-guard regression and the existing style-contract coverage protect the semantic and responsive behavior.
- No hidden data, authorization, template rules, or functional state semantics changed.

## Verification observed

- `npx vitest run apps/web/test/accessibility/OptionRowSemantics.a11y.test.tsx apps/web/test/styles/reskinContract.test.ts` — 56 passing tests.
- `npm run check` — format, lint, typecheck, and 719 active tests passed (11 todo).
- `npm run build` — passed; existing Vite large-chunk advisory only.
- `node scripts/playtest/option-row-probe.mjs --out docs/evidence/fh-reskin/final` — 150 browser layout/input checks passed at phone, tablet, desktop, and table widths across 100%, 150%, and 200% text.

## Review follow-up and resolution

The reviewer identified three P2 gaps in the first browser-evidence draft: it described horizontal-only geometry as full viewport visibility, included a vacuous text-field-font assertion despite rendering no text field, and described synthetic usable-item checkbox behavior as the real unavailable-item fixture. The follow-on patch narrowed the geometry claim, removed the vacuous check, clarified the fixture, and reran the same final probe against both `f3fc981` and the follow-on source. The two comparable reports contain 150 checks each: baseline records the expected 15 nested-interactive failures and final records zero. The reviewer reran the final local-only probe and approved the resolution.

## Second independent pass and correction (2026-10-06, lane `sonnet-fh`)

A second fresh-context read-only review of the committed `66f4071` found **one Medium regression the first pass missed**: that commit removed the generic `.gear-option:has(> button)`, `.gear-option > span` and `.gear-option > button` rules, which the GM's "Reveal" row (`SceneDirector.tsx`, a `div.gear-option` with a `span` and a `button`) still depended on. Without them the Reveal button no longer sat at the row edge and nothing wrapped, so a long hidden-threat name at 200% text squeezed it. Fixed forward: the three rules are restored verbatim (they are the pre-change rules), `.gear-option--row:has(:disabled)` now keeps the row cursor default so only the label shows `not-allowed`, and `reskinContract.test.ts` pins the generic wrap/no-squeeze rules alongside the new `--row` ones. Lows left as documented: the row's 0.4rem padding stacks with the 48px label (about 6px taller, cosmetic); the "not broken mid-word" probe assertion is lenient (`scrollWidth` + line count); forced colors, left alignment of the action and multi-summary measurement are not probed.
