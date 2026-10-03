# Independent review: reskin verification and smoke-harness repair

- **Candidate:** `sonnet-df/reskin-verification-20261002`, based on committed `2c5fe8e` (mobile pop-out hardening).
- **Authoring session:** Sonnet orchestrator `df`. **Reviewer:** separate read-only subagent pass, 2026-10-02.
- **Baseline note:** an earlier staging-playthrough session was blocked by port contention and left only untracked `/tmp` scratch output. No commit exists after `2c5fe8e`. That scratch output was not used as evidence.

## Findings

One defect, in the test harness. No product defect was found.

- `scripts/playtest/two-device-smoke.mjs` waited unconditionally for `#scene-reason` when advancing a scene. `SceneDirector.tsx` renders that field only while the primary Objective is incomplete (`canAdvance = primaryComplete || reason.trim() !== ""`). The smoke's earlier opposed roll uses random dice. In 1 of 5 live runs the roll completed the Objective, the GM screenshot showed "— complete", and the step timed out. The app was behaving correctly.
- **Repair:** the smoke sets the reason only if the field exists. A contract test in `auditHarnessContract.test.ts` pins this.
- No engine, contracts, template, Functions, rules, authorization or projection code changed.

## Reviewer verdict

**Approve.** Confirmed the diagnosis against `SceneDirector.tsx`, that `ev` returns a real boolean, and that the contract test fails on a revert. The only brittleness noted is its dependence on the step title text, which is minor.

## Evidence (local `demo-digitable` emulators, loopback only; nothing deployed)

- `npm run check` — 753 passed, 11 todo (baseline 752 plus the new contract test).
- `npm run build` — passed (existing chunk-size warning).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — 18 rules, 86 Functions, 4 web passed. Admin-SDK metadata `ETIMEDOUT/ENOTFOUND` warnings appeared but did not affect results.
- `ui-audit-selftest.mjs` passed. `ui-audit.mjs` — 216 states, 2,562 controls, 0 control issues, 0 overflow states, 0 hard axe violations, 87 keyboard-focus checks, 8 validation scenarios, 21 sheet cases, 0 failures. The two modal-text-200 phone-small geometry notes (320 px + 200% text) are the already-recorded non-gating limit. `page-has-heading-one` on the missing-room route is the existing non-gating note.
- `two-device-smoke.mjs`: before the repair, 1 failure in 5 runs; after it, 6 of 6 `--reload` runs passed all 16 steps.
- The audit covers selects with their echoed value, the correction sheet (phone, landscape, small phone, tablet, desktop, on-screen keyboard emulation, zoom, safe-area, reduced motion), allocation and injury panels, utility-item controls, and inline-validation forms. All passed.

## Residual limits

Headless Chrome cannot reproduce iOS Safari's visual-viewport keyboard behavior, real mobile browsers, screen readers, or Windows High Contrast. The physical-device and assistive-technology rehearsal in `docs/PLAYTEST_TWO_DEVICE.md` remains required before deployment or merge.
