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
