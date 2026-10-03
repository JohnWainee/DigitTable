# Independent review: dock under a zoomed or short visual viewport (2026-10-03)

- **Scope:** `sonnet-dq/reskin-fresh-20261003` after `888e5e1`: `ActionDock` `data-unpinned` (pinch-zoom or short visible height), CSS release rule, tests, self-test and audit scenario.
- **Reviewer:** one fresh read-only subagent (not the author, Sonnet 5.5). Verdict: **approve with fixes**; no High findings; 11 mutations run, 10 killed.

| # | Sev | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Medium | The 20rem visible-height limit scaled with the root font size: at 200% text every phone <= 640px tall would be permanently unpinned, undoing the capped, scrolling `data-clipped` dock | Limit is now a fixed 320px (`UNPIN_BELOW_PX`), the basis of `@media (max-height: 20rem)`; test pins that a 568px phone at 200% text stays pinned |
| 2 | Low | Root font and `innerHeight` read only on viewport `resize` | Accepted: pinch and keyboard both fire `resize`; font size no longer enters the rule |
| 3 | Low | Mutation M5 (listen to `scroll`) survived | The fake records event types; test asserts exactly `["resize"]` |
| 4 | Low | While unpinned and zoomed, the button sits at the panel end; audit proves state, not reachability | Accepted and documented: in-flow beats a bar wholly off-screen; real-device check remains |
| 5-7 | Nit | Leaked `innerHeight` stub; dead `typeof window` check; lying `never` return type | All fixed (`innerHeight` descriptor restored; check removed; real return type) |

Reviewer also verified: listener lifecycle, no ResizeObserver feedback loop (`data-clipped` recomputes when unpinned), cascade and specificity (0,2,0 over the base, dvh override and media blocks; `html:has` ordering), scope limited to `apps/web` presentation, scripts and docs.

Caveat: the full `ui-audit.mjs` run (3,400 controls, 4 pinch scenarios) predates fix 1; after it the gates rerun were `npm run check` (803 passed, lint clean), build and `ui-audit-selftest.mjs`. At default text size fix 1 is behaviour-identical (320px = 20 x 16).
