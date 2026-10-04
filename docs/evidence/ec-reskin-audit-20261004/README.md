# Reskin / pop-out audit and 6-member table fit, lane `sonnet-ec` (2026-10-04)

Base: `0cb3d19` (`sonnet-eb`). One presentation-only change (`apps/web/src/styles.css`, one contract-test update);
no authority, authorization, projection, engine, Firebase, asset, deploy, merge, secret or staging write.

## Audit result

Independent audit of every pop-out pattern (native `<select>` with in-page "Selected" echo, the Compose "Why?"
`<details>`, the single modal `SheetDialog`, the sticky `ActionDock`, inline allocation/target radio lists) against the
brief (near-black ink, riot-red/acid/cyan/pink punk accents, distressed zine texture, bold hierarchy; contrast,
44px targets, safe area, internal scrolling, reduced motion, state semantics, projection isolation). No anchored
popover, menu, listbox or datalist exists, so nothing can clip. The sheet and dock follow the visual viewport and
scroll internally. **No pop-out defect found.** Real-browser results below match the previous lanes' baseline.

The one concrete open item carried from `dz`/`eb` was real: a six-member party on the 1920x1080 table display
rendered 1118px tall (the wall display cannot scroll). Cause: route map capped at 38rem (608px) and banner at 18rem
(288px). Now 34rem / 15rem at >= 110rem only.

| Capture (page height) | before | after |
| --- | --- | --- |
| table 1920x1080, six-member party | 1118 | **1080** (fits, ~80px spare; one capture) |
| table 1920x1080, idle / next scene | 1080 | 1080 |
| desktop 1280x800, six-member party | 1145 | 1145 (unchanged; the rule is >= 110rem only) |

Phone, tablet and desktop CSS is untouched: inferred from the edit sitting inside `@media (min-width: 110rem)`, not re-measured (the desktop 1145 figure is from the baseline run).
`before/` has the two changed captures; `after/` has representative phone 375 / landscape 812x375 / small 320 /
tablet 768 / desktop 1280 / table 1920 captures (the JSON report carries all 288 states).

## Gates (all on this commit's source)

| Gate | Result |
| --- | --- |
| `npm run check` | exit 0: 805 passed, 11 todo (80 files, 1 skipped); contract test updated to 15rem / 34rem |
| `npm run build` | passed (existing chunk-size warning) |
| `ui-audit.mjs` before (unchanged code) | 288 states, 3,416 controls, 0 failures (`ui-audit-before.log`) |
| `ui-audit.mjs` after | 288 states, 3,336 controls, 0 control issues, 0 overflow, 0 hard axe violations, 87 keyboard-focus + 315 dock-focus checks, 4 pinch scenarios, 8 validation scenarios, 23 sheet cases, 0 failures. One best-practice note: `page-has-heading-one` on the intentional no-such-room route. |
| `ui-audit-selftest.mjs` | passed (`selftest.log`) |
| `two-device-smoke.mjs --reload` | ALL STEPS PASSED, incl. no horizontal overflow at 375/768/1024/1280/1920 (`smoke.log`) |
| Emulator suites (APFS clone, ports remapped to 47xxx in the clone only) | 18 rules + 86 Functions + 4 web passed (`emulator-suite.log`, repeated "callable verification" debug lines removed) |

The control and dock-focus counts differ between the two runs (3,416/405 vs 3,336/315); the 80-control difference was not investigated (before and after ran on different code and live flows), so no conclusion is drawn from the counts; both are 0-failure. The `dz` run recorded 3,336 as well.

## Stack and one disclosed leak

Live stack on remapped ports 27xxx (auth 27099, Firestore 27080/27081, RTDB 27000, Functions 27001, hub 27400,
preview 27274, Chrome 27350/27333), demo project `demo-digitable`, bundle built with a throwaway Vite config that
swaps only the three client port numbers (kept untracked/outside the repo while formatting ran).

**Disclosure:** the first emulator-suite run in the clone left the testing package's hard-coded RTDB port at 9000
(a macOS `sed` has no `\b`), and a peer lane's emulator was listening there. The 18 rules tests therefore pushed
this repo's `database.rules.json` to that peer's RTDB emulator (project `demo-digitable`) and wrote a few
`smoke/ping` and `presence/...` keys. The first, leaky run's log was not kept. This was a process breach of the shared-emulator-ports rule. Nothing was killed or cleared by me; the rules file is the repository's own and
the data is emulator-only test residue, but a peer's in-flight RTDB test could have seen it. The suite was then
rerun with the port remapped (`packages/testing/src/emulator.ts` hard-codes 9000/8080/9099; remap it in a clone) and
that clean run is the recorded result. Worth a follow-up: make those ports configurable via env.

## Not covered (carried)

Physical iOS/Android, VoiceOver/TalkBack, iOS Safari keyboard (visual viewport shrinks, layout viewport does not),
real WebKit pinch, browser-chrome collapse, a real TV at viewing distance. Staging was not re-run or touched; the
deployed baseline is `docs/evidence/dt-staging-playthrough-20261004/` (17/17 at `9ee8aa5`, predates the dock and
table changes) and was verified by reading its README and report, not re-executed.

## Old staging rerun evidence, verified (not re-run, not deployed)

The machine-local report `/private/tmp/digitable-staging-playthrough-20261004/report.json` (referenced by
`dt-staging-playthrough-20261004/README.md`) still exists and was read: `ok: true`, `finishedAt`
`2026-10-04T01:26:10.612Z`, 17 steps with none failing, base `https://digitable.signal-bleed.com`. It matches the
committed README. It is evidence about the deployed build only; that build predates the dock, visual-viewport and
table-fit changes, so it says nothing about this branch.

## Not measured

Table states with long titles, 3+ threats, the Paused line, current-roll dice or the Acting list at 1920x1080 with six
members were not captured. The change only removes height, so none can be taller than before, but only the idle and
six-member states are proven to fit.
