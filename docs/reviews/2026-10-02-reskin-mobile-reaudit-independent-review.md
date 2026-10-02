# Mobile pop-out re-audit: independent review

- **Date:** 2026-10-02
- **Branch:** `worktree-reskin-mobile-session-oct02b` (from `b599abd`)
- **Reviewer:** one fresh-context read-only Claude review agent (no access to the author's reasoning; no edits, commits or emulators).
- **Verdict:** approve with nits; one gate finding fixed before commit.

## Change reviewed

Apps/web only: the roster commit's utility-item button no longer nests inside the checkbox label (`div.gear-item`, sibling `secondary-action` button); the Cowboy-hat button gets `secondary-action`; `.gear-item` CSS; a 3-test jest-axe/structure regression file; a contract-test scan for class-less `<button>`s; `scripts/playtest/ui-audit.mjs` finds the claimed character instead of the retired name "Rook"; `scripts/playtest/measure-layout.mjs`. Evidence: `docs/evidence/reskin-mobile-oct02b/`.

## Findings and dispositions

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | Medium (gate) | The evidence probe script, first placed under `docs/evidence/`, failed `npm run lint` (not covered by the eslint ignores; the author's earlier `check` ran before it was added) | Moved to `scripts/playtest/measure-layout.mjs` (eslint-ignored like the other playtest scripts), header and `CHROME_PATH`/`CDP_PORT` fixed; gates re-run |
| 2 | Info | Behaviour preserved: handlers, render conditions, disabled/pool-eligibility, label-wraps-input toggle, keys; no engine, projection, rules or authorization files touched | none needed |
| 3 | Info | CSS correct; no selector elsewhere assumed `.gear-list > label`; `:has(:checked)`/`:has(:disabled)` still match; tap height comes from `.secondary-action`; forced-colors unaffected | none needed |
| 4 | Nit | jsdom cannot see the squeezed layout; nothing automated asserts the `.gear-item` rules; test coupled to `ORIGINAL_ROSTER` | Accepted: layout is covered by the real-Chrome probe and captures; the fixture-existence test guards the coupling |
| 5 | Low | Contract regex: only checks that some `className` exists (not that it is tap-sized); path-based exemption for the two stepper files; spread props / custom components unscanned | Accepted; every current class is one of the three tap-covered names (the existing token test checks that) |
| 6 | Info | No other label-nested control or class-less button in `apps/web/src`; `SceneDirector.tsx:185` is a button in a `div.gear-option` (valid) | none needed |
| 7 | Info | Licensing and scope clean | none needed |

Reviewer-run: `npx vitest run apps/web` (33 files, 266 tests passed), `npm run typecheck` passed, `npm run lint` failed only on finding 1.

## Author's final gates

`npm run check` exit 0 (693 passed, 11 todo); `npm run build` passed; `npm run test:emulator` exit 0 (18 + 86 + 4); `ui-audit.mjs` against a local emulator build: 150 states, 1,542 controls, 0 control issues, 0 overflow, 0 axe hard violations, 0 failures. See the evidence README for the audit's limits (it did not flag the pre-fix button; iOS visual-viewport keyboard, native select popups and physical devices remain unverified).
