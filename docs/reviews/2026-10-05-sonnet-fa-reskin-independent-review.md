# Second ink-black reskin pass and pop-out audit: independent review

- **Date:** 2026-10-05
- **Branch:** `sonnet-fa/reskin-orchestrated-20261005` (from `main` at `b599abd`)
- **Range reviewed:** `b599abd..6ee7b01`; the author's resolution is the following commit.
- **Reviewer:** one independent Claude (Opus) review agent in a fresh context, with no access to the author's reasoning. It worked read-only on the worktree, in a `cp -cR` clone under `/private/tmp`, and ran `npm run check` and `npm run build` itself (both exit 0; 698 tests passed, 11 todo) and mutation-tested `useBackDismiss`.
- **Verdict:** no High findings; nothing outside presentation (plus the declared history behaviour); one Medium and several Low/Nit items, all dispositioned below.
- Evidence: [`docs/evidence/fa-reskin/`](../evidence/fa-reskin/README.md).

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | Medium | Viewport caps on h1/h2/buttons/legends stopped text growing at 200% on phones (button 131%, h2 128%); the "0 failures at 200%" partly came from not enlarging text, and the audit could not tell | **Fixed.** Caps loosened (`17vw`/`12vw`/`10vw`/`6vw`), action-row indent eased (`9vw`), and `ui-audit.mjs --root-font` now **fails** if button text has not grown at least 1.5×. 200% sweep re-run with that check: 0 failures. Residual stated honestly: capped display type still enlarges less than 200% on a 320 px phone (the alternative is mid-word breaks) |
| 2 | Low | The scuff `::after` painted over panel content, tinting text/controls; composite contrast (grain + scuff + glow) fell to ~3.4:1 for muted text, which axe reports as "incomplete" and the palette test never saw | **Fixed.** `z-index: -1` inside `isolation: isolate` panels (beneath content), grain alpha .22 → .18, corner glow .16 → .10; contract test asserts the layering. A composite-contrast measurement test was **not** added (jsdom cannot render it); the rendered-pixel contrast of text over grain is not measured in this lane and is listed as a limit |
| 3 | Low | A route change while the sheet is open (or reload with it open) leaves a dead marked history entry | **Mitigated.** `dropStaleSheetEntry()` runs at router start and on every hashchange and strips the marker when no sheet is mounted; tested. The duplicate same-URL entry itself cannot be removed from history, so one extra Back may land on the same screen in that rare path |
| 4 | Low | Tests missed Escape, Apply, route change, Back twice, Forward | **Partly fixed.** Added Escape, Back-twice and stale-entry tests (all mutation-checked by the reviewer's classes of mutation). Apply and Forward are not separately tested (Apply closes through the same unmount path as Cancel/Escape) |
| 5 | Low | Left screen gutter still `max(1rem, …)` while top/right use `--gut` | **Fixed** |
| 6 | Low | Button side padding and an h2 cap changed the 100% phone layout contrary to the README | **Fixed.** Padding cap `5.4vw` (unchanged from 370 px up), h2 cap `12vw`; README corrected |
| 7 | Low | No handoff / review record | **Fixed** (this file; `CLAUDE_HANDOFF.md`) |
| 8 | Nit | The option-row contract test asserted a rule the real button does not use; `gear-option-action` sits in the "covered" set | **Fixed** the assertion (now asserts `.gear-option-action { flex: 1 1 100% }`). Left the covered-set entry: the button also carries `secondary-action`, which owns the tap rule |
| 9 | Nit | The action button sits inside the `<label>` (nested interactive content, predates this change) and its indent area toggles the checkbox | **Accepted, not changed.** Moving the button out of the label changes DOM structure and accessible names beyond a reskin; the reviewer confirmed the accessible name is unchanged by this pass. Recorded as a follow-up |
| 10 | Nit | Forced colors: the dashed cut line outline becomes a second border; three panel types kept their scuff layers | **Fixed** (outline removed, all five `::after` hidden; contract test) |
| 11 | Nit | Audit: `history.length` check vacuous; `--root-font abc` silently ran at 100%; words under 5 letters skipped | **Fixed** the first two (the check is now the `history.state` marker only; the flag is validated). The 5-letter floor is deliberate (short words rarely wrap mid-word) |
| 12 | Nit | `useBackDismiss` edge cases: one module-level release slot, nested sheets, re-open within the deferred `back()`; README implied the typed reason survives; iOS swipe-back unverified | **Accepted** for a single-sheet app (documented in the hook); README wording corrected; iOS swipe-back remains unverified (see evidence README "Limits") |

## Verified correct by the reviewer

StrictMode reuses one history entry; Cancel/Escape pop it; a same-URL Back fires no `hashchange`; `replaceRoute` while open is safe; no other `popstate` listeners exist; the only consumer is `CorrectionDialog`; every absolutely positioned decorative pseudo-element has `pointer-events: none`; `.gear-option > span` matches only the GM "Reveal" row; flat-token contrast assertions pass with the darker ink (paper on riot-deep 4.59:1); the new action button is ≥48 px; no new animation; the focus ring is unchanged; forced-colors emulation was active in 150/150 states; no change to authorization, projection or privacy; no licensed content.

## Author's gates after resolution

See `CLAUDE_HANDOFF.md` ("Reskin pass sonnet-fa") for the exact commands and results.
