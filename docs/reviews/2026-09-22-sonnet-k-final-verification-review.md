# Final UI/UX verification: mobile visual-viewport and pop-out behavior (sonnet-k, 2026-09-22)

Branch `sonnet-k/reskin-final-verification-20260923`, worktree isolated from
`/Users/john/Documents/ChatGPT/DigiTable`. Starting candidate: commit `eedab53`
(tip of the reskin-hardening lane; the reskin/hardening source itself last
changed at `c180820` — everything after that is docs-only staging-smoke
recording). Not a merge, not a deploy; no code changed as a result of this
pass.

## Scope

An independent, source-level inspection of every interactive popup, sheet,
dropdown, and dialog in `apps/web`, and of how each behaves under a dynamic
mobile keyboard or browser-chrome viewport change, per
`docs/reviews/2026-09-20-final-mobile-audit-review.md` and
`docs/reviews/2026-09-20-uiux-reskin-hardening-review.md`'s prior findings.
Goal was to find a concrete regression those lanes missed, or to establish
that none exists.

## Inventory (re-verified, not assumed)

- `grep` for `position: fixed` in `apps/web/src/styles.css` returns exactly
  one rule: `.sheet-backdrop`. `SheetDialog` (`apps/web/src/shared/SheetDialog.tsx`)
  is the only modal/pop-out implementation in the app; its only consumer is
  `CorrectionDialog` (`apps/web/src/gm2/CorrectionDialog.tsx`), wired from
  `GmDirectorScreen.tsx`.
- Six native `<select>` elements (`GmToolsPanel.tsx` x4, `SceneDirector.tsx`
  x2) and one in-flow `<details>` ("Why?" in `ComposeStep2.tsx`) are the only
  other pop-out-shaped controls. No `role="listbox"`/`"menu"`/`"combobox"`,
  no `<dialog>`, no second `createPortal` call, no `window.confirm/alert/prompt`.
  This matches the count the 2026-09-20 final mobile audit recorded; nothing
  added since introduces a new pop-out surface.

## What was checked

- `apps/web/src/shared/useVisualViewportBox.ts`: the `differs` heuristic
  (scale, offset, height/width deltas against the layout viewport), listener
  registration/cleanup, and the CSS custom-property fallback behavior when
  `window.visualViewport` is absent.
- `apps/web/src/shared/SheetDialog.tsx`: focus-trap reachability rules
  (collapsed `<details>`, disabled fieldsets, inert subtrees, radio groups),
  inert/scroll-lock lifecycle ordering, Escape handling, and the
  focused-text-field reveal-on-keyboard logic (`scrollIntoView` on focus and
  on visual-viewport resize).
- `apps/web/src/styles.css` lines 1379–1541: the `.sheet`/`.sheet-backdrop`/
  `.sheet-footer` rules that consume `--vv-*`, their `100dvh`/`100vh`
  fallback pairing (the `@supports` split is required because an invalid
  `var()` fallback computes to `auto`, not the next fallback), the
  safe-area-inset padding, and the `max-height: 40%` footer backstop for
  large text on a short viewport.
- Confirmed the global 16px-minimum/44px-minimum-tap-target rule
  (`styles.css` ~line 495) applies to every text input, `<select>`, and
  `<textarea>` in the app, not just fields inside the sheet — so no
  interactive control anywhere triggers iOS Safari's auto-zoom-on-focus.
- Traced the one plausible risk in `position: fixed` + visual-viewport
  compensation (whether translating by `offsetTop/offsetLeft` double-counts
  pinch-zoom scale): worked through the coordinate math by hand against the
  existing pinch-zoom test case in `SheetDialog.test.tsx` (`scale: 1.6,
  width: 234, height: 507, offsetLeft: 40, offsetTop: 90`) — `visual.width`/
  `offsetLeft` are already expressed in layout-viewport CSS px, so sizing and
  positioning the backdrop directly from them is correct; the browser's own
  zoom transform (applied to the whole page, including fixed elements)
  accounts for the scale on top of that. No double-scaling.
- Checked `html.sheet-open { overflow: hidden }` (the root scroll lock) is
  not on its own the classic leaky iOS scroll-lock: since every other
  `<body>` child is also made `inert` while a sheet is open, the background
  is excluded from hit-testing, so a touch cannot reach a scrollable
  ancestor there in the first place — the backdrop itself has no overflow of
  its own to scroll (only `.sheet-body` does, contained via
  `overscroll-behavior: contain`). `overflow: hidden` is a correct backstop
  for this design, not a `position: fixed`-hack workaround it's missing.
- Read `scripts/playtest/ui-audit.mjs`'s documented limits (keyboard
  emulation shrinks the *layout* viewport, matching Chrome Android's
  `resizes-content` mode, not iOS Safari's visual-viewport-only shrink) and
  confirmed they are pre-existing, previously recorded gaps
  (`CLAUDE_HANDOFF.md`), not something this pass could newly falsify without
  a physical iPhone.

## Verification run (this pass, fresh)

- `npm run check` — exit 0: format clean, lint clean (zero warnings),
  typecheck clean across all 6 workspaces, **708 tests passed, 11 todo** (75
  files passed, 1 skipped). Matches the numbers already recorded in
  `CLAUDE_HANDOFF.md` for this exact commit.
- `npx vitest run apps/web/test/shared/SheetDialog.test.tsx` — 22/22 passed,
  including the visual-viewport subtree (keyboard-shape mirroring, pinch-zoom,
  offset-only iOS scroll-under-keyboard, and the "no Visual Viewport API"
  fallback).

## Outcome

**No concrete, in-scope defect found.** Every interactive popup/sheet/
dropdown/dialog in the app funnels through the single `SheetDialog`
implementation (or is a native `<select>`/`<details>` needing no
visual-viewport handling), and its visual-viewport, focus-trap, scroll-lock,
and keyboard-reveal logic is internally consistent, covered by jsdom tests
where jsdom's layout limits allow, and matches the documented, already-known
gap (a physical iOS Safari pass) rather than hiding a new one. No code was
changed. The residual gaps for John are the same ones already on record in
`CLAUDE_HANDOFF.md`: a physical two-device/iPhone rehearsal (visual-viewport
keyboard, VoiceOver) remains the only thing this or any prior local/headless
lane cannot produce.
