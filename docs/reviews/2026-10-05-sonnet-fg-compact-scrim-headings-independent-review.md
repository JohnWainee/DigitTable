# Compact threshold, backdrop scrim and route headings: independent review

- **Date:** 2026-10-05
- **Branch:** `sonnet-fg/reskin-orchestrated-20261005` (from `4a91dd2`)
- **Reviewer:** one independent Claude review agent in a fresh context; read-only; ran focused vitest only (7 files, 102 tests passed). Did not run browsers or the iOS rig.
- **Verdict:** no Blocker, no High; presentation/markup only, AGENTS.md boundaries respected.
- Evidence: [`docs/evidence/fg-reskin/`](../evidence/fg-reskin/README.md).

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | Medium | `medium-keyboard-*` scenarios focus the field then shrink the viewport; compact mode may not re-scroll the field, so a label check could be flaky | Not changed: all 42 modal scenarios pass in three text sizes; the iPad rig run (real engine) confirms. Re-check here first if it ever flakes |
| 2 | Low | 288 px cutoff leaves ~20 px slack over the ~17 rem budget (wrapped actions between 288 and 300 px could clip) | Accepted; scenarios at 300/330 px pass |
| 3 | Low | rem-scaled threshold: 200% text under 576 px is compact; pinch-zoom enters compact earlier | Accepted, documented in the hook and README; 200% scenario updated |
| 4 | Low | Forced colors drops `box-shadow`, so the scrim fix does not apply in Windows High Contrast | **Fixed** (CSS comment states it); no regression vs. before |
| 5 | Low/Nit | Loading-state heading tests assert only the first render; Swift label match hard-codes the copy; scrim contract test is a string match | Accepted |
| 6 | Info | `two-device-smoke.mjs:358` h1 wait is on `#/` only, unaffected | None |

Verified by the reviewer: one `<h1>` per branch, no duplicate/skip; focus trap, inert, scroll lock and Back-dismiss independent of `data-compact`; shadow adds no overflow, is not hit-tested, does not double-dim; the threshold unit test and heading test fail on the old code.
