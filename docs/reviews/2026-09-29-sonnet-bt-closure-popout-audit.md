# Thirteenth independent re-audit: closure pass over every pop-out, no product defect (branch `sonnet-bt/reskin-closure-20260929`, 2026-09-29)

- **Candidate:** `fde7986` (`git merge-base --is-ancestor` confirms `f879e0d` tap-target class, `f72cdc9` text-scale reflow and
  `4417b8d` tight-sheet fit are all in this lineage; `c77cd94` is not an ancestor but its roster-agnostic selector is present in
  functionally equivalent form, see the seventh audit).
- **Scope:** evidence only. No `apps/web`, engine, contracts, template, Functions, rules, projection, authorization or existing
  harness change. No deployment, merge, cloud resource or other-worktree change. Existing staging proof is of `5e8907b` only.
- **Before / after:** there is no source change, so "before" and "after" are the same tree. The screenshots in
  `docs/evidence/bt-closure/screens/` are the candidate at phone / tablet / desktop / table sizes.

## Inventory of pop-out-shaped controls (re-derived from source)

`grep` over `apps/web/src`: one `role="dialog"` (`SheetDialog`, used only by `CorrectionDialog`), six native `<select>`s
(`SceneDirector` x2, `GmToolsPanel` x4; the OS/browser owns the option popup, we own the closed control), one `<details>`
("Why?" in `ComposeStep2`), the `AllocationStepper` spinbutton and custom radios/checkboxes. No `popover`, `menu`, `listbox`,
`datalist`, `aria-haspopup`. `position: fixed` appears once (the sheet backdrop) and `position: sticky` once (the tight sheet's
action row). The table surface has no interactive control (measured: 0 controls at every table size below).

## Gates (this exact tree, emulator-mode production build, local `demo-digitable` only)

| Gate | Result |
| --- | --- |
| `npm run check` (format, lint, typecheck, tests) | pass: **724 passed, 11 todo** (76 files passed, 1 skipped) (`npm-run-check.log`) |
| `npm run build` (functions + web) | pass (existing non-blocking chunk-size warning) |
| `ui-audit.mjs` sweep, 100% text | **225 states, 2,367 controls, 0 control issues, 0 overflow, 0 hard axe violations, 0 failures**; only the known non-gating `page-has-heading-one` note on the no-such-room route (`baseline-ui-audit-report.json`) |
| Emulator suite on alternate ports (a temporary `firebase.bt-alt.json`, removed after the reviewer noted it was still present; other worktrees hold the default ports) | **18 + 86 + 4 = 108/108** (`emulator-suite.log`) |

The sweep already covers axe (WCAG 2.x A/AA + best practice, colour contrast included), the six viewports, 150/200% inline text
scale, the modal loop (containment, keyboard-shrunk layout viewport, pinch zoom, safe areas, keyboard x text scale) and
prefers-reduced-motion on/off.

## New angles (not in the 225-state sweep or in the twelve earlier records)

`closure-probe.patch` (a patch against `scripts/playtest/ui-audit.mjs`, deliberately not applied to the tree) adds gating probes;
reports are `probe-*.json`. Each probe must execute checks or it fails; none of the probes below is vacuous.

| Probe | What it does | Result |
| --- | --- | --- |
| **Rotate while open** (`probe-rotate-chrome-report.json`) | Sheet open with typed text and focus: 375x812 -> 812x375 -> back; 320x568 -> 568x320 -> back; 768x1024 -> 1024x768 -> back; the two phone pairs again at 200% text. 25 checks each: containment, no overflow, root lock, inert background, focus inside, typed text kept, reason field fully inside the scrolling region, both actions usable, and after restoring the original size the same tight state, sheet height and top. **Limit (reviewer finding 1):** every pair starts and ends in the same tight state, so the "same tight state" check cannot catch a stuck `data-tight`; it proves containment and geometry restoration. Tight-to-roomy release was checked separately, see below | all pass |
| **Dynamic browser chrome** (same report) | Visible height shrinks and grows by URL-bar / toolbar amounts (2 steps x 3 loops) on 375x812, 320x568, 360x740, 768x1024 with the sheet open: contained, bottom sheet flush with the visible bottom, actions usable, identical geometry after the loops | all pass |
| **Forced colors** (`probe-forced-spacing-report.json`) | `forced-colors: active` at phone / tablet / desktop. Gated: the sheet, action, stepper, textarea and select borders are >= 2px, a focus outline exists, axe (excluding colour contrast, which the OS owns) is clean. Checkbox borders and the dashed disabled state are recorded in `info` and visible in the screenshots, not gated; `sheetBorderDiffersFromBackdrop` compares a colour string with an rgba string and is close to tautological | all gated checks pass |
| **Real Tab / Shift+Tab / Escape** (`probe-keys-report.json`) | CDP `Input.dispatchKeyEvent` Tab walk through 18 stops at 375x812, 320x568@200% with the keyboard open, 812x375, 768x1024, 1280x800: focus never leaves the dialog, the cycle wraps, no focus ring clipped horizontally, no focused control hidden behind the pinned action row, Shift+Tab from the heading stays inside, Escape closes, focus returns to "Correct", inert and scroll lock cleared | all pass |
| **WCAG 1.4.12 text spacing** (line-height 1.5, letter 0.12em, word 0.16em, paragraph 2em) | Sheet at five viewports (with the keyboard open on the phone ones), and the GM console, the player in its *Declared* state (1 control; not the compose screen) and the table at 320-1920 wide: no overflow, tap targets kept, controls on screen, no text clipped by its own box, field clears the pinned row after focus from the top | all pass |
| **Wide table displays** (`probe-wide-table-report.json`) | 1280x720, 1366x768, 2560x1440, 3840x2160: no overflow, zero interactive controls, smallest rendered text 12px (a decorative portrait-initial fallback; 14.4px for the smallest real copy) | all pass |

