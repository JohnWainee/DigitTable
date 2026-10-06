# fm: Back dismisses an open sheet (2026-10-06)

Lane `sonnet-fm`, base `6c12fbc`. Raw `report.json` files stay untracked (ephemeral room codes);
this is the redacted summary.

## Defect

`SheetDialog` (the single modal pattern: GM correction sheet) owned no history entry. With the sheet
open, browser Back (Android system Back, iOS edge swipe, desktop Back) navigated the hash router
away from the director console, destroying the sheet, any half-typed correction reason and the
console. The `45770b1` lineage does not contain the earlier reviewed fix for this (sibling lane
`218bfea` is not an ancestor); it was re-implemented here, not merged.

## Fix

`apps/web/src/shared/useBackDismiss.ts`, called from `SheetDialog`: one same-URL `pushState` entry
while mounted (fires no `hashchange`); Back pops it and runs `onClose`; Cancel/Apply/Escape release
it with a deferred `history.back()` only if `history.state` still carries this sheet's marker
(StrictMode-safe, per-mount uuid). Presentation only: no engine, contracts, template,
authorization, projection, Firebase, asset or dependency change.

## Evidence

- `apps/web/test/shared/useBackDismiss.test.tsx`: 4 tests; mutation-checked (2 fail with the hook
  disabled).
- `scripts/playtest/ui-audit.mjs` new `back-dismiss` scenario (phone 375x812). With the fix: all four
  checks true (sheet closed, route unchanged, console still mounted, background not inert); full audit
  **150 states, 1,494 controls, 0 control issues, 0 overflow states, 0 hard axe violations, 0 failures**.
  Negative control (hook disabled): `routeUnchanged` and `consoleStillMounted` fail, audit exits 1.
- `npm run check`: format, lint, typecheck, **702 tests passed** (11 todo). `npm run build`: passed
  (existing chunk-size advisory only).
- `npm run test:emulator` (`demo-digitable`, no production resource): **18 + 86 + 4 passed**.

## Not covered

No real iOS Safari / physical-device pass in this lane (open item for John). Leftover history entries
after a reload with a sheet open, or hash navigation while a sheet is open, cost one visibly inert
extra Back press; the app has one modal sheet and neither is reachable by a person today.
