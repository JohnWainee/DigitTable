# Action-feedback mobile visibility review (2026-10-02)

- **Branch:** `sonnet-cw/reskin-pr41-fresh-20261002`, based on `fc2217d`.
- **Scope:** GM director, player dashboard, and character-claim command feedback after a fresh read-only mobile/accessibility audit found that a rejection at the top of a long page could be out of the visual viewport after a lower-page control was activated.
- **Authority/invariants:** presentation-only. No engine, template, Functions, Firestore rules, authorization, projection, event, asset, or deployment behavior changed.

## Finding and remediation

The initial read-only Sonnet audit found one P1: long scrolling GM/player/claim surfaces left a rejected command's `role="alert"` near the document start, where a sighted mobile user could miss it after tapping a control lower on the page. Screen readers still received the alert, but the visual failure looked like an ignored tap.

The patch creates one labelled `ActionFeedback` region used by all three surfaces. It is `position: sticky` below the safe-area inset, keeps pending status and an error together, remains below the sheet backdrop (`z-index: 5` versus the dialog's 100), and caps long content at `min(40dvh, 18rem)` with internal scrolling and contained overscroll. It therefore preserves the control/page context instead of covering the full phone visual viewport.

Regression coverage includes a real GM `EndRound` rejection (`ROUND_HAS_OPEN_ROLLS`) and all three component branches: pending-plus-error, pending-only, and error-only.

## Independent review

Two fresh, read-only Sonnet passes inspected only the patch; neither edited files, ran commands, deployed, or merged.

1. The first pass found no blocking issue and raised two low concerns: duplicate feedback-branch coverage on player/claim surfaces, and a possible overly tall nested alert.
2. The revision consolidated all surfaces on the tested shared component and capped the sticky region with internal scrolling. The second pass confirmed the long-error concern is resolved. It noted that a future direct integration test could independently pin each screen's `error ?? lastError?.message` wiring; this is a test-depth follow-up, not a present product or invariant defect. The shared component's branches and the GM integration path are covered now.

**Outcome:** approved for this narrow presentation repair, with the direct player/claim error-wiring test retained as non-blocking follow-up coverage. Physical iOS/Android and assistive-technology rehearsal remains required before any release claim.

## Verification

- Focused tests: `npx vitest run apps/web/test/shared/ActionFeedback.test.tsx apps/web/test/gm2/GmDirectorFlow.a11y.test.tsx` — **11/11 passed**.
- Full gate: `npm run check` — Prettier, ESLint, TypeScript, **712 passed | 11 todo**.
- Build: `npm run build` — Functions and web passed; only the existing Vite chunk-size advisory.
- `npm run test:emulator` was attempted on this host but stopped before emulator startup because no Java runtime is installed (host Node is v24.21.0). The last complete candidate emulator record remains **108/108** under the expected JDK/Node setup; this presentation-only patch changes no emulator-side behavior.
- The deployed staging rerun from the same automation remains **17/17** but validates the deployed baseline, not this intentionally un-deployed patch.
