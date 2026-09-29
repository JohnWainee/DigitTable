# Eleventh independent re-audit: the pop-out squeezed its own field with the keyboard open (branch `sonnet-bo/reskin-physical-audit-20260929`, 2026-09-29)

- **Base:** `f72cdc9` (carries the text-scale reflow fix, the utility-item tap-target class and the roster-agnostic audit selector;
  `git merge-base HEAD f72cdc9` is `f72cdc9`, so the earlier fixes are genuinely in this lineage).
- **Scope:** presentation only (`SheetDialog`, one new hook, CSS, the audit harness, tests, evidence). No engine, contracts,
  template, Functions, rules, projection or authorization change; no deployment; no merge. Existing staging proof is
  deployed-build-only (`5e8907b`) and is not claimed for this source.

## Independent determination

Baseline at `f72cdc9` (production-shaped, emulator-mode build; local `demo-digitable` emulators): `ui-audit.mjs` **225 states, 0
failures**, so the existing gates were green. The inventory of pop-out-shaped markup is unchanged (six native `<select>`s, one
`<details>`, one `role="dialog"`; the OS/browser owns every select popup, the disclosure is inline). The only pop-out we own is the
`SheetDialog` bottom sheet / centred card.

The harness's own known limit says the keyboard is emulated by shrinking the layout viewport and only at 100% text. Combining the
two, which is what a real phone does, was never exercised, and the existing keyboard check compared the field with the **window**,
not with the region it scrolls in (a field clipped by its own scrolling body is still inside the window). Measuring the region
found a real defect.

## The defect

`SheetDialog` pinned **both** its header and its action row and scrolled only the body. With the keyboard open on a short
viewport, or with 150-200% text, the pinned parts took most of the visible height (numbers from Chrome, correction sheet):

| Case (visible size after the keyboard) | Header + action row | Body left | Field | Result before |
| --- | --- | --- | --- | --- |
| landscape phone 812x375 -> 812x206, 100% text | 48 + 66 | 56px | 48px + label | label cut off, field one sliver from the pinned row |
| 667x375 -> 667x206, 150% | 63 + 82 | 36px | 72px | field mostly hidden |
| 375x812 -> 375x447, 200% | 124 + 179 | 127px | 96px | field clipped |
| 320x568 -> 320x312, 200% | 124 + 125 | 48px | 96px | field a black bar, title taking 40% |

## The fix

- `useTightSheetFit` (new) measures the sheet, header, action row and body content and sets `data-tight` when the content overflows
  **and** header + action row would leave the body less than half the sheet. Every input is independent of the mode it selects, so
  it cannot oscillate; it re-measures on `ResizeObserver` (sheet, header, action row; deliberately not the body), window and
  `visualViewport` resize.
- `.sheet[data-tight]` makes the sheet the scroller: the header scrolls with the content, the action row stays `position:
  sticky; bottom: 0`, and `scroll-padding-bottom` (the row's measured height) keeps focus scrolling clear of it.
- A roomy sheet is byte-for-byte unchanged (no attribute): 375x812 at 100% with the keyboard, tablet, desktop and the centred card
  render as before; `isTightSheet` never fires for content that fits.

## Evidence (this exact tree, fresh)

- `docs/evidence/bo-tight-sheet/{before,after}/`: correction-sheet screenshots for every scenario plus `report.json`.
- New **gating** harness scenarios `keyboard-text-*` (6 viewport / text-size cases): sheet tight only when needed, the focused
  field fully inside the content region, a field focused from the top of the sheet clears the pinned row, both action buttons
  usable (`actionsUsable`: at least a 44px target visible after clipping by the action row and the window; the old bare
  bounding-rect test was vacuous for a row that scrolls internally), and axe (WCAG 2.x A/AA + best practice) with the tightest sheet
  open. The three existing text-scale scenarios now use the same rigorous checks and scroll the real scroller.
- Before the fix (same harness, pre-change build): **11 failures** (field not fully visible at 320@200%, 375@200%, 667@150%,
  812@100%; sheet-not-tight). After: **PASSED, 0 failures**.
- Full `ui-audit.mjs` after: **225 states, 2,295 controls, 0 control issues, 0 overflow states, 0 hard axe violations, 0 failures**,
  no console errors or failed requests on any of the four browser contexts. `two-device-smoke.mjs --reload --no-images`: all steps
  passed.
- `npm run check`: **724 passed | 11 todo** (was 712; +12: pure decision boundaries, jsdom wiring with stubbed geometry incl.
  ResizeObserver / visualViewport / listener cleanup, and the `.sheet[data-tight]` CSS contract). Mutations (threshold, `overflows`
  guard, observing the body, dropping `disconnect`, `removeEventListener`, sticky footer, overflow, sticky header, removing the hook)
  each fail a test.
- `npm run build`: passes (existing non-blocking chunk-size warning).
- Firebase emulator suite on **alternate ports** (a temporary config; another worktree's stack holds the default ports and was
  not touched): `firebase emulators:exec ... npm run test:emulator --workspaces` **18 + 86 + 4 = 108/108**. Nothing under
  Functions/rules/`packages/*`/`templates/*` changed.

## Independent review (fresh reviewer agent, second pass)

Verdict: **approve with changes**; no correctness defect in the hook, CSS, focus trap, inert background or scroll lock. It ran
`vitest run apps/web` (282 pass), prettier, eslint, tsc, the modal harness against its own build (PASSED), a 7-case
`MutationObserver` probe for `data-tight` flips including a classic 15px scrollbar (0 oscillations, no `ResizeObserver loop`
errors), and a real Tab walk in the tight state (focus stayed inside, never under the sticky row).

1. *Low-medium, at extreme scale (320@200% with keyboard; 667x375@150%) the capped action row still takes ~40-53% of the sheet and
   scrolls internally, so Apply and Cancel are never both fully visible.* **Accepted, recorded.** Both are reachable, the 40% cap
   is the pre-existing backstop and the previous layout was strictly worse (field unreachable). Un-sticking the row would need a
   second, mode-dependent measurement (the cap is not mode-independent) and would put Apply out of reach while typing. Revisit
   only if a physical device says otherwise.
2. *Low, `actionsReachable` was vacuous for a row that scrolls internally.* **Fixed** (`actionsUsable`, above), applied to all
   scenarios; re-ran, all pass, and the pre-change build still fails the new checks.
3. *Low, test gap: listener cleanup, visualViewport and the ResizeObserver callback were untested.* **Fixed** (3 tests; removing the
   window `removeEventListener` now fails one).
4. *Process, handoff and review record.* This file and the `CLAUDE_HANDOFF.md` entry.
5. *Environment note.* `apps/web/dist` was rebuilt once without the emulator environment (my own error); rebuilt with it before
   the final runs, which is why the final numbers above come from the emulator-mode bundle.

Accepted trade-off: in the tight layout the sheet's title scrolls with the content, so it is out of view when the person has
scrolled to the field (it is at the top of the scroll). Pinning it would give back the space this fix reclaims.

## Open

Not provable in headless Chrome: iOS Safari, where the keyboard shrinks the *visual* viewport without resizing the layout viewport
(the fit hook also listens to `visualViewport`, and the pinch-zoom scenarios exercise the `--vv-*` path). Physical two-device
rehearsal remains John's. Nothing here is deployed.
