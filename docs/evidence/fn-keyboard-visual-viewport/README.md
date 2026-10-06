# fn: the correction sheet with very little visible height (2026-10-06)

Lane `sonnet-fn`, base `9c1d36e` (`codex/reskin-fi-integration-20261006`). Raw `report.json` files stay
untracked (they hold ephemeral emulator room codes); [`chrome-audit-summary.json`](chrome-audit-summary.json)
is the redacted record of both Chrome runs.

## Defect

`SheetDialog` pins a header and a footer around a scrolling body. iOS Safari raises the on-screen keyboard
by shrinking only the **visual** viewport, so on a landscape phone with the keyboard up the sheet gets
roughly 70-140px (heights measured by earlier lanes in the iOS Simulator; the numbers below are what the
audit feeds the hook). The pinned chrome alone needs ~110-170px, so:

- `.sheet-body` collapsed to its own 24px of padding;
- the footer (Apply correction / Cancel) was clipped by the sheet's `overflow: hidden` and could not be
  scrolled to by any gesture (programmatic `scrollIntoView` still moves it, which is why an earlier probe
  style reports it "reachable");
- the focused reason field was not visible, so the GM typed blind and could neither submit nor cancel
  (Escape and Back still dismiss).

The repo's audit could not see it: headless Chrome shrinks the layout viewport for its keyboard emulation,
which the app handles, and its pass criteria only checked bounding boxes.
`ui-audit.mjs` itself recorded this as a known limit. Prior lanes found the same class of defect in
sibling lineages (`sonnet-fc`/`fg`, a JS `data-compact` mode); that work is not an ancestor of this branch and
was not merged (see "Lineage" below).

## Fix (CSS only, `apps/web/src/styles.css`)

The backdrop is already sized from `--vv-height`, so it is a fixed-size box whose height is the honest
"how much can the person see". It becomes a size container, and below 18rem of its content height the
whole sheet scrolls as one page (title, fields, then the action row) with scroll confined to the sheet:

```css
.sheet-backdrop { container-type: size; container-name: sheet-box; }
@container sheet-box (max-height: 18rem) {
  .sheet { overflow-y: auto; overscroll-behavior: contain; scroll-padding-block: 1rem; … }
  .sheet-body { flex: none; overflow: visible; }
  .sheet-footer { max-height: none; overflow: visible; }
}
```

No JS, no markup, no hook change. `rem` resolves against the real root font size inside `@container`, so
large text reaches the compact layout sooner (pinned chrome grows with text too). Engines without size
container queries ignore it and keep the previous layout. Presentation only: engine, contracts, templates,
functions, authorization, projection, Firebase, assets and dependencies are untouched.

## Evidence

### Real Mobile Safari (iOS 26.5 Simulator), `sheet-probe.html`

A static page that links the app's real stylesheet (pre-fix copy vs fixed copy) and the sheet's DOM, sets
`--vv-height` exactly as `useVisualViewportBox` does, waits out the 0.18s entrance animation, then measures:
reason field first line visible, and title / reason / Apply / Cancel each fully inside the visible box with
centre and four corners hit-testable after scrolling only user-scrollable ancestors. It does **not** raise
the real keyboard (the XCUITest rig that does lives in sibling lanes, not this lineage).

| Device, visible height | Pre-fix stylesheet | Fixed stylesheet |
| --- | --- | --- |
| iPhone 17 Pro, 140px | FAIL (reason, Apply, Cancel unreachable) | PASS |
| iPhone 17 Pro, 90px | FAIL (title, reason, Apply, Cancel unreachable) | PASS |
| iPad Pro 11" (M5), 266px | passes the checks, but the "Reason (required)" label is clipped under the title | PASS; label, field and actions together |

Screenshots: [`safari/`](safari/). WebKit reports `containerType=size` and applies the query.

### Real Chrome, `scripts/playtest/ui-audit.mjs`

New `vv-keyboard-*` scenarios replace `window.visualViewport` with a controllable stand-in so the real hook,
stylesheet and layout engine react (landscape 844x390 at 90 and 140px visible, 667x375 at 130px, 1024x768 at
266px, 320x568 at 300px and 330px, 375x812 at 470px as a control). Checks: dialog inside the visual
viewport, reason first line visible when the keyboard opens, title/reason/Apply/Cancel reachable by
scrolling, 44px action targets, no page overflow.

- Pre-fix stylesheet (negative control, `--modal-only`): **13 failing checks** in the three landscape scenarios
  (`reasonFirstLineVisibleWhenKeyboardOpens`, `reasonReachable`, `applyReachable`, `cancelReachable`, plus
  `titleReachable` at 90px). Screenshots: [`chrome-before/`](chrome-before/).
- Fixed: full audit **150 states, 1,434 controls, 0 control issues, 0 overflow states, 0 hard axe violations,
  0 failures**, all new scenarios pass, console errors and failed requests 0 on all four devices. An earlier
  full run on the same fix before the review edits: 150 states, 1,422 controls, 0 failures. The control count
  varies run to run (earlier lanes recorded 1,434-1,530) because some branches (injury choice) depend on
  random rolls; it is not a coverage change. Screenshots: [`chrome-after/`](chrome-after/); phone / tablet /
  desktop / table / landscape / small-phone sample states: [`viewports/`](viewports/). Best-practice axe:
  only the pre-existing `anon/route-claim-no-such-room@phone: page-has-heading-one`.
- Two older audit checks assumed "Apply/Cancel visible without scrolling" and were converted to the same
  scroll-aware reachability model (emulated-keyboard `actionsVisible` -> `actionsReachable`; 200%-text
  `actionsReachable`/`reasonReachable`). They pass pre-fix and post-fix, so they were not weakened to hide
  the change. The visual-viewport stand-in is restored (real descriptor reinstated) after each scenario.

### Unit / contract tests

`apps/web/test/styles/reskinContract.test.ts`: four new tests (backdrop is a `size` container named
`sheet-box`; compact block scrolls `.sheet`, un-pins body/footer, threshold >= 15rem, `scroll-padding-block`;
block placed after the rules it overrides; audit contains the stand-in and the scroll-aware probe). Mutation
checked: threshold lowered to 8rem, `container-type` removed, and footer cap not lifted each fail a test.
jsdom does no layout, so behaviour is proved by the browser runs above.

## Not covered / limits

- No real keyboard, no physical device, no real Android Chrome. Safari runs are the supplied-height probe
  on iPhone 17 Pro and iPad Pro 11" simulators (portrait buffers; a landscape width was not simulated).
- 18rem is derived from the arithmetic of the pinned chrome (header ~3-4rem + footer ~4-8rem + a labelled
  field) and the heights above, not from a real-keyboard sweep; a physical iPhone in landscape is the open
  check. Between ~18rem and ~21rem the pinned layout still leaves a small body (tight on a 320px-wide phone
  with stacked actions; the `phone-small-330` scenario covers it and passes).
- At 200% text on a 320x568 phone the sheet is now in the compact layout (568 < 18 x 32px); the two
  informational (non-gating) checks recorded since earlier lanes for that case are unchanged.

## Lineage

An earlier unmerged lane (`sonnet-fg`, `f3fc981`, and its `fc`/`ez` ancestors) solved the same problem with a
JS `data-compact` attribute set by `useVisualViewportBox` and a 18rem threshold. This branch re-derived a
CSS-only equivalent rather than merging that line (merge authority is John's, and that lineage also carries
unrelated changes). Whichever lands second will conflict or double-apply; pick one mechanism when
reconciling.
