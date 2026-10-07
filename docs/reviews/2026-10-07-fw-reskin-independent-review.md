# FW reskin independent review

**Reviewer:** Codex recovery pass (not the implementation lane)

**Scope:** `ccb9f2d..97cc9c7` on
`sonnet-fw/reskin-orchestrated-20261007`.

## Verdict: approve source; hold release-complete status

The change is presentation and audit coverage only. It does not alter the
engine, contracts, template rules, Functions, Firebase rules, authority
records, projections, authorization, or source assets. No licensed content or
credentials were introduced.

The measured layout decision is appropriate for the reported mobile defect:
the sheet keeps a pinned header/footer only when its measured chrome plus a
usable body fit in the visible area; otherwise it becomes the sole scroller.
The hook observes the elements whose sizes can change, has a hysteresis margin
to avoid keyboard-resize flapping, cleans up observers/listeners, and restores
focus context after a layout change. The 320px/200%-text protections are
covered by focused unit/stylesheet tests and the browser audit now fails for
page overflow, hidden values without an echo, undersized targets, clipped
actions, or an incorrect layout choice.

## Verification

- `git diff --check ccb9f2d..97cc9c7` — passed.
- `npm run check` — passed: format, lint, typecheck, 736 tests passed, 11
  todo (75 files passed, 1 skipped).
- `npm run build` — passed; the existing Vite chunk-size warning remains.
- Evidence retained under `docs/evidence/fw-reskin/`: before/after phone,
  tablet, desktop, and table captures; large-text and keyboard captures;
  automated accessibility reports with zero hard axe violations.
- An alternate-port emulator recovery run passed the rules/testing harness
  (18 tests), then the Functions suite stalled amid another active Emulator
  Suite for `demo-digitable`; it is not counted as a full independent emulator
  pass. The implementation lane's retained report records 18 rules/testing,
  86 Functions, and 4 web tests passing on its isolated stack, but this review
  does not substitute that record for a rerun.

## Required before calling the candidate release-ready

1. Rerun `npm run test:emulator` with an isolated emulator project/ports after
   the competing lane releases its stack.
2. Run the candidate's local GM/player/table smoke against that isolated stack.
3. Complete a staging playthrough only after an authorized staging deployment;
   do not treat the currently deployed `ccb9f2d`-independent smoke as evidence
   for this un-deployed candidate.

The remaining physical-device, AT, Android font-scale, and Windows
High-Contrast limitations remain explicitly open and are not hidden by this
approval.

## Addendum (implementation lane, after this review)

Written by the implementation lane, not by the reviewer above; the review text itself is unchanged.

- The three items under "Required before calling the candidate release-ready" were taken up afterwards, on isolated ports (project `demo-digitable-fw`; the audits and the
  smoke ran against a private stack on 53xxx, the emulator suite on 54xxx):
  1. `npm run test:emulator` at the final tip: **18** rules/testing, **86** Functions and **4** web tests passed (exit 0).
  2. The local GM/player/table smoke (`two-device-smoke.mjs --reload`) against the candidate bundle and those emulators: **17/17** steps passed.
  3. A staging playthrough has **not** been done: the deployed staging build does not contain this branch and nothing was deployed. It stays open.
- The code reviewed here (`ccb9f2d..97cc9c7`) was followed by fixes after a second, independent pass; see
  [`2026-10-07-fw-reskin-independent-review-pass2.md`](2026-10-07-fw-reskin-independent-review-pass2.md) and
  [`2026-10-07-fw-reskin-independent-review-pass3.md`](2026-10-07-fw-reskin-independent-review-pass3.md). Two statements above need that context:
  "the browser audit now fails for ... an incorrect layout choice" held only for gross errors (ten hook mutants survived the first unit tests and five also
  survived the audit; the unit tests and the audit's flip scenarios were extended), and "restores focus context after a layout change" held for text fields
  only (a focused checkbox or button was left off screen after a flip; fixed and gated).
- The final `npm run check` is **750 tests passed, 11 todo** (this review recorded 736), and `npm run build` still passes with the same chunk-size warning.

