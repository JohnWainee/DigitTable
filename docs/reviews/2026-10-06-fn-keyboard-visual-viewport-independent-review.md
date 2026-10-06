# Independent review — sonnet-fn correction sheet with very little visible height (2026-10-06)

Reviewer: fresh read-only subagent, separate from the author. It read the diff and `AGENTS.md`, ran
`vitest run test/styles test/shared` (8 files, 105 tests) and `prettier --check` (clean), and probed
headless Chrome for the `rem`-in-`@container` and `visualViewport` restore questions. It did not run the full
audit or a real iOS device.

**Verdict: APPROVE WITH CHANGES.** The CSS fix is sound; the findings were in the audit stub's restore,
stale comments and housekeeping. No P0/P1.

Verified correct by the reviewer: the `@container` block wins the cascade over the base `.sheet-body` /
`.sheet-footer` rules, the `@supports (height: 100dvh)` footer rule and the short-viewport media block;
`container-type: size` on the already-fixed, explicitly-sized, z-indexed backdrop cannot collapse it and no
fixed descendants exist; focus, `inert`, `touch-action` and `html.sheet-open` are unaffected; engines without
size container queries keep the old layout; `rem` inside `@container` resolves against the real root font size
(matched at 32px root, not at 16px); the wide centred-card layout stays pinned; no 2.4.11 obscuring (nothing
sticky); AGENTS.md boundaries intact (styles, one doc comment, a test and the audit script only).

| Priority | Finding | Disposition |
| --- | --- | --- |
| P2 | Audit `__restoreVisualViewport` did `delete window.visualViewport`, permanently removing the real object for the page session (confirmed in Chrome). | Fixed: the real property descriptor is saved at install and reinstated on restore (delete only if there was none). |
| P2 | `SheetDialog` doc comments and the stylesheet header still said header/footer are always pinned. | Fixed: both now state the sub-18rem whole-sheet scroll. |
| P2 | Audit comment cited a README that did not exist. | Fixed: the README exists and the comment says what it records. |
| P3 | Dead `compact: …hasAttribute("data-compact")` in the probe return. | Removed. |
| P3 | Lineage: unmerged `sonnet-fg` already ships a JS `data-compact` mode, so this duplicates it. | Recorded in the evidence README and handoff as a reconciliation decision for John; not merged. |
| P3 | Threshold has a width dependence (320px phone, stacked actions) the scenarios did not cover just above 18rem. | Fixed: added `vv-keyboard-phone-small-330` (passes). |
| P3 | No `scroll-padding-block` in compact mode, so a revealed field could sit flush against the edge. | Fixed: `scroll-padding-block: 1rem` in the compact block (asserted by a contract test). |
| P3 | "Comes after" contract test used the first `.sheet-body {` occurrence. | Strengthened to `lastIndexOf` before the block plus first-occurrence ordering. |
| P3 | Handoff / review record were not yet in the diff. | Recorded (this file and `CLAUDE_HANDOFF.md`). |

The reviewer's "probe quality" reading was confirmed by the negative control (13 failing checks with the
fix removed, 0 with it) and by three mutations of the contract tests; see
`docs/evidence/fn-keyboard-visual-viewport/README.md`. After the review edits the full Chrome audit, the
focused tests, `npm run check`, the build and the emulator suite were rerun on the final code.

Not independently reviewed: a physical iPhone/iPad with a real keyboard, and real Android Chrome.
