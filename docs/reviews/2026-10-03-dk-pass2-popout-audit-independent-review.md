# Independent review: pop-out and dock audit, pass 2 (2026-10-03)

- **Scope:** `sonnet-dk/reskin-orchestrated-20261003` after `08d00cd` (sticky action dock). The brief described uncommitted changes from a vanished session; the worktree was clean and the dock work was already committed, pushed and reviewed (`2026-10-03-dk-action-dock-independent-review.md`). This pass re-audited the committed state across every pop-out (native `<select>` plus echo, `<details>`, `SheetDialog`, dock) and fixed what it found.
- **Reviewers:** two fresh read-only subagents in separate worktrees, neither the author (Sonnet 5.5, this session). Reviewer A audited `08d00cd`; reviewer B audited the fixes (`ac2406e`).

## Reviewer A (on 08d00cd): three Low findings, all fixed

| # | Finding | Resolution |
| --- | --- | --- |
| 1 | Opening Compose "Why?" grew the page under the pinned dock; list hidden behind it (3 of 4 items at 844x390) | `revealOpenedDetails` scrolls the opened details into view (scroll-padding clears the dock); jsdom test |
| 2 | 320x568 at 200% text: dock content 828px in a 256px cap; buttons below the fold and `overscroll-behavior: contain` trapped swipes | `ActionDock` sets `data-clipped` while content overflows; CSS puts actions first then; `contain` removed; self-test cases 320x568@32px and 375x667@24px (fail without the rule) |
| 3 | Escape cancelling an IME composition closed the Correction sheet (lost edits) | `isComposing` / keyCode 229 guard, test |

## My own finding while auditing

`ui-audit.mjs` had recorded "320px + 200% text: dialogInsideViewport / noPageOverflow" as **non-gating** for a long time. The offender was this increment's GM pending-action card (five nested rem paddings left a check-box row 63px wide and widened the page by 8px). Nested inline padding on the card is now capped in px; the case **gates**.

## Reviewer B (on ac2406e): two Low findings, both fixed

1. The GM card's dock at 320x568 / 200% text (180px wide dock, rem-sized button padding) still cut "Roll it" to ~228 of 292px. Fixed with px caps on the card dock's and its buttons' inline padding; new self-test cases for a GM card at 320x568 with 32px and 24px text (verified to fail with the caps removed).
2. Two fix parts had no biting test: the dock observing its children, and the card's padding caps. Added an assertion on the observer's targets and contract tests for every cap.

Reviewer B also verified: no `data-clipped` oscillation (40 random resizes, two toggles, no ResizeObserver loop error), focus order and WCAG 1.3.2/2.4.3 unaffected, dock bleed exact against the card's inner border edge at 320/375/1280 at normal and 200% text, eight mutations caught by tests.

## Accepted / not changed

- At normal text the GM card padding drops from 13.6px to 12px (cosmetic).
- When the dock is `data-clipped` the disabled-reason status sits below the actions, below the fold inside the dock.
- Physical iOS/Android and assistive-technology rehearsal remain open (see handoff).

## Verdict

Approve after the fixes above; final gates in `docs/evidence/dk-pass2-20261003/README.md`.
