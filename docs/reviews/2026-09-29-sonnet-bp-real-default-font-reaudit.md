# Twelfth independent re-audit: real default-font (large text) pass, no product defect (branch `sonnet-bp/reskin-hourly-20260929`, 2026-09-29)

- **Base:** `4417b8d` (already independently reviewed; carries the tap-target class, roster-agnostic selector, text-scale reflow
  and tight-sheet fixes; `git merge-base --is-ancestor f72cdc9 HEAD` succeeds).
- **Scope:** evidence only. No `apps/web`, engine, contracts, template, Functions, rules, projection or authorization change; no
  deployment, merge, cloud resource or other-worktree access. Existing staging proof is of `5e8907b` only.

## Question audited

Every earlier text-scale scenario emulates "150-200% text" by setting `document.documentElement.style.fontSize`. A real browser
large-text setting changes the browser's **default** font size, which also rescales `rem` inside media queries
(`@media (min-width: 40.0625rem)`, `(max-height: 34rem)`, `(min-width: 48rem)`, `(min-width: 110rem)`). The inline emulation keeps
those breakpoints on a 16px basis, so above ~640px wide it exercises the wrong layout (e.g. 926x428 at 200% is a centred card in
the emulation but a bottom sheet in a real browser). A first probe with the inline emulation at 926x428@200% with the keyboard
open reported "field not fully visible"; that turned out to be this emulation artifact, not a product defect (see below).

## Method

Seeding a throwaway Chrome profile with `Default/Preferences` `{"webkit":{"webprefs":{"default_font_size":N}}}` makes headless
Chrome report `getComputedStyle(html).fontSize === "Npx"` **and** `matchMedia("(min-width:40.0625rem)")` scale accordingly (checked
at 32px/926px: `mq:false`). The probe is `real-default-font-probe.patch` (adds `--chrome-font-px N` to `ui-audit.mjs` and extra
keyboard x text-size sheet scenarios (subset listed below); deliberately **not** applied to the tree). The production-shaped,
emulator-mode build (`VITE_FIREBASE_USE_EMULATOR=true`, `demo-digitable`) was served with `vite preview` on 127.0.0.1:4199 against
the pre-existing local demo emulators.

## Results

| Run | Result |
| --- | --- |
| Baseline `ui-audit.mjs` at `4417b8d`, 100% text | **225 states, 2,277 controls, 0 control issues, 0 overflow, 0 hard axe violations, 0 failures** (only the known non-gating `page-has-heading-one` note on the no-such-room route) |
| Inline emulation extended to landscape/tablet/desktop/table at 150-200% (temporary edit, reverted) | 350 states, 3,458 controls, 0 failures (console summary only; **no evidence file was kept**) |
| **Real default font 24px (150%), full state sweep, all six viewports + the existing inline passes on top** | 225 states, 0 control issues, 0 overflow, 0 hard axe violations. Failures listed below are legacy sheet checks only |
| **Real default font 32px (200%), full state sweep** | 225 states, 0 control issues, 0 overflow, 0 hard axe violations. Legacy sheet checks only, same as above |
| Keyboard x large-text sheet scenarios with real fonts, only the subset run: 16px = 5 (375x812, 812x375, 768x1024, 568x320, 926x428); 24px = 6 (320x568, 667x375, 768x1024, 1024x768, 568x320, 926x428); 32px = 7 (320x568, 375x812, 768x1024, 1024x768, 926x428, 667x375, 1280x800) | every scenario passes the rigorous checks (field fully inside the content region, focus-from-top clears the pinned row, both actions usable, axe on the tightest sheet). Only my probe's own `sheetIsNotTight` expectation differs at 1024x768@200% and 1280x800@200% (tight is the correct response there); recorded in the JSON |

The "legacy sheet checks" (`actionsVisibleWithoutScrolling`, `actionsVisible`, `reasonReachableAfterScroll`,
`actionsInsideVisualViewportWhenZoomed`) are the pre-tight-fit 100%-text assertions in the modal loop. They scroll `.sheet-body`,
which is no longer the scroller once `data-tight` is set (the sheet is), and assume the action row is fully on screen even though it
is deliberately capped at 40% and scrolls internally. At real 200% text they therefore report on a layout they were not written
for (e.g. at 375x812 the body's `scrollHeight == clientHeight` because the sheet itself scrolls, with `reasonReachableAfterScroll`
measuring the unscrolled field). An independent reviewer reproduced these failures at 32px and confirmed that on every failing phone case the dialog is `data-tight`, the sheet is the scroller, and scrolling it brings the reason field into view. Reachability at the same sizes is proven by the tight-fit scenarios, which scroll the real
scroller. They are not product defects and they are not gating at 100% text, where the sheet is not tight; recorded for the next
person who runs the harness under a real large-text profile.

## Known limit: Apply visibility in the tightest layouts

With the keyboard open at 200% text and about 206px visible height (812x206, 667x206) or 312px at 320 wide, the capped action row
(40% of the visible height) is shorter than the Apply button (e.g. 170px button in a 123px row; 130px in 80px). Apply is only
partly visible there; it is reachable by scrolling the row and tappable. This is the accepted trade-off already recorded in the
eleventh review, not a new finding.

## Determination

**No reproducible product defect.** Per scope discipline, no source or harness was changed. Only this record, the handoff entry
and `docs/evidence/bp-real-font/` were added.

## Follow-up (not done, harness-only, low priority)

Optionally fold a real-default-font profile into `ui-audit.mjs` (and make the modal loop's legacy checks scroller-aware) so the
large-text gate exercises the true media-query layout above 640px. Nothing failed today, so this was not pulled into a fix.

## Open

Physical iOS Safari (visual viewport shrinks without resizing the layout viewport) and a real device large-text/keyboard pass
remain John's. Nothing here is deployed.