### Harness notes recorded rather than hidden

- The first wide-table run failed a threshold of my own making: it read SVG `font-size` in user units (4.2) instead of the
  rendered size. The probe was fixed to multiply by the SVG's screen scale **and the threshold was lowered from 14px to 12px**;
  the 12px minimum is the decorative portrait-initial fallback, real copy is at least 14.4px. The rerun passes. `probe-forced-spacing-report.json`
  still contains the four superseded wide-table failures from that first run; the forced-colors and text-spacing entries in it are
  valid.
- **Real Escape key stalls Chrome on this Mac.** A synthesized Escape via CDP wedges Chrome's browser main thread for minutes
  (`sample` shows `NSMenu performKeyEquivalent` -> `SCNetworkSetCopyAll`). It is macOS/Chrome environment behaviour, not the app:
  page JS is idle and the sheet closes correctly. So the real key is sent for the 375px case (recorded `escapeVia:
  "cdp-real-key"`), and dispatched as a DOM `KeyboardEvent` for the other four (`"dom-keyboardevent"`; the sheet listens on
  `document`). A first attempt that also sent a real Escape at 320x568@200% (keyboard open) printed `closed state {open:false,
  focus:"Correct", anyInert:false, locked:false}` in its console before I stopped it; that log is not committed.
- The key-walk `stops` labels are blank for checkboxes (`input.textContent` is empty; their names come from `<label>`). Cosmetic,
  the checks do not depend on them.

## Independent-review follow-ups (approve with record corrections; all applied to this record)

The reviewer confirmed the no-defect finding and re-ran `rotate,chrome,forced` against its own preview of the same bundle (12 probes,
0 failures, check counts identical to the committed reports). Mutation runs on copies of `dist`: removing the sheet/stepper borders
under forced colors fails 6 checks, and never engaging tight mode fails 4 `reasonFullyVisibleAtEnd` checks, so those probes detect
regressions. A stuck-`data-tight` mutant passes the rotate/chrome probes (finding 1 above), so the reviewer checked release
directly with a throwaway probe that forces flips: 320x568 with the keyboard shrink false -> true -> false; text scale 200 -> 100 ->
200 -> 100 -> 200 true -> false -> true -> false -> true; 812x375 with the keyboard false -> true -> false; 768x1024 at 200% with the
keyboard false -> true -> false. Product behaviour is correct. Other reviewer notes now recorded: the player-compose claim was
wrong (fixed above); the reviewer ran text spacing on the real compose screen (20 controls) at 320/375/768/1280 and with "Why?" open
at 320/375, all clean; the keys probe skips its pinned-row check when the ring is 0 (the global `:focus-visible` gives 6px); the
chrome probe's `actionsInside` is an OR with `actionsUsable`; the text-spacing clip detector only flags `overflow: hidden|clip`
boxes; rotation and browser chrome are layout-viewport emulations. Five native `type="number"` inputs (`SceneDirector`,
`GmToolsPanel`) were missing from the inventory; they are covered by the sweep's control audit (44px, 16px type).

## Observations, not defects (no change made)

1. `SheetDialog` closes on `Escape` without checking `event.isComposing`, so an IME user pressing Escape to cancel a composition
   in the reason field would dismiss the sheet. Not reproducible faithfully with CDP key events, sheets hold only a reason
   string, so it is recorded for John rather than fixed on a synthetic reproduction.
2. Table type on a 3840x2160 CSS-pixel display is `1.4rem` (22.4px). A 4K TV normally runs at a device pixel ratio of 2 (1920 CSS
   px), where it is the audited 1920 layout; a 1:1 4K desktop monitor reads smaller. Design choice, no requirement violated.
3. In forced colors the select chevron is a background image on a forced background; the select keeps a 2px border and its text,
   so it stays identifiable. A physical Windows High Contrast pass is John's.

## Determination

**No reproducible product defect.** By the brief's scope rule, no source change. Only this record, the handoff entry and
`docs/evidence/bt-closure/` were added.

## Open (not provable headless)

Physical iOS Safari (visual viewport shrinks without resizing the layout viewport), physical Android URL-bar collapse, OS large
text with the keyboard open, Windows High Contrast. Physical two-device rehearsal remains John's. Nothing here is deployed.

## Independent second-pass review

Fresh reviewer agent (second pass): **approve with record corrections**, applied above. Reviewer evidence copies were left in its own
temp directory and are not committed. Unverified by design: the keys probe with a real Escape, physical devices, Windows High Contrast.
