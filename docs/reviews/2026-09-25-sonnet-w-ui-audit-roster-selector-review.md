# UI-audit roster-selector repair — independent review

- **Date:** 2026-09-25
- **Branch:** `sonnet-w/reskin-audit-20260925`
- **Reviewed change:** uncommitted follow-up to `5cdee1a`
- **Reviewer:** fresh independent Sonnet review, read-only
- **Verdict:** **approve**; no P0/P1 findings

## Scope

The local real-browser UI audit stopped before modal coverage because its
`openCorrection()` helper selected a roster row by the retired visible
placeholder name `Rook`. The sourcebook roster now displays Iryna while
retaining the stable internal `rook` ID, so the geometry audit never reached
its correction-sheet, keyboard, safe-area, zoom, or reduced-motion cases.

The repair selects the first enabled exact-text `Correct` button inside
`.roster-panel-list`, making the audit depend on the generic GM correction
affordance instead of a content name. A Vitest regression pin rejects the old
`^rook` selector pattern.

## Review result

`RosterPanel.tsx` renders one enabled `Correct` button for every sheet, and
the downstream modal audit has no character-specific assumptions. Choosing
the first roster entry therefore continues to exercise the same sheet
containment, control-size, scroll, focus, zoom, safe-area, and motion
behaviour for any shipped roster order or display name. The repair changes no
production UI, template, engine, functions, authorization, projection, or
privacy surface.

The reviewer confirmed that the visible-name change, not the stable `rook`
identifier, caused the stale audit trigger. It found no blocker.

## Non-blocking note

The Vitest regression is intentionally a source-level pin; it prevents the
specific stale-fixture pattern but does not execute the audit selector against
a DOM. That is a P2 test-design limitation, not a current defect: the
completed real-browser audit is the runtime proof and passed every scenario.

## Verification

- `npm run check` — pass: 692 active tests, 11 todo.
- `npm run build` — pass; existing Vite chunk-size warning only.
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — pass:
  18 testing-package, 86 Functions, and 4 web tests.
- `node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4174 --label post-utility-item-fix-complete --out /private/tmp/digitable-sonnet-w-post-utility-ui-audit-complete --port 9747` — pass: 150 states, 14 modal scenarios, 1,530 controls, and zero hard findings. The report is retained at `/private/tmp/digitable-sonnet-w-post-utility-ui-audit-complete/report.json`.

No merge, deploy, production resource, or repository change outside the
reviewed audit harness, regression pin, handoff, and this review record was
made.
