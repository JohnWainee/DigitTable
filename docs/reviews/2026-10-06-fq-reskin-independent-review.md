# fq reskin and pop-out independent review

- **Date:** 2026-10-06
- **Branch:** `worktree-digitable-sonnet-fq-reskin-uiux-20261006`, reviewed commit `b95d16c` (from `b599abd`)
- **Reviewer:** one fresh-context Claude subagent, read-only on the worktree, mutation scratch in an APFS clone. It ran the web suite (284 tests) and CSS/test mutations; it did **not** run the browser audit.
- **Verdict:** approve with nits; no High findings.

## Findings and disposition

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | Medium | `useBackDismiss` tests did not cover StrictMode or multiple sheets; 4 of 6 mutations survived (deferred pop, always-push, holders count, unguarded popstate) | Fixed: StrictMode, late-pop and two-sheet tests added |
| 2 | Medium | Apply that immediately opens another sheet: the deferred `history.back()` could pop the new sheet's entry and dismiss it | Fixed: `pendingPop` defers the new push until the pop lands; test added |
| 3 | Medium | With two concurrent sheets Back dismissed the bottom, not the top | Fixed: handler stack, topmost dismissed, entry re-pushed for the rest; test added (no screen opens two sheets today) |
| 4 | Low | `replaceRoute` (`replaceState(null)`) or a reload while a sheet is open leaves a stale same-URL entry; first Back then appears to do nothing | **Open, accepted:** rare, harmless (the entry is same-URL); noted for John |
| 5 | Low | Sheets are portalled to `<body>`, so `--sa/--sc` fall back to acid/cyan, not the GM's pink | **Open, accepted:** cosmetic; the sheet is deliberately the same loud acid/riot object on every surface |
| 6 | Low | Rotated h1/h2 might add ~1 px overflow at 320 px | Not reproduced: audit reports zero overflowing states at 320 px |
| 7 | Low | Dust at 20% could lift background under `--mute` text on speckle pixels to ~4.3:1 | **Open, accepted:** axe (real pixel contrast) reports zero violations across 150 states; the dust alpha was already cut from .55 to .2 |
| 8 | Low | Contract-test regexes fragile; a no-op `forced-color-adjust: auto` | no-op removed; regex fragility accepted |
| 9 | Low | Audit scenarios partly vacuous | Fixed: history length asserted at baseline/open/after; the short scenarios assert the container branch engaged (`overflow-y: auto`) |
| 10 | Nit | `data-testid` in production markup | Accepted (inert) |
| 11 | Nit | `font-weight` on checked rows reflows text | Fixed: removed |
| 12 | Nit | Table/recovery code casing | Verified: the client upper-cases both before sending (`JoinTableScreen`, `JoinScreen`), so `autoCapitalize="none"` only stops the keyboard altering what was typed |

The re-fix (hook rewrite, new tests, audit assertions) was verified by the full gates and a fresh real-Chrome audit; it was **not** re-reviewed by a second reviewer.
