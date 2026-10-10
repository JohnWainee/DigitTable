# iw reskin integration independent review

- **Date:** 2026-10-10
- **Reviewed range:** `b599abd..cd92f3a` (`sonnet/iw-reskin-orchestrated-20261010`)
- **Reviewer:** fresh Codex review pass; not the implementation author
- **Verdict:** approve; no blocking, high, or medium finding.

## Scope and invariants

This review covers the consolidated ink-black/punk presentation, the replacement of six GM native selects with the shared `OptionPicker`, shared sheet behaviour, Back dismissal, responsive layout, and their tests/evidence. It confirms the diff is confined to web presentation, tests, evidence, and handoff/provenance documentation. It does not change engine decisions, contracts, template rules, platform authorization, Firestore/RTDB rules, authority records, event destinations, or viewer projections.

## Findings

No actionable issue found.

- Each picker closes into a `SheetDialog`, not an anchored popover; the trigger and the sheet's pinned context both retain the field/current selection outside the scrollable list. Option rows remain real buttons, wrap long labels, and use the shared 48 px target treatment.
- `SheetDialog` continues to use the visual viewport, safe-area-aware layout, internal body scrolling, inert background, focus trap/return, Escape, scroll lock, and focused text-entry reveal. `useBackDismiss` owns a same-URL history entry and preserves the topmost-sheet rule, including StrictMode and late-pop regressions.
- Tests cover picker selection/context/clearing/focus/axe, all GM call-site state transitions, Back dismissal edge cases, closed/open contrast and responsive contract rules. The committed evidence includes phone, tablet, desktop, and table captures plus the 360x300 short-viewport picker scenario.
- Existing provenance records confirm the distressed-print treatment is procedural CSS and uses no new licensed art or game text.

## Verification reviewed

The reviewer reran `npm run check` successfully: format, lint, all workspace typechecks, **732 passed / 11 todo** tests across **76 passed / 1 skipped** files. `npm run build` and `git diff --check b599abd...HEAD` also passed; the only build output was the documented Vite chunk-size warning.

The exact candidate's existing isolated evidence records a successful remapped-port emulator suite (**18 rules + 86 Functions + 4 web**), `ui-audit.mjs` (**150 states, 1,470 controls, zero hard axe/control/overflow failures**), and `two-device-smoke.mjs --reload` (**17/17** local emulator-backed GM/player/table steps). A new default-port emulator attempt was blocked before tests by another lane occupying 9099/8080/9000, so it is not represented as a pass or failure of this candidate.

## Residual limits

Headless browser viewport emulation cannot substitute for iOS/Android dynamic browser chrome, real on-screen keyboard, physical assistive technology, or Windows High Contrast. The reskin remains undeployed; a changed-build staging playthrough needs John’s explicit deployment authorization.
