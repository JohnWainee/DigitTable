# hi lane: 320 px + 200% text overflow — independent review (2026-10-07)

Scope: `apps/web/src/styles.css` (viewport-capped horizontal padding/gap), `scripts/playtest/ui-audit.mjs` (closed-console text-scale scenarios; 320/200 open-sheet checks now gate). Presentation/test only.

Reviewer: separate read-only agent pass (not the author). Outcome: **no blocking findings.**

- Arithmetic of every `min(Nrem, Nvw)` checked: unchanged above ~457 px wide; phones below that get slightly tighter padding (375 px: panel 13.1 px vs 16 px). Safe-area `max()` still lets a larger inset win.
- Audit scenarios test the root cause (`noPageOverflow`, `layoutViewportUnwidened` failed before the fix) and always execute at least one check.
- Residual risk (accepted, recorded): only the GM console is exercised at 320/200; player and table surfaces (e.g. `details ul` 2rem left, `.secondary-action` 1.25rem) were judged fine by reading CSS, not measured.
