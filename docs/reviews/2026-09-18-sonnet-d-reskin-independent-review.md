# Ink-black reskin and mobile pop-out independent review

- **Date:** 2026-09-18
- **Branch:** `sonnet-d/reskin-mobile-sheets` (from `factory/today-integration` at `59c4fe3`)
- **Range:** first pass `59c4fe3..9939b7d`; author's resolution `9939b7d..c70333b`; second pass over `9939b7d..c70333b`, then a verification round over `c70333b..d96ae0c` (same reviewer, resumed); nits fixed by the author in `32d0397` (verified by the full gates and new tests, not re-reviewed)
- **Reviewers:** two independent Claude (Opus) review agents, each in a fresh context with no access to the author's reasoning, read-only on the worktree, mutation-testing copies under `/private/tmp`
- **Verdict:** first pass on `9939b7d`: **changes required** → second pass on `c70333b`: **changes required** (one blocker: `npm run check` failed on a lint error the resolution introduced) → verification of `d96ae0c`: **approve with nits**

## Review scope

A presentation-only change to `apps/web`: a full rewrite of `styles.css` (ink-black surfaces, original acid/riot/cyan/pink accents, procedural print grain, hard-shadow panels), a new shared `SheetDialog` (portal, inert background, scroll lock, visual-viewport sizing, focus trap) that replaces the ad hoc correction modal, a full-row label for the one small checkbox, viewport meta tags, two test files, and `scripts/playtest/ui-audit.mjs`. Reviewers were asked to check behaviour preservation, privacy/role/route semantics, the sheet's correctness on narrow layouts, the CSS for real bugs, whether the new tests would fail if the behaviour they name regressed, whether the browser audit could pass vacuously, licensing hygiene, and to run `npm run check` and `npm run build` themselves. Neither reviewer ran the emulator suite or `ui-audit.mjs` (another process held the emulator ports); the author's results, run on the final code, are in `docs/evidence/sonnet-d-reskin/`. The author's final gates on `32d0397`: `npm run check` exit 0 (653 passed | 11 todo), `npm run build` exit 0, `npm run test:emulator` exit 0 (18 + 86 + 3).

## Findings and resolution

