# Independent review: option-row cascade guard, lane `sonnet-eo` (2026-10-04)

- **Scope:** `29444c3` (and `3942b1b`) plus the lane's one change, a unit-test guard in `apps/web/test/styles/reskinContract.test.ts`. No `apps/web/src` change.
- **Reviewers:** (1) the earlier independent review of `29444c3`, whose minor finding (the cascade allow-list pins only padding/margin, so a late or narrow `flex-wrap: nowrap` passes) this lane implemented; (2) a fresh read-only reviewer subagent, separate from the author, on the guard and on `29444c3`/`3942b1b`. (A duplicate same-task session offered the reviewer role by message but delivered no findings.)
- **Verdict:** approve; no blocking findings.

## Findings and dispositions

| Finding | Disposition |
| --- | --- |
| Medium: the `touches` selector regex fired only on class names, so `.step label`, `input[type=…]`, `legend`, `.stat-icon` or `:is(fieldset, …)` were invisible. | **Fixed.** It now also matches `fieldset|label|input|legend` as element names (including after `(`) and `.stat-icon`; the allow-list lists the resulting rules explicitly. |
| Medium: the layout-property list omitted `word-wrap`, `text-wrap*`, `hyphens`, `line-break`, `order`, `gap`, `inline/block-size`, `zoom`. | **Fixed** (added; `gap` rules now appear in the allow-list). Margin/padding stay covered by the existing allow-list. |
| Low: naive parser (braces in strings/`url()`, bare `@import`, comments assumed stripped). | **Accepted**: the stylesheet has none of these; the doc comment states the comment precondition. |
| Low: exact-equality allow-list is brittle by design. | **Accepted**: that is the point (a new layout rule must be added on purpose). |
| Info: `.gear-option:has(> .secondary-action) > span` overrides `.option-text` in rows that carry an action (Reveal row), which therefore do not stack. | Pre-existing, deliberate (Reveal row wraps its button instead); no change. |
| Info: `fieldset:has(.gear-option)` skips a fieldset holding only `.form-field--checkbox` rows; browsers without `:has` lose only the padding easing. | Accepted; the landing checkbox is not in a fieldset of option rows and still stacks by content. |
| `29444c3`/`3942b1b` correctness, accessible names, native controls, authority/authorization/projection/privacy | **No findings.** |

## Evidence

Mutation check against the real stylesheet (an appended `@media (max-width: 400px) { .gear-option { flex-wrap: nowrap; } }`) fails the new tests; the synthetic-stylesheet test proves detection of a nested `@media` rule, a later equal-specificity rule, `flex-flow: row nowrap`, `.step label`, `:is(fieldset, .x)` and `word-wrap`. After the review fixes: styles contract 86 passed, `npm run check` 854 passed. See `docs/evidence/eo-reskin-audit-20261004/`.
