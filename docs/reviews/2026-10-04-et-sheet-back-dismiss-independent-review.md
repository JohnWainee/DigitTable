# Independent review: sheet Back-dismiss, lane `sonnet-et` (2026-10-04)

- **Scope:** staged diff on base `5ef9c2b`: `useBackDismiss.ts` + its `SheetDialog` hook-up + 8 unit tests + `sheet-history-probe.mjs` + iOS rig edits (carried by path from `sonnet-eq` `218bfea`), and this lane's `sheet-viewport-probe.mjs` and evidence.
- **Reviewer:** one fresh read-only subagent, separate from the author; static analysis only (ran nothing).
- **Verdict:** approve with fixes; no blocking findings.

| Finding | Disposition |
| --- | --- |
| Medium: viewport probe claimed assertions it lacked (backdrop upper bound, page not scrolling), left `pageScrolled` unused, passed when preview was `undefined` on both sides, 20px tolerance wider than the ~15px gutter. | **Fixed.** Backdrop bounded 16px below / 1px above, `rootLocked` (`html.sheet-open` + `overflow: hidden`) asserted, preview asserted non-empty; header comment corrected. Probes rerun: 17 passes on the fixed bundle; negative controls fail as intended. |
| Medium: README overstated; ui-audit runs not like-for-like (3,400 -> 3,320 controls, 473 -> 363 dock-focus). | **Fixed in text** (stated explicitly, cause unexplained, not investigated). |
| Low: probe Back/click lack user activation. | **Documented** in README limits; real-Safari test covers a genuine tap; sole caller is a tap. |
| Low: deferred `history.back()` vs immediate re-open race. | **Accepted**, documented; not reachable by a person. |
| Low: `popstate` closes on any marker-less popstate; leftover dead entries. | **Accepted**, harmless, already documented in the hook. |
| Info: StrictMode, Cancel/Apply/Escape, reload, stacked sheets correct; tests discriminate except the over-release guard; no authority/projection/privacy/a11y change. | None needed (guard test noted in README). |

Note: the hook is identical to `sonnet-eq`'s, which was reviewed separately there.
