# Mobile pop-out audit (sonnet-t/reskin-fresh-20260924)

- **Date:** 2026-09-24
- **Branch:** `sonnet-t/reskin-fresh-20260924`, already carrying the `sonnet-q`
  (`e1ccc8b`, ports the `ui-audit.mjs` roster-selector fix) and `sonnet-r`
  (`a69e1a9`, `249df25`, independent re-audit) commits from earlier today.
- **Scope:** the same brief given to every session in this lineage today —
  independently audit the deployed staging build and the ink-black reskin for
  a real, remaining, user-visible mobile pop-out defect across GM, player,
  table, and setup/join flows (selects, menus, disclosures, dialogs, drawers,
  option/action/allocation pickers, real mobile viewport behaviour including
  dynamic visual viewport, safe areas, and the virtual keyboard), per
  `AGENTS.md`'s read-before-changing and scope-discipline rules.

## What this session is, precisely

This branch's own commit history already *is* the `sonnet-q` and `sonnet-r`
work (`git log` on this branch shows `e1ccc8b`, `a69e1a9`, `249df25` verbatim,
not a merge of them) — this is therefore the third consecutive audit pass on
this exact branch lineage today, not a fresh divergent branch. No `apps/web`,
`packages/*`, `templates/*`, or `apps/functions` commit has landed since
`5e8907b` (the sourcebook roster ship, 2026-09-19), which every one of the
prior three sessions (`sonnet-q`, `sonnet-r`, and the `sonnet-p`/`sonnet-n`
sessions before them) already audited against.

## Independent verification performed this session

Rather than accept the prior sessions' written conclusions, this session
independently re-derived them:

1. **Re-inventoried pop-out surfaces from source**, not from the docs above:
   `grep` for `role="dialog"`, `<dialog`, `popover`, `role="menu"/"listbox"/
   "combobox"/"tooltip"/"tab"`, `aria-expanded` across `apps/web/src` found
   exactly one hit (`SheetDialog.tsx`); `<select` found six, all in
   `SceneDirector.tsx`/`GmToolsPanel.tsx`; `<details` found one, in
   `ComposeStep2.tsx`. Confirmed `git log -3 -- apps/web` shows no commit more
   recent than `5e8907b`, i.e. nothing new exists for this branch to find
   that the prior sessions did not already see.
2. **Read `SheetDialog.tsx` and `useVisualViewportBox.ts` in full** (not
   excerpts): portal-to-`<body>` with reference-counted `inert` background,
   the `isReachable()` focus-trap predicate (collapsed-`<details>`,
   disabled-`fieldset`/legend carve-out, one-tab-stop-per-radio-group,
   `checkVisibility` with a jsdom/legacy-engine fallback), Escape-to-close,
   the on-screen-keyboard `scrollIntoView({ block: "nearest" })` reveal on
   `focusin` and on `visualViewport` `resize`, and the `--vv-*` custom
   properties the visual-viewport hook writes only when the visual and
   layout viewports actually diverge (scale, offset, or size), leaving the
   CSS's plain `100dvh`/`100%` fallback alone otherwise.
3. **Read the CSS behind it** (`grep` for `.sheet`/`safe-area` in
   `styles.css`): `env(safe-area-inset-*)` on all four sides of the backdrop,
   header, and footer at both the narrow and centred-card breakpoints; the
   sheet-open scroll lock class; the reduced-motion and forced-colors blocks
   were not newly reviewed this session (unchanged since the reskin review),
   only spot-confirmed present.
4. **Independently obtained a second, separate review** (a fresh
   general-purpose agent with no prior context beyond a pointer to this same
   source and the brief above, no access to this write-up): given
   instructions to re-derive the pop-out inventory itself via its own greps,
   read the same two files and CSS in full, and check the six `<select>`
   call sites for label pairing — asked to render an independent PASS/FAIL
   verdict, not asked to confirm a stated conclusion. Its verdict and any
   findings are appended below once returned.

## Conclusion

No new user-visible mobile pop-out or responsive/accessibility/reskin defect
was found, and no source change was needed or made. `apps/web`,
`packages/*`, `templates/*`, and `apps/functions` are unchanged from
`5e8907b` by this session.

## Live evidence (this session, against live staging `https://digitable.signal-bleed.com`)

- `npm ci` (worktree had no `node_modules`).
- `npm run check` — format, lint, typecheck clean; **690 passed | 11 todo**
  (71 files, 1 skipped) — identical to the `e1ccc8b`/`a69e1a9`/`249df25`
  baseline already recorded on this branch.
- `npm run build` — clean (Functions esbuild 216.6kb; web build 138 modules;
  the existing non-blocking >500kB chunk-size warning only).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` —
  **108/108** passed (18 `packages/testing`, 86 `apps/functions`, 4
  `apps/web`); ports were free this run.
- `node scripts/playtest/ui-audit.mjs --base https://digitable.signal-bleed.com --label sonnet-t-20260924 --out /private/tmp/digitable-sonnet-t-mobile-audit-20260924 --no-shots` —
  **150 states, 1,482 controls audited, 0 control issues, 0 overflow
  states, 0 hard axe violations, 0 failures.** The only two non-gating
  notes, unchanged from every prior run on this lineage: the 320px+200%-text
  geometry limit on the correction sheet (`modal-text-200-phone-small`,
  accepted per `docs/reviews/2026-09-18-sonnet-d-reskin-independent-review.md`
  R3/N4) and the `page-has-heading-one` best-practice item on the
  nonexistent-room route (open for John since 2026-09-18, F7). Control count
  (1,482) differs from the two prior sessions' runs (1,422 / 1,470) by normal
  state-dependent variation on shared live staging, not a regression — all
  three runs report 0 issues and 0 failures.
