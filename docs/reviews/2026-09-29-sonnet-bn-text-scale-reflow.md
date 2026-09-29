# Text-scale reflow: a real gap the tenth reskin re-audit found and fixed (branch `sonnet-bn/reskin-followup-20260929`, 2026-09-29)

- **Base:** `a1751de` (carries the roster-agnostic audit selector, the utility-item tap-target class, and the ninth re-audit).
  Verified as in this lineage before relying on any prior claim (`git log`, tip identical to `origin/sonnet-bl/reskin-hourly-20260928`).
- **Scope:** presentation only (CSS, two JSX wrappers, the audit harness, tests). No engine, contracts, template, Functions, rules,
  projection or authorization change; no deployment; no merge.

## The gap

Nine prior passes audited text scaling **only with the GM correction sheet open**; the 150-state sweep ran at 100% text. The
sheet's 320px@200% checks were "recorded, not gating" with the explanation that the console behind it overflowed. That was not a
limit of the console to accept: it was a real reflow defect (WCAG 1.4.4 / 1.4.10 / 1.4.12). A text-scale pass over every state
(320px@150%, 320px@200%, 375px@200%) failed before the fix:

| State (viewport, root font) | Before | Cause |
| --- | --- | --- |
| Player compose, paused (320@200%) | page overflows **143px**; "Mark and regain Blood" at x=367..463 of 320 | button inside the item's `<label>` flex row |
| Player compose (375@200%) | overflow 88px, same button off-screen | same |
| Player compose (320@150%) | overflow 29px, same button off-screen | same |
| GM next-scene (320@200%) | overflow 6px; "Reveal" at 230..326 of 320 | `.gear-option` row with text + button |
| Player allocation (320@200%) | overflow 11px | nested rem gutters left a 130px option column |
| GM pending actions (320@200%) | overflow 4px, which widened the layout viewport to 324px behind the correction sheet | same |

At **100% text on a 320px phone** the GM "Reveal" button was also squeezed into an unreadable "REV / EAL"
(`docs/evidence/bn-text-scale/before/gm-console-next-scene-320-text100.jpg`).

## The fix

1. `styles.css`: nested inline gutters (`--gutter-page/-panel/-inner/-tight`) are `min(<rem>, <vw>)` with the vw cap equal to the old
   rem value **at 320px**, so at 100% text every phone width from 320px up resolves to the previous values (reviewer re-derived
   this), while 150-200% text can no longer stack page > panel > fieldset > option-row gutters past the screen. Text and 48px tap
   targets still scale. `overflow-wrap: anywhere` on option rows is the last resort for a long word.
2. Utility-item action moved out of the `<label>` into `.gear-option-row` (flex-wrap): beside the option when it fits, below it when it
   does not. Bonus: the checkbox's accessible name no longer contains the button text, and no interactive control sits inside a
   label. The GM Reveal row got the same wrap (`.gear-option--action` / `.gear-option-text`).
3. `scripts/playtest/ui-audit.mjs`: a **gating** text-scale pass on every state (no horizontal overflow, controls inside the viewport
   at the tap size, layout viewport not widened, first offender named on failure); the 320px@200% correction-sheet checks are gating.
4. Tests: `reskinContract.test.ts` pins the gutter tokens, their use, and the wrap rules; `ComposeStep2.test.tsx` pins the button
   outside the label, its `gear-option-row` parent, and the checkbox's name.

## Evidence (fresh, local `demo-digitable` emulators, production-shaped build served by `vite preview`)

- Before/after screenshots: `docs/evidence/bn-text-scale/{before,after}/` (compose, GM next-scene, GM pending, allocation at
  320@200%; Reveal row at 320@100%; correction sheet at 320@200%). Every after image is 320px wide (before: 324/326/331/463px).
- `ui-audit.mjs` before the fix (baseline, 150 states): passed, and with the new pass added, 6 states failed as tabulated above.
  After: **225 states, 2,223 controls, 0 control issues, 0 overflow states, 0 hard axe violations, 0 failures**; the two former
  informational modal checks pass and the `INFO ... not gating` lines are gone.
- `two-device-smoke.mjs --reload --no-images` against the fix: **17/17**, zero console/request errors.
- `two-device-smoke.mjs --reload` against deployed staging (`https://digitable.signal-bleed.com`, serving `5e8907b`, i.e. **not** this
  source): **17/17**, zero device failures, no overflow findings. Deployed-build evidence only.
- `npm run check`: **712 passed | 11 todo** (75 files, 1 skipped; was 708). `git diff --check` clean.
- `npm run test:emulator` not run: ports 8080/9000/5001/9099 are held by another worktree's long-running emulator stack
  (`sonnet-aj-reskin-hourly-20260926`, started 2026-09-25) and I did not disturb it. Nothing under Functions, rules, `packages/*` or
  `templates/*` changed, so the last complete 108/108 stands.

## Independent review (fresh reviewer agent, second pass)

Verdict: no correctness, privacy or authorization defect. Verified: the vw caps are no-ops at 100% text for widths >= 320px; the
`max()` safe-area padding stays valid; no script or test selector depended on the button being inside the label; the audit's failure
gating and font/viewport restore are sound; presentation-only. It ran `vitest run apps/web` (273 pass) and `prettier --check`.

Findings and dispositions:

1. *Low, mid-word breaks at 320@200% ("Braw/l").* Accepted: reflow beats overflow and only occurs at the extreme; a smaller checkbox
   at large text would hurt the tap target. Recorded, not changed.
2. *Low, at 100% text on phones the utility button now sits on its own line below its item, outside the highlighted label.* Accepted
   as intended (it previously squeezed inside the row); recorded so it is not mistaken for a regression.
3. *Low, audit could compare against a widened layout viewport.* **Fixed:** the text-scale pass also fails if `innerWidth` exceeds the
   emulated device width (re-ran: 225 states, 0 failures).
4. *Nit, the Reveal row structure is pinned only by the CSS contract test.* Accepted; the gating audit pass is the real guard.
5. *Process, handoff and review record missing.* This file and the `CLAUDE_HANDOFF.md` entry.

## Open

Physical-device rehearsal remains John's; a real iOS Safari keyboard/visual-viewport pass is still outstanding. The fix is not
deployed; deploying it requires John's explicit direction.
