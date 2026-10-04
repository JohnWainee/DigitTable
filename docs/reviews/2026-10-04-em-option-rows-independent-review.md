# Independent review: large-text option rows, lane `sonnet-em` (2026-10-04)

- **Scope:** `sonnet-em-reskin-orchestrated-20261004` on base `92c2b6e`: the text of every checkbox/radio label wrapped in `.option-text`,
  `.gear-option` made `flex-wrap: wrap`, the option rows' side paddings eased with the text size, and the tests and browser probe around
  them. Presentation only; no authority, authorization, projection, engine, template, Firebase, secret or asset change.
- **Revisions:** `3942b1b` (the work as it stood at 11:55 HST) and `29444c3` (the follow-up that answers the second review).
  **Provenance note:** `3942b1b` was committed, amended and pushed by a Codex session working in this same worktree while the author
  session was still running; the author did not make or push it. It captured the author's then-current working tree, so it already holds
  everything the first review (pass B) led to. `29444c3` is the author's own commit.
- **Reviewers.** Three passes, none by the author:
  - **Pass A, Codex** (recorded by Codex in `3942b1b`): approve. It reviewed the markup/CSS/test intent and the evidence available at the
    time. Its text said a fresh Sonnet review "could not authenticate"; that describes Codex's own attempt. Passes B and C below did run.
  - **Pass B, a fresh read-only Sonnet subagent** (no author context; it ran the unit tests and the stress probe and mutated copies of the
    stylesheet): approve with fixes, nine findings. It reviewed the working tree before the fixes below.
  - **Pass C, a fresh read-only Opus subagent**, on the range `92c2b6e..f119d28` (the code of `3942b1b` plus the test changes of that
    revision): approve with fixes, eleven findings, **no blocker**. It confirmed the clamp math by hand at roots 12-48px, identical
    stylesheet values at a 16px root, the cascade (specificity and source order), and no accessibility regression in the markup.
- **Not re-reviewed:** `29444c3` answers pass C and was verified by mutation checks (below), but no model read it afterwards. Say so when
  weighing this record. The evidence was regenerated on the final code (see the evidence README).

