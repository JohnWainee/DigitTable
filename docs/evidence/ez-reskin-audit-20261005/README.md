# Forced-colors (Windows High Contrast) and text-spacing audit, lane `sonnet-ez` (2026-10-05)

Base `652ba15` (the unmerged reskin chain through `sonnet-ex`, plus the lint-gate repair). **One product change, one CSS
rule:** the "Why?" disclosure marker was invisible in forced-colors mode and now is not. No authority, authorization,
privacy, projection, engine, Firebase, rules, Functions, asset, secret or deployment change. Not merged, not deployed;
staging is still the deployed `5e8907b` build and proves nothing about this source.

## Why this angle

Twenty-plus earlier lanes audited the same surfaces in Chrome at default settings and in real Mobile Safari. Several
READMEs list "Windows High Contrast" as never covered; the forced-colors block had only been reviewed as CSS text (`di`,
`sonnet-d` reviews). A search of `docs/` and `scripts/` finds no browser run under forced-colors emulation and no use of the
WCAG 1.4.12 text-spacing override before this lane.
Chrome's `forced-colors: active` emulation is not a media-query toggle only: it really recolours the page (measured on this
build: buttons compute `color: rgb(255,255,255)`, `background: rgb(0,0,0)`, `box-shadow: none`; adding
`prefers-color-scheme: light` gives a white Canvas, i.e. a light high-contrast palette), so computed styles under it are
evidence. It is still an emulation of one engine's palette, not Windows.

## Finding (real, fixed)

