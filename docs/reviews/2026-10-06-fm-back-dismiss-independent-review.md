# Independent review — sonnet-fm sheet Back-dismiss (2026-10-06)

Reviewer: fresh read-only subagent, separate from the author. Read the code and ran the shared tests;
did not run the app in a browser (the author's real-Chrome audit is in `docs/evidence/fm-back-dismiss/`).

**Verdict: APPROVE.** No P0/P1. AGENTS.md boundaries intact (only `apps/web/src/shared` and
`scripts/playtest`; engine, contracts, authorization, projection untouched).

| Priority | Finding | Disposition |
| --- | --- | --- |
| P2 | Cancel-release and "entry replaced" tests could pass without the fix (asserted only null state / hash). | Fixed: both now spy on `history.back` (called once; not called). |
| P3 | Chrome Android may skip `pushState` without user activation; future programmatic sheets would lose Back. | Documented in the hook's comment. |
| P3 | Route change while a sheet is open, reload with a sheet open, or a redirect can leave one dead same-URL entry. | Accepted; one visibly inert Back press, not reachable by a person today (one sheet, opened by tap). |
| P3 | `setTimeout(20)` in tests; audit could also press Back twice. | Accepted; 20 ms has been stable, second-Back probe left as a possible follow-up. |

Scenarios the reviewer verified correct on reading: StrictMode, `onClose` identity changes, Cancel/Apply/
Escape release, route navigation and `replaceRoute` while open, stacked sheets, Back-then-close.