## Pass B (Sonnet): findings and dispositions

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | **Major.** The easing test took its "default px" from the expression it was checking, so a swapped constant passed (reviewer mutation: sm-fit given xs's numbers; all 82 contract tests and the probe passed). | **Fixed.** `reskinContract.test.ts` has a hand-written table of expected px at roots 12/14/16/20/24/32/48 for all four expressions, plus the plain tokens' px. Mutation-checked: sm-fit with xs numbers, a zero floor, an unscoped fieldset rule, a dropped card rule, and the old button margin each fail. A like-for-like layout check at 100% text also fails on the first of those (702 boxes differ), where the probe never could. |
| 2 | Easing was global: every fieldset, including ones with no option rows, changed from 100% text upward. | **Fixed.** `fieldset:has(.gear-option)` only; the GM card has its own, more specific `:has` rule so no ordering can let the generic one win. Disclosed: between 100% and the floor (~170%) those padding values move, by design; adjacent fieldsets then differ at large text (pass C #9, accepted). |
| 3 | The utility item's button kept `margin-left: var(--gutter-xs)` while the row padding eased, so it drifted ~4px right of its box. | **Fixed.** Margin and `max-width` use `--gutter-xs-fit`; pinned by a test. |
| 4 | Probe omitted the stat row's icon, `.gear-item` + button, the landing row and the Reveal row; ASCII-only 8+ letter word regex. | **Fixed.** All present; `\p{L}{5,}` with a non-ASCII word. |
| 5 | `--expect-failures` accepted any failure kind. | **Fixed.** It exits 0 only if at least one word was cut while still beside its box. |
| 6 | The harness test was grep-style. | **Replaced** by a behavioural test of the pure verdict module (`optionRowStressRules.test.ts`); see pass C #2. |
| 7 | The compose DOM test never rendered bonus-claim or threat rows. | **Fixed.** It claims every claimable item/ability and renders active threats; the source scan now also requires the input to lead the label and counts every `gear-option` mention. |
| 8 | Nit: a stacked row keeps the 13.6px row gap. | **Declined.** `row-gap` is shared with the GM "Reveal" row, which already wraps its button under the label at the default size on a phone, so changing it would move a default-size layout. Cosmetic only. |
| 9 | Evidence unfinished. | **Done** (evidence README). |

## Pass C (Opus): findings and dispositions

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | The `f119d28` commit message described changes that were already in `3942b1b`; no review record existed. | **Fixed.** `29444c3`'s message lists only what it contains; this document is the record. `3942b1b`'s message is Codex's and is already pushed (not rewritten). |
| 2 | Replacing the string pins with a behavioural test lost boundaries: `MIN_ROW_HEIGHT = 44`, the default-stack rule at `> 320`, the GM card exempted, and beside-box cuts demoted outside the supported range all passed. | **Fixed** in `29444c3` (47/48px, exactly 320 vs 319px, the GM card, 200% vs 250%, a beside-box cut at any width/scale). Each of those four mutations now fails a unit test. |
| 3 | Cascade overrides (a later `.step fieldset { padding-inline }`, a `@media (max-width: 400px) { .gear-option { padding-inline } }`) passed every unit test; only the probe caught them. | **Fixed.** A contract test lists every rule that sets padding/margin on a fieldset or option row and fails on any other; both overrides fail it. |
| 4 | Moving the stat icon inside `.option-text` passed. | **Fixed.** The DOM test requires `input, svg, span` as the row's children. |
| 5 | The committed stress evidence predated the committed probe (15 rows/5 labels vs 26 rows; old "any failure" control message). | **Fixed.** Regenerated with the final probe (base: 454 failures, 433 beside-box cuts, control OK; final: 0 failures). The thin margin is disclosed: at 320px/200% the stacked column is 228px and "Phantasmagoria" needs 223px, so a wider fallback font can still cut it (inside the row, never overflow). |
| 6 | README/handoff claims that did not match files (global easing, "~232px", "841 tests", "129 tests", Reveal "unchanged", the layout-diff failure, the 3,336 -> 3,320 control change, an undescribed misremapped emulator run, review-doc text). | **Fixed.** README and handoff rewritten from the logs in this folder. |
| 7 | The probe never exited headless Chrome (a 90s timeout every run) and left ~80 MB per run in `$TMPDIR` (56 directories, ~4.6 GB). | **Fixed.** It ends Chrome as soon as the DOM is dumped and removes its profile on every exit (90s -> under 1s per run). The leftover directories from this session were removed where the environment allowed (see the evidence README). |
| 8 | Comment said "4px from 200% up (106-199% moves them)". | **Fixed.** Floors: ~170% (fieldset sides), ~162% (row), ~144%/138% (GM card). |
| 9 | Adjacent fieldsets differ at large text (compose "Engaged threats" with/without threats; correction sheet "Item uses" vs "Injury boxes"). | **Accepted, documented** (by design of scoping to option-row fieldsets). |
| 10 | The "not vacuous" test depended on state from earlier tests. | **Fixed.** One self-contained test over the roster. |
| 11 | Firefox untested for `flex: 1 1 min-content`; if rejected the declaration drops and long labels stack at the default size. | **Mitigated.** `flex: 1 1 0%` ahead of it makes a rejecting engine keep the old behaviour (beside the box, the word breaks); pinned by a test. Firefox itself was not run. |

## Mutation checks run on the final tests (each on a copy, restored after)

Stylesheet: sm-fit with xs numbers; zero floor; unscoped fieldset rule; dropped card rule; old button margin; appended media-query
override; appended later `.step fieldset` rule; flex fallback removed. Verdict module: supported-range bound; beside-box count removed;
button check removed; default-stack rule disabled; Reveal exemption removed; `MIN_ROW_HEIGHT = 44`; default-stack at `> 320`; GM card
exempted; beside-box cuts demoted. Markup: a threat row unwrapped; the stat icon moved inside the span. **Every one fails at least one
test.** (The pass-C reviewer's own mutation set additionally showed the probe catching `anywhere` on `.option-text`, `flex-basis: auto`,
`flex-wrap` removed and `min-width: min-content`.)

## Residuals

Physical iOS/Android, VoiceOver/TalkBack, Windows High Contrast, Firefox, real browser-chrome collapse and a real table display are not
covered. At 250-300% text on a 320-375px phone a 13-14 letter name is wider than a whole row and still breaks inside it (contained, never
overflow). A wider-than-system-ui font at 320px/200% can do the same to "Phantasmagoria" (5px of headroom here).
