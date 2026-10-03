# Independent review: sticky commit bar for the compose and allocation cards

- **Candidate:** `sonnet-dg-reskin-orchestrated-20261002`, from verified `492bf27`.
- **Author:** Sonnet session `dg`. **Reviewers:** two separate fresh read-only subagent passes, 2026-10-02 (neither wrote code).
- **Scope:** `apps/web` compose/allocation cards, `styles.css`, `scripts/playtest/ui-audit.mjs`, contract tests. No engine, contracts, template, Functions, rules, authorization or projection file changed.

## The gap found

All earlier reskin and mobile audits checked that controls are reachable, 44 px, inside the viewport and not horizontally overflowing, and they audited selects, the correction sheet, steppers and pickers one by one. None checked that the *primary action* of a long picker stays near the option being chosen. On a 375 px phone the compose card is about 1,650 px tall and the allocation card about 1,330 px, and Declare / Confirm sit at the very bottom. The audit also never reached the injury-choice panel (dice-dependent); that residual remains and is recorded below.

## Change

A `.commit-bar` wrapper holds Declare (compose) and the running dice count plus Confirm (allocation), together with the downed/retired/acted reason that explains a disabled button. It is `position: sticky; bottom: 0` only inside `@media (min-height: 32rem)`, so phone landscape and large browser text fall back to an in-flow row. It is not a fixed overlay, so it does not interact with the on-screen keyboard (neither card has a text field). `scroll-margin-block-end: 16rem` sits on the focused element (input, summary, button) so a keyboard-focused control scrolls clear of the bar; the bar's own buttons are exempt.

## Pass 1: findings and dispositions

No blocking finding. Command dispatch, disabled-state logic, projections and AGENTS.md boundaries were unchanged.

1. **Medium, fixed.** The audit's focus probe could not fail: Chrome centres a far-off element, so the 2.4.11 clearance looked fine whatever the CSS said. It now starts each control partly visible so the browser scrolls the minimum and honours `scroll-margin`. Removing the margin now fails 20 assertions.
2. **Low-medium, fixed.** The margin was on `.gear-option`, but the focused element is the input; and `summary` / row buttons had none. It is now on `:is(input, summary, button, select, textarea)`, and the probe covers the last option, the "Why?" summary and a row's own button.
3. **Low-medium, fixed.** Pinning separated Declare from its reason alerts. They now live inside the bar, above the button; a test asserts the acted-this-round reason and the disabled Declare share a `.commit-bar`.
4. **Low, fixed.** The committed text-200 evidence predated the final script; regenerated.
5. **Low, fixed.** Contract-test slices were unbounded; `auditCommitBar` is now sliced to its own function.

## Pass 2 (fresh reviewer over the fixes): findings and dispositions

No blocking finding; fixes 1 to 3 above confirmed correct. New items:

1. **Medium-low, fixed and confirmed real.** The element margin also matched the bar's own buttons, so focusing Declare/Confirm scrolled the page. A mutation run measured a **196 px jump**. Added `.commit-bar button { scroll-margin-block-end: 0 }`, an audit assertion that focusing the bar's button does not scroll, and a CSS contract test.
2. **Low, fixed.** The 320 px exemption had no size limit; it is now capped at 50 px (the baseline value is 47 px / 11 px).
3. **Low, fixed.** The README control count was stale; corrected.
4. **Low, fixed and strengthened.** A fixed margin against a bar that grows with a reason: the audit now injects a worst-case two-sentence alert into the bar and re-probes. That raised the needed margin (bar reached 231 px at 320 px wide), so the margin went from 9rem to 13rem to 16rem; the bar still stays under half the screen.
5. **Low, fixed.** `--text-scale=200` (equals form) was silently ignored and a bare flag ran at 100%; both are parsed and out-of-range values exit 2.
6. **Low, partly accepted.** The audit-harness contract tests are substring checks, the established pattern here; the behavioural proof is the audit itself, validated by four mutation runs (below). A test for the compose alerts was added.
7. **Process.** This record and the handoff entry were the outstanding process items; both are now done.

## Evidence (local `demo-digitable-dg` emulators on remapped ports; nothing deployed)

- `npm run check`: 759 passed, 11 todo (baseline 753 plus 6). `npm run build`: passed (existing chunk warning). `npm run test:emulator`: 18 rules, 86 Functions, 4 web.
- `ui-audit.mjs`: 216 states, 2,550 controls, 0 control, overflow or hard-axe findings, 87 keyboard-focus checks, 8 validation scenarios, 21 sheet cases, 12 commit-bar cases, 0 failures. `--text-scale=200` (Chrome default font size doubled, commit-bar checks only): passed. 320 px wide overflows by 47 / 11 px, identical on the baseline build, recorded and not gating.
- Mutations on the built bundle, each caught: `sticky` to `static` (26 failures), scroll-margin removed (20), margin cut to 4rem (20 in the with-reason probe), bar-button override removed (6, a 196 px page jump).
- `two-device-smoke.mjs --reload`: 17/17.
- Before/after captures at 320, 375, 768, 1280 and 1920 widths in `docs/evidence/dg-commit-bar-20261002/`.
- One transient run of `npm run check` showed 40 find-timeout failures under machine load and was not reproduced (4 clean reruns); noted, not explained.

## Residual limits

Headless Chrome only. No iOS Safari (`interactive-widget` with sticky, the dynamic toolbar, home-indicator inset), Android font-scale, screen-reader announcement order, or Windows High Contrast was exercised, and none is claimed. The injury-choice panel (`ChooseInjuryPanel2`) still cannot be reached deterministically in the live-dice browser audit; it shares the `.gear-option` rules covered by the contract test and jest-axe. The physical-device and assistive-technology rehearsal in `docs/PLAYTEST_TWO_DEVICE.md` remains required before deployment or merge.
