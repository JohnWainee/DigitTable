# Independent review: real Safari on an iPhone SE, emulator Firestore transport and rig fixes, lane `sonnet-eh` (2026-10-04)

- **Subject:** `sonnet-eh/reskin-orchestrated-20261004` on base `a0e8f36`: `apps/web/src/firebase/firestore.ts` (long polling only when an emulator host is given), its unit tests, the iOS Simulator rig (`SafariFlowUITests.swift`, `run.sh`, README), contract tests, `docs/PLAYTEST_TWO_DEVICE.md`, evidence in `docs/evidence/eh-reskin-audit-20261004/`, handoff.
- **Reviewer:** one fresh general-purpose subagent with no access to the author's reasoning, instructed to be adversarial and read-only (no edits in the worktree, no browsers, Simulators, emulators or builds; scratch under its own job directory; ports 47371-47379 only). It ran the touched vitest files, prettier, eslint, `bash -n`, and negative controls against the old files by reading and by node replicas of the contract regexes. It was resumed once for pass 2. The author, not the reviewer, made every edit.
- **Verdicts:** pass 1 approve with fixes (no blocker); pass 2 approve with fixes (no blocker; wording and stale-log fixes). Scope check (reviewer): no authority, authorization, projection, engine, rules, Firebase-config, secret or licensed-content change; the emulator branch is dead at runtime in a deployed bundle (`emulatorConfigFor` returns `undefined` unless `VITE_FIREBASE_USE_EMULATOR === "true"`, set only by `scripts/playtest/lan-up.sh`).
- **A second Claude session shared this worktree.** It proposed and the author accepted a split (this lane owns edits, commits and the push; the other stays read-only); it made no edits that appear in `git status`.

## What the reviewer could not disprove

- `initializeFirestore` cannot throw in any current path: the only Firestore caller is `getRoomFirestore` (`FirebaseRoomRepository.ts`), with one constant emulator config per page; the throwing case needs a no-emulator call before an emulator call on the same app. The hazard is now documented in the function's comment. A repeat `initializeFirestore` with identical options returns the existing instance (Vite HMR safe).
- Forcing long polling changes only the WebChannel transport: no token, rules, projection document or listener path changes.
- Negative controls: the three emulator-branch unit tests fail on the old `firestore.ts`; every new contract assertion fails against the old Swift file and the old `firestore.ts`.
- Evidence counts match the logs (30.1 / 1.1 / 1.1-1.3 / 4.1 s, ui-audit 3,320 vs 3,336 controls and 6 findings with `exit 1` on both, emulator 18 + 86 + 4, staging `5e8907b`/`index-D8nuHDtl.js` as recorded in `docs/RUNBOOK.md`, 17 smoke PASS lines).

## Findings and dispositions

| # | Pass | Severity | Finding | Disposition |
| --- | --- | --- | --- | --- |
| S1 | 1 | should-fix | The headline timings were in no committed log | Fixed: `ios/base-default-transport/`, `ios/probe-forced-long-polling/`, `ios/candidate/` (+ `RESULTS.txt`), `ios/staging/`, `ios/typing-diagnosis/` |
| S2 | 1 | should-fix | Claims stronger than the evidence ("Safari cannot stream", "iPad", "Safari only", LAN, cause) | Fixed: wording now says iOS Simulator, cause unestablished, physical devices and LAN not measured; notes the SDK already auto-detects long polling (so the auto-detect did not engage) |
| S3 | 1 | should-fix | A coordinate tap does not scroll the field into view | Fixed: `if !f.isHittable { bringIntoView(f) }` |
| S4 | 1 | nit | `bringIntoView` comment overclaimed; no settle; partly-clipped element scrolled the wrong way | Fixed: `minY < area.minY`, settle sleep, comment softened |
| S5 | 1 | nit | Hard-coded 20 s budget includes Functions latency | Fixed: `DIGITABLE_SCENE_BUDGET` (default 20), passed through `run.sh` |
| S6 | 1 | nit | Over-fitted contract assertions | Fixed: budget range 5-29, tap offset <= 0.35 plus the scroll guard, no auto-detect ban, regex instead of exact text |
| S7 | 1 | should-fix | Evidence directory 108 MB (751 JPGs); audit exit 1 must not read as a pass | Fixed: about 12 MB (`report.json` x2, logs, 42 screenshots); the README and handoff state the candidate audit exits 1 on 6 known findings, identical to base |
| S8 | 1 | nit | Ordering hazard undocumented | Fixed: comment in `firestore.ts` |
| S9 | 1 | process | Handoff and this record | Done in this commit |
| E1 | 2 | should-fix | The capsule explanation did not match the geometry (capsule frame at y 334, field centre 316.5); the fix changes horizontal and vertical offset together | Fixed: README, handoff, Swift comment and contract-test comment now say what was measured (upper-part taps focus every time; centre taps and a tap at 90% height fail; Safari's UI sits just below) and that the mechanism is not established; the horizontal offsets used are recorded |
| E2 | 2 | should-fix | "Emulator suite runs long polling in Node" is false (Node uses gRPC) | Fixed: reworded to "passes with the new initialisation; long polling itself is not exercised there" |
| E3 | 2 | should-fix | `check`, `build`, `selftest` logs older than the final tree | Fixed: all three rerun on the final tree (837 passed, 11 todo; build exit 0; selftest passed) and the logs replaced |
| N1 | 2 | nit | Candidate logs had no pass/fail lines, final-rig devices unmarked | Fixed: `ios/candidate/RESULTS.txt`; SE 3 and iPhone 17 Pro were rerun on the final Swift (3 of 3 each); iPad mini and iPhone 17e are marked as ran before the review's edits |
| N2 | 2 | nit | `bringIntoView` always slept | Fixed: sleep only after drags |
| N3 | 2 | nit | Table cells (17e range, run counts, file names) | Fixed |

## Author-side corrections made before and during review (for the record)

- My first reading of the SE failure blamed a layout shift from inline validation; reading `inlineValidation.tsx` showed errors render only after a failed submit, and the next diagnostic run (field and keyboard frames per tap) showed the keyboard disappearing on the tap itself.
- The first full SE 3 run failed twice on `scene loaded` with a 30 s wait; logging the delay showed it was the 30.1 s fallback poll, which led to Finding 2 rather than to a larger timeout.
- Two lingering `xcodebuild` processes from failing runs were killed by this lane's device id; one concurrent second run on the same device was started by mistake and killed at once.

## Not verified by the reviewer

Any Simulator, Safari or emulator behaviour first-hand (it ran none; it relied on the logs), whether the Swift compiles (the Simulator runs are the compile check), whether the capsule's touch area exceeds its accessibility frame, the 829 base test count, physical devices and the LAN path.
