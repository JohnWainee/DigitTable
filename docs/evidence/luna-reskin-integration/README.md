# Luna reskin integration evidence

This folder records the integrated presentation-only candidate on branch `luna-reskin-integration-20261009`.
It combines the ink-black responsive reskin/word-integrity line (`6cf8647`) with the reviewed
native-select replacement and remediation (`7220ad4`, independently re-reviewed at `ae633ad`).

## Before and after

- The original before/after sets from the independently reviewed candidates remain under
  [`../ic-reskin-20261009/`](../ic-reskin-20261009/) and [`../fq-reskin/`](../fq-reskin/).
  They include phone, tablet, desktop, and table-width captures across GM, player, and table flows.
- [`after-verified/`](after-verified/) is the final integrated headless-browser audit output, including focused GM picker,
  sheet, keyboard-short, responsive, and flow screenshots plus `report.json`.
- [`two-device-verified/`](two-device-verified/) records the local emulator-backed GM/player/table playthrough.
  The report's generated room code is redacted; no production user or secret data is present.

## Integrated checks

- `ui-audit.mjs`: 150 states; 1,470 controls; zero picker/control issues, horizontal-overflow
  states, hard axe violations, and flow failures. One best-practice `page-has-heading-one`
  warning is limited to the intentionally invalid-room route.
- All six GM pickers were checked across six emulated sizes. At 360×300, all six require option-list
  scrolling to reach the final choice; the pinned current-selection context remains visible before
  and after that scroll, and the final option remains reachable.
- `two-device-smoke.mjs --reload`: all 17 GM/player/table steps passed, including create/join,
  claim, action/roll/allocation, pause/resume, scene advance, and player reload recovery. No
  horizontal overflow at 375, 768, 1024, 1280, or 1920 CSS px for any role.
- The Firebase Emulator Suite passed from a temporary copy configured on remapped local ports:
  18 rules, 86 Functions, and 4 web tests. The normal ports were owned by a different worktree and
  were left untouched; no tracked Firebase configuration was modified for the remapped run.

## Limits

The browser audit emulates layout sizes; it does not reproduce the shrinking visual viewport from
dynamic browser chrome or a real mobile on-screen keyboard. Physical iOS/Android testing remains
open. This was not a staging deployment or staging playthrough; the changed build remains
undeployed pending John's authorization.