- `node scripts/playtest/two-device-smoke.mjs --base https://digitable.signal-bleed.com --out /private/tmp/digitable-sonnet-t-mobile-audit-20260924 --reload` —
  **17/17 steps passed**: create, isolated player/table admission, claim,
  opposed action, pause/resume, scene advance, reload recovery, and no
  horizontal overflow at 375/768/1024/1280/1920px on all three roles.
  `report.json`: `ok: true`, `overflows: []`, zero console errors on every
  device (`consoleByDevice`). `responsiveOverflow.table["1920"]` reads `-15`
  (negative — no actual overflow), matching the already-documented
  `scrollbar-gutter: stable` cosmetic non-issue (N9 in the reskin review).

Evidence artifacts: `/private/tmp/digitable-sonnet-t-mobile-audit-20260924/`
(`report.json` for both the `ui-audit.mjs` state summary printed above and
the `two-device-smoke.mjs` run, plus 21 screenshots from the smoke run).

## Independent review

A fresh general-purpose agent, given only the source-level brief above (no
access to this write-up, no instruction to confirm a stated conclusion —
asked to derive its own verdict) independently re-inventoried and re-read the
same surfaces:

- Re-confirmed via its own greps: exactly one `role="dialog"` (`SheetDialog.tsx`,
  used only by `CorrectionDialog.tsx`); exactly one `<details>`/`<summary>`
  (`ComposeStep2.tsx:248-249`, standalone, not inside any sheet); exactly six
  `<select>` elements (two in `SceneDirector.tsx`, four in
  `GmToolsPanel.tsx`), each correctly `<label htmlFor>`-paired
  (`scene-select`, `edit-target`, `grant-character`, `advance-character`,
  `advance-select`, `reassign-character`); no `<dialog>`, `popover`,
  `role="menu"/"listbox"/"combobox"/"tooltip"/"tab"`, or `aria-expanded`
  anywhere in `apps/web/src` (other "Sheet"/"Modal" grep hits were false
  positives on the unrelated `gmSheets` prop name); no other `document.body`
  portal exists, which it noted matters because `SheetDialog`'s inert-
  background logic is a mount-time snapshot of `document.body.children` — a
  documented limitation, correct because nothing else appends to body.
- Independently verified `isReachable()`'s collapsed-`<details>`,
  `[inert]`-ancestor, `fieldset[disabled]`/legend-carve-out, and
  radio-group-tab-stop branches against actual DOM/ARIA semantics, noting
  none of those cases currently occur inside `CorrectionDialog` itself (no
  radios, no nested details, no disabled fieldset there) — calling this
  correct defensive coverage, not dead code.
- Independently verified the focus trap recomputes its focusable set fresh
  on every Tab keypress (no staleness), the `openSheets` reference-counted
  scroll lock can't leak on a thrown error or a React StrictMode double
  mount, and the `--vv-*` custom-property/`100dvh`-fallback CSS ordering
  (`@supports (height: 100dvh)` placed after the base `100vh` rule) is the
  correct direction — a `var(--vv-height, 100dvh)` outside `@supports` would
  break on non-`dvh` engines, and the code correctly avoids that shape.
- Independently confirmed safe-area insets sit on the correct sides, the
  footer's `max-height: calc(var(--vv-height) * 0.4)` backstop matches the
  already-accepted 320px+200%-text limitation rather than being a new bug,
  `--tap: 3rem` (48px) exceeds the ~44px target consistently, `touch-action`
  is deliberately left unrestricted (checked `index.html`'s viewport meta
  has no `maximum-scale`/`user-scalable=no`, so pinch-zoom is genuinely
  available), and the on-screen-keyboard `scrollIntoView` reveal is scoped
  to the dialog only.

**Verdict: PASS.** No new defect found; the two pre-existing accepted items
were correctly left un-reflagged.

## Residual, physical-device-only limits (unchanged, still open for John)

- No physical iOS/Android device pass (real visual-viewport-only on-screen
  keyboard, VoiceOver/TalkBack, Windows High Contrast) — headless Chrome
  cannot produce the iOS case; documented since the original reskin review.
- `page-has-heading-one` on the nonexistent-room route (F7) remains open for
  John; this session neither introduced nor fixed it.

## Resource note

This is the third consecutive independent "no defect" audit pass on this
exact branch lineage within roughly 24 hours (`sonnet-q`, `sonnet-r`, now
`sonnet-t`), each rerunning the full live evidence suite against the same
deployed build with converging results. Per the resource note already
recorded on the two prior sessions: whoever next schedules this audit class
should weigh this accumulated evidence — four-plus independent clean passes
today alone — against the marginal value and shared-staging load of another
identical run, absent an actual `apps/web`/`packages/*`/`templates/*`/
`apps/functions` source change to re-verify against.
