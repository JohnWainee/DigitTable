# Independent review: `sonnet-ey` picker / pop-out audit of `b993f56` (2026-10-05)

Reviewer: a separate read-only reviewer agent (second pass, not the author). Scope: the diff of `scripts/playtest/ios-simulator/UITests/SafariFlowUITests.swift`,
`scripts/playtest/ui-audit.mjs` and `apps/web/test/playtest/auditHarnessContract.test.ts`, plus the evidence directory `docs/evidence/ey-reskin-audit-20261005/`.
There is no product source change: the audit found no legitimate defect in `b993f56`, so none was invented.

## Findings and dispositions
| # | Severity | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | nit | `UIDevice` used with only `import XCTest` | Fixed: `import UIKit` added; iPad Back rerun passed on the rebuilt bundle. |
| 2 | non-blocking | `arg()` returns the fallback for an empty/missing/`--`-prefixed value, so `--extra-viewports --no-shots` silently dropped the extras | Fixed: the flag present without a usable value throws. Verified. |
| 3 | non-blocking | Extra names not checked for collisions; an extra named `phone` would override `byName["phone"]` for the zoom/safe-area/contrast scenarios | Fixed: duplicate or standard names throw. Verified with `phone` and a repeated name. |
| 4 | nit | `-5x3`, `1.5x2`, a flag other than `m`, or names with `/` `#` passed validation | Fixed: size must match `^\d+x\d+$`, non-zero; the flag must be `m`; names `[A-Za-z0-9_-]+`; extra `:` segments rejected. |
| 5 | non-blocking | Comment said extras reach "the sheet containment cases", but a second fixed 3-viewport loop does not include them | Fixed: the comment now says `auditModal`'s cases and lists the scenarios that keep fixed viewports. |
| 6 | non-blocking | Contract tests are source-string checks (do not run the parser or the Swift logic) | Accepted, matching the rest of that file; the parser rejections were exercised by hand (5 bad inputs) and the Swift by the real iPad run. Two assertions added for the new throws. |
| 7 | non-blocking | iPad Split View / Slide Over toolbar differs; tapping the top pill on an already-expanded toolbar could focus the URL field | Accepted, untested; the evidence run passes on iPad mini full-screen Safari. Recorded as a limit. |
| 8 | advice | `firebase.ey.json` (lane-local port remap) should not be committed | Followed: deleted, not committed. |

No blocking finding. The reviewer did not compile Swift or run tests; the author's runs are in the evidence README.
