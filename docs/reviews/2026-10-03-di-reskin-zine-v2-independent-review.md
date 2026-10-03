# Independent review: reskin zine v2 layer and texture contrast (2026-10-03)

- **Scope:** commit `261f28b` ("extend punk zine visual system", previously unreviewed) plus the follow-up fixes on `sonnet-di/reskin-review-20261003`. Earlier commits on the candidate carry their own reviews (`2026-10-02-cz-…`, `2026-10-02-df-…`).
- **Reviewer:** a fresh read-only subagent that did not write the change (author: Sonnet 5.5, this session). The reviewer read code only; browser evidence is the author's, below.

## Findings

1. **Photocopy texture could undercut text contrast (fixed).** axe measures text against the flat `--ink-0`, so it cannot see `body::before`. Measured in Chrome by canvas read-back of the SVG: peak streak alpha is 0.341 of white at the shipped `opacity='.5'` (0.683 x opacity). Over the page's riot glow that puts `--mute` hint text near 2.4–2.9:1 inside the brightest streaks. Opacity is now `.1`; the contract test composites the peak streak over the glow-tinted base and demands `--mute` >= 4.5:1 (about 4.8:1). Mutation-verified: the test fails at `.5` and at `.2`, passes at `.1`.
   - The reviewer's first-pass caveat (the `.2` fix still ignored the glow underneath, ~3.8:1) was correct and led to `.1`.
2. **No texture opt-out for increased contrast (fixed).** Added `@media (prefers-contrast: more) { body::before { display: none } }` beside the existing forced-colors rule; test added.
3. **Latent state override (fixed).** `.landing-actions--primary > .primary-action:nth-child(2)` (pink, specificity 0,3,0) would have out-ranked `.primary-action:disabled` (0,2,0) and left a disabled button looking enabled. Now `:not(:disabled)`; test added. No landing button is disabled today.
4. **Non-blocking, left as is:** `mediaBlock("(forced-colors: active)")` returns the first of two such blocks; it works but depends on order. The `0.683` constant is a recorded measurement and will not notice a changed seed/frequency. Halftone dots under a peak streak are ignored (1 px, sparse).

## Verified unaffected

Error alerts, `aria-invalid` borders, disabled dashed buttons, focus-visible ring swaps, downed portraits, selected-stat highlight, forced-colors, and reduced-motion (h1 rotation reset) were checked against the zine v2 rules by specificity; none is overridden.

## Design caveat (not changed)

On the Director console the role accent is riot red, the same hue as errors and danger. Errors still carry an `ERROR:` text prefix, an `aria-invalid` border, and role=alert, so state is not colour-only, but a fully red Director surface reduces the visual weight of a real error. Left for John's design call.

## Verdict

Approved; no blocking findings. Physical iOS/Android and assistive-technology rehearsal remain required before merge or deployment (`docs/PLAYTEST_TWO_DEVICE.md`).