`summary::before` (the disclosure triangle on the player's "Why?" panel) is a `clip-path` box filled with
`background: var(--cyan)`. Forced colors repaints a plain background to Canvas, the same colour as the summary behind it, so the
open/closed marker disappears. The forced-colors block already special-cased check boxes and radios but not this glyph.

| | dark forced palette | light forced palette |
| --- | --- | --- |
| label colour (`summary`) | `rgb(255, 255, 0)` | `rgb(0, 0, 159)` |
| marker background, **before** | `rgb(0, 0, 0)` (Canvas: invisible) | `rgb(255, 255, 255)` (Canvas: invisible) |
| marker background, **after** | `rgb(255, 255, 0)` (= label) | `rgb(0, 0, 159)` (= label) |

(`probes/forced-colors-disclosure-before.log` / `-after.log`; each candidate gets a fresh page load. `currentcolor` does **not**
survive the override (Canvas again); `CanvasText`, `ButtonText`, `LinkText` do.)

Fix, `apps/web/src/styles.css`, inside the existing last `@media (forced-colors: active)` block:

```css
summary::before {
  background: LinkText;
}
```

* The built CSS differs from the unfixed build by exactly that rule (`summary:before{background:linktext}`, +35 bytes, inside the
  forced-colors block); the JS bundle is byte-identical (same size, no differing byte).
* Regression test (red before, green after): `apps/web/test/styles/reskinContract.test.ts`, "keeps the disclosure marker and the
  checked mark visible in forced-colors". It failed on the unfixed stylesheet (86 other contract tests passed) and passes now. The
  reviewer mutated a scratch copy (rule removed, `currentcolor`, `::after`, moved to the `prefers-contrast` block) and each turned it red.
* Diagnostic added to the audit (`forcedInvisible`): on the unfixed bundle it lists `summary::before (rgb(0, 0, 0))` plus
  `input::after` (the *unchecked* mark, hidden by `scale(0)` by design) and the decorative tape strips
  (`section.step::before`, `section.scene-card::before`); on the fixed bundle `summary::before` is gone from the list.
* Default rendering is untouched by construction (the rule lives in a media query that does not match without forced colors);
  a default-mode layout fingerprint over `compose`, `compose-why-open`, `allocation`, `idle` at 8 viewports each: 25 of 32
  state/viewport pairs identical, the other 7 are all `player/allocation`, where one 18x18 icon moves 2-3 px because the rolled dice
  (random) change the text beside it; the DOM of that state differs from run to run (a base-against-base rerun had 95 vs 63 elements),
  so it cannot carry a verdict either way.

Before/after captures (`shots/`):

* `shots/element/{before,after}-{dark,light}.png`: the app's own `<details><summary>` markup under each palette (3x).
* `shots/real-page-forced-dark-why-{before,after}-crop.jpg`: the real compose screen, 375 px phone.
* `shots/forced-dark/` and `shots/forced-light/`: the full compose screen with "Why?" open at phone (375), tablet (768), desktop
  (1280) and table (1920) viewports, before and after.
* The CSS does not alter any other pixel, so there is no default-mode before/after to show; the fingerprint above is the proof.

## Other things this lane measured (no defect)

* **Forced colors, every state** (`ui-audit.mjs --emulate-media forced-colors=active`, 288 states): 0 control issues, 0 overflow
  states, 0 sheet / dock / keyboard-focus failures, 0 word breaks; the sheet keeps its border, check boxes and radios keep their
  Highlight marks, errors keep their "Error:" lead-in and the 3 px field border, the route map keeps its own fills, "Downed" and
  "beaten" are text. The final run on the fixed bundle (`reports/forced-colors-fixed-bundle-summary.json`): **288 states, 3,320 controls,
  0 failures**, 256 text-scale states, 87 keyboard-focus, 363 dock-focus, 4 pinch, 8 validation, 23 sheet cases; the pixel-contrast
  pass is skipped there (`pixelContrastSkipped: true`), and 77 axe colour-contrast readings are listed as notes only (see rig notes).
  The first run, on the unfixed bundle, had 85 flagged items; all were harness artefacts (77 axe colour-contrast readings of
  authored colours, 8 assertions that an invalid field's border equals the `--riot` token, which the UA overrides), corrected in the
  harness. The defect itself is not a harness failure: it is seen in computed styles, the `forcedInvisible` list and the captures.
* **WCAG 1.4.12 text spacing** (`--text-spacing`, 288 states): 0 control issues, 0 overflow, 0 axe violations, 0 text clipped by
  its own box. 17 findings, all in combinations beyond what the criterion asks, none a regression:
  7 words broken at 320 px **and** 200% root text **and** the extra letter spacing (the known 320 px / 200% geometry limit,
  now compounded), 6 `actionsVisible` and 4 `titleReachableByScrollingSheet` flags from the keyboard emulation. The live probe
  (`probes/sheet-text-spacing.log`, `scripts/playtest/sheet-text-spacing-probe.mjs`) shows what they are: at **320x312**
  (320x568 phone, keyboard up) with the override the footer is capped at 40% of the visible height (125 px), so Cancel is
  partly below the footer's own fold and is reached by scrolling the footer (Apply is fully visible; Back and Escape also close);
  at the 60 px iOS-landscape diagnostic height the title needs more room than exists. Every action is **reachable** at every
  size tested (9 sizes, with and without the override; `--assert` passes), nothing overflows the page. Accepted as a limit, not changed.
  Screenshots: `shots/sheet-320x312-keyboard-{default,text-spacing}.jpg`.

## Pop-out inventory (read from source, then driven)

| Surface | Where | Notes |
| --- | --- | --- |
| Correction sheet, the only modal | `SheetDialog.tsx` / `CorrectionDialog.tsx` | portal, inert background, scroll lock, focus trap, Escape, Back-dismiss (`useBackDismiss`), visual-viewport box, compact mode; 23 sheet cases per audit + `sheet-viewport-probe` 8/8, `sheet-history-probe` 3/3, `focus-restore-probe` all pass on the fixed bundle |
| Sticky action dock x4 | compose, allocation, injury choice, GM pending actions (`ActionDock.tsx`) | dock focus checks 297 (default) |
| Native `<select>` x6 | GM tools (grant / advance character, advance, reassign), scene director (scene, edit target) | OS owns the popup; `SelectedOptionEcho` x3 echoes a truncated choice in full |
| Disclosure x1 | "Why?" in `ComposeStep2.tsx` | the defect above |
| Allocation / option pickers | radio groups per die, stat and gear option rows, `AllocationStepper` (custom spinbutton, tap + keyboard) | no native number input, so no soft keyboard |
| Fixed / floating | `.sheet-backdrop` (fixed, visual-viewport sized), `body::before` texture (fixed, inert, dropped in forced colors / more contrast), the dock (sticky) | no custom menus, popovers, tooltips, toasts or `title` tooltips |

## Gates (isolated ports; peers hold the defaults)

Live stack on 48xxx, emulator suites on 49xxx, in `/private/tmp` clones (a worktree under `~/Documents` hangs on esbuild); the
only port edits are in those scratch clones, never in the worktree.

| Check | Result |
| --- | --- |
| `npm run check` (`check.log`; baseline `check-base.log`) | format, lint (0 errors, the one existing warning), typecheck, **869 passed**, 11 todo (baseline 862; +7 new tests) |
| `npm run build` (`build.log`) | passed (known chunk-size warning) |
| Emulator suites (`emulator.log`) | rules/testing 18, Functions 86, web 4: all passed (4 Admin-SDK metadata `ETIMEDOUT`/`ENOTFOUND` lines, as in earlier lanes) |
| `ui-audit.mjs`, default mode, fixed bundle | **288 states, 3,272 controls, 0 failures**, 0 contrast failures over 8,431 boxes, only the known best-practice note |
| `two-device-smoke.mjs --reload` (`smoke.log`) | ALL STEPS PASSED (17) |
| Sheet probes | viewport 8/8, history 3/3, focus restore (Cancel, Back, Forward, Apply) all pass |

## Limits (stated, not hidden)

Windows High Contrast on a real Windows machine, Firefox and real Safari were not exercised: only Chrome's emulated palettes (dark and
light). Real Mobile Safari was not re-run; it never matches `forced-colors`, so this change cannot affect it (the iOS results
are in `eu-reskin-audit-20261005` here, and in `ew-`/`ey-reskin-audit-20261005` on those peer branches). No physical iPhone/Android, VoiceOver, TalkBack or NVDA. The keyboard
emulation shrinks the layout viewport (Chrome Android behaviour), not iOS's visual-only viewport. Staging runs `5e8907b`. The
red X on a beaten threat token (`.threat-token-cross`) is still Canvas on Canvas in forced colors; it is `aria-hidden` decoration and the
line-through text and "(status)" carry the state. The remaining forced-colors diagnostics (tape strips, halftone) are decoration.

## Rig notes

* Chrome's `setEmulatedMedia` accepts a misspelt feature without complaint; `--emulate-media` now proves each feature with `matchMedia`.
* axe's `color-contrast` reads authored colours under forced colors (it reported `#050506` on `#000000`, 1.03:1, for buttons that
  render white on black), so it is not treated as evidence there; the screenshots are the record.
* A hash-only `Page.navigate` does not reload the page: the first matrix of the disclosure probe was contaminated by styles injected
  for the previous candidate. The probe now loads `about:blank` first. Template-literal expressions in the harness need doubled
  backslashes (`\\d`), or the regex silently becomes `/[d.]+/` (the first diagnostic found nothing because of that); both are pinned by tests.
* Peer lanes `sonnet-ew` (`b993f56`) and `sonnet-ey` (`db475c1`) branch from `8839c75`, not from `652ba15`. `sonnet-ey` also edits
  `scripts/playtest/ui-audit.mjs` (adds `--extra-viewports`), `auditHarnessContract.test.ts` and `CLAUDE_HANDOFF.md`; expect
  textual conflicts there (additive, near the argument parsing and the end of the test file).

Independent review: `docs/reviews/2026-10-05-ez-forced-colors-and-lint-gate-independent-review.md`.