First pass (against `9939b7d`): **changes required.** Two High, three Medium, and a process gap, all confirmed and fixed in `c70333b` (details in the table).

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| R1 | High | `touch-action: none` on the full-screen `.sheet-backdrop` disabled pinch-zoom for the whole page while a sheet was open (an ancestor's `touch-action` cannot be re-enabled by a descendant). Reproduced by the reviewer in real Chrome (scale stayed 1.0 vs 2.0). The CSS-contract test only inspected the viewport meta | First `touch-action: pinch-zoom`, then `auto` after the second review found `pinch-zoom` forbids one-finger panning (N2 below); the reviewer verified touch scrolling inside `.sheet-body` is unaffected either way. New CSS-contract assertions (`touch-action: none` may not appear anywhere) and a real synthesized two-finger pinch check in `ui-audit.mjs` |
| R2 | High | The wide-viewport `padding: 1.5rem` shorthand overrode the safe-area padding, so landscape phones narrower than about 740 px put the sheet under the notch (measured: left edge at x=30 with 47 px insets). The audit's only safe-area case ran at 812 px, where the sheet is centred and the check passed without testing anything | Per-side `max(1.5rem, env(safe-area-inset-*))` in the wide block; contract test forbids the shorthand; the audit now measures at 667×375 (where the insets constrain the sheet), 812×375 and portrait, and records the sheet width |
| R3 | Medium | At 320×568 with 200% text the two-column action row spanned 174–863 px in a 568 px viewport: "Apply correction" was off-screen and unreachable while the body was squeezed to 48 px | `.sheet-actions` uses `auto-fit minmax(min(100%, 9rem), 1fr)` (one column when narrow or large); `.sheet-footer` gets a `max-height` of 40% of the visible height with its own scroll as a backstop; `legend` and `.stepper-controls` wrap. Audit scenarios at 320 px/150% and 375 px/200% gate; 320 px/200% is recorded as non-gating (see Non-blocking notes) |
| R4 | Medium | Audit could pass vacuously: the zoom and safe-area scenarios swallowed exceptions or ran zero checks; the "background inert" check used `.every()` on a possibly empty list | Every scenario runs through one wrapper: an exception, an emulation the browser cannot perform, or zero executed checks is a **failure**; the inert check requires at least one sibling |
| R5 | Medium | The "on-screen keyboard" case shrinks the layout viewport (Chrome Android `resizes-content`), where the visual-viewport hook correctly does nothing; the iOS case, the hook's whole reason to exist, is never exercised in a browser | **Accepted as a documented limit.** Headless Chrome cannot shrink only the visual viewport (`Emulation.setVisibleSizeOverride` was removed; confirmed by experiment). The script header now says so; the hook is covered in jsdom and its use of `--vv-*` in a real engine by pinch-zoom scenarios. Physical iPhone pass stays open in the handoff |
| R6 | Medium (process) | No handoff update, review record, or audit evidence | This file, `docs/evidence/sonnet-d-reskin/`, and the `CLAUDE_HANDOFF.md` update |
| R7 | Low | Focus-trap selector omitted `a[href]` and other focusables; hidden or collapsed controls at either end could make the trap swallow Tab | Selector widened; `isReachable()` drops `display:none`/`visibility:hidden` controls and anything inside a collapsed `<details>` (except its own summary). Test added and mutation-verified |
| R8 | Low | Root scroll lock removed by whichever of two stacked sheets closed first; inert set snapshotted at mount | Scroll lock is reference-counted (test with two stacked sheets). The mount-time inert snapshot is **accepted**: there is one dialog in the app and no dynamic body portals; noted in the component comment |
| R9 | Low | `height: var(--vv-height, 100vh); height: var(--vv-height, 100dvh)` is not a fallback pair (an invalid `var()` becomes `auto`, not the previous declaration) | vh base plus `@supports (height: 100dvh)` override; contract test |
| R10 | Low | `.stepper-value` (focusable spinbutton) measured 44 px, under the 48 px the file claims | `min-height: var(--tap)`; contract test |
| R11 | Low | Contract test named a universal button guarantee but inspected one grouped selector; "never disables page zoom" checked only the meta tag | Test now scans every `<button className>` in `apps/web/src` against the covered class set, and asserts `touch-action`, wide padding, footer backstop and `@supports` |
| R12 | Low | Mutating the focus-return order, deleting the viewport `resize` listener, or deleting the offset clauses all left the suite green | Three tests added (focus-return spy asserts the app is no longer inert when focus is restored; `resize` re-reveals the focused field; offset-only and left-only changes set `--vv-*`). All four mutations now fail a named test |
| R13 | Nit | `report.json` had reduced-motion "on/off" inverted; nothing asserted motion exists when allowed | Renamed `allowed`/`reduced`; positive control asserts `sheet-rise` when allowed |
| R14 | Nit | Hard-coded 812 in a viewport comparison | Uses the scenario viewport |
| R15 | Nit | `axe-core` resolved only through a transitive dependency | Clear error message pointing at `npm ci`. Not added to `package.json`: it is already installed as a dependency of `jest-axe`, and the change needs no lockfile churn |
| R16 | Nit | Removing the desktop scrollbar under `html.sheet-open` made the page jump | `scrollbar-gutter: stable` |
| R17 | Nit | The focus ring crossed the primary button's hard drop shadow at about 2.8:1 | Focused buttons swap the shadow for a 3 px ink band |
| R18 | Nit | The tilted table title lifted its right end by about 16 px into the top padding | `.table-screen` top padding raised to 2 rem |

### Second pass (fresh reviewer, against the fix)

The second reviewer ran `npm run check` on `c70333b` and it **failed** (`@typescript-eslint/require-await` in a test the resolution added; the author's earlier claim of clean lint came from grepping ANSI-coloured output). It also found a regression in the first fix and several test gaps. All were fixed in `d96ae0c` (and three nits in `32d0397`); the reviewer re-ran the gates and re-measured in real Chrome.

| ID | Sev | Finding | Resolution (as verified by the reviewer) |
| --- | --- | --- | --- |
| N1 | High (blocker) | `npm run check` exits 1: a test callback declared `async` with no `await` | `async` removed; reviewer's own `npm run check` exit 0, 651 passed / 11 todo (now 653 after the nit tests), `npm run build` exit 0 |
| N2 | Medium | `touch-action: pinch-zoom` (the fix for R1) forbids one-finger panning of a zoomed page: measured 0 px panned vs 201 px with `auto`, stranding the sheet's title/actions off the visual viewport | `touch-action: auto` on the backdrop; re-measured: pan 201 px, pinch 1 → 2.0, body scroll 223 px, `overscroll-behavior: contain` intact. Contract test forbids `none` and `pinch-zoom` |
| N3 | Medium | The R7 selector widening was untested (reverting the selector left the suite green) | Tests assert the trap itself cancels Tab for a trailing link and a contenteditable region; mutation-verified |
| N4 | Medium | The audit's non-gating allowance was per scenario, so a sheet-geometry failure was silenced | Per check: only `dialogInsideViewport` and `noPageOverflow` are non-gating for the 320 px/200% scenario; every other check there still gates |
| N5 | Low | The `checkVisibility` half of `isReachable` was untestable in jsdom | Test stubs `checkVisibility`; mutation-verified |
| N6 | Low | `isReachable` missed disabled fieldsets, inert subtrees and radio groups | Filters added with tests (each mutation-verified individually) |
| N7 | Nit | R3's wrapping rules had no contract assertion | Assertions added |
| N8 | Nit | Footer `max-height` used `dvh` without `@supports` | vh base plus `@supports (height: 100dvh)` override; the author's own test caught the first attempt placing the override *before* the base rule (base would win); order is now asserted |
| N9 | Nit | `scrollbar-gutter: stable` leaves the fixed backdrop 15 px short of the viewport on desktop | `100vw` did not fix it (reviewer measured 1265 of 1280). **Accepted**: the strip shows the page's own near-black background, invisible on this theme; the CSS comment now says so instead of claiming a fix |
| N10 | Nit | The tilted `h1` might clip into the top padding on wide layouts | Reviewer agreed with the author's analysis: the lift is text width × sin 0.6° ≈ 5-8 px, inside the 16 px padding; only the wide table title needed extra padding, and has it |
| N11 | Process | Handoff, review record and evidence uncommitted | Committed with the docs commit |
| P1-P3 | Nit | (verification round) `100vw` claim wrong; with no radio checked only the first is a tab stop; a disabled fieldset's first legend is not disabled | Comment corrected; both focus-trap cases fixed with tests in `32d0397` |

Reviewer-run gates on `d96ae0c`: `npm run check` exit 0 (651 passed | 11 todo), `npm run build` exit 0, 13 mutations each failing exactly one named test, and browser measurements (touch-action, safe-area at 667×375, footer cap, tap targets at 320/375 px and 100%/200% text) against a synthetic page linking the real stylesheet.

## Positive verification (first pass, by the reviewer)

- Behaviour: `CorrectionDialog`'s change detection, `handleApply` patch construction and `onApply(patch, reason)` are byte-identical in the diff; only the wrapper changed. Nothing touches `packages/*`, `templates/*`, `apps/functions`, rules, routing, projections or authorization; the diff is 10 files, all `apps/web`, `scripts/playtest`, and one README. No dependency or lockfile change, no secrets.
- IDs and names other tests and the smoke script rely on (`correction-heading`, `#correction-reason`, `#wrote-down`) are retained; the wrapping label with `htmlFor` does not double-toggle.
- Portalling the dialog does not lose axe coverage (the existing GM tests call `axe(document.body)` and `axe(dialog)`); the earlier F1 fix (`fieldset { min-width: 0 }`, `select { max-width: 100% }`) survives.
- Touch scrolling inside the sheet is not broken by the ancestor `touch-action` (measured with a synthesized touch scroll).
- No horizontal overflow at 320×568 and 375×812 with the real stylesheet, including at a 32 px root font.
- Every `<button>` is covered by a `--tap` rule; there are no `<a href>` links in `apps/web/src`. Exactly one `position: fixed` element, one `<details>`, six native `<select>`s, and no other pop-out pattern.
- Colour is never the only channel (icons and text on dice, dashed borders on disabled controls); a `forced-colors` block exists; halftone and tape overlays carry `pointer-events: none`.
- The contrast maths in the contract test is correct WCAG relative luminance.
- Licensing: text-only diff, no `@font-face`, no `@import`, no remote `url()`; only inline `data:image/svg+xml`; provenance recorded in `assets/generated/eat-the-reich/README.md`.
- `npm run check` passed (637 tests at the first pass) and `npm run build` passed.

## Non-blocking notes

- **320 px with 200% text-only scaling** is recorded but not gating. At that combination the unchanged, rem-padded console panels (`.step` > `.pending-action-card` > `fieldset` > `.gear-option`) leave under 70 px for a check-box row and overflow the page, which widens the mobile layout viewport; the sheet's own body reflows. This is a limit of the existing layout at an extreme combination, not of the sheet; browser zoom (which shrinks CSS pixels rather than growing rems) is unaffected and is covered by the 320 px reflow checks.
- **`page-has-heading-one`** (axe best practice): the player dashboard and the signed-out message screens have no `<h1>`. This is the open finding F7 from `docs/reviews/2026-09-18-staging-independent-playtest-review.md`, left for John; the reskin neither introduced nor fixed it.
- **iOS Safari** visual-viewport-only keyboard, physical devices, VoiceOver/NVDA and Windows High Contrast were not verified by anyone (see `docs/evidence/sonnet-d-reskin/README.md`, "Limits").
- Staging Hosting still serves the pre-reskin build: a later, explicitly authorized redeploy is needed for anyone on the deployed URL to see any of this.
