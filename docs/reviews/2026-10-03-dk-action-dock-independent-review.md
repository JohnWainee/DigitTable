# Independent review: sticky action dock for long decision forms (2026-10-03)

- **Scope:** the uncommitted change on `sonnet-dk/reskin-orchestrated-20261003` (base `f59f421`): `ActionDock` and its CSS, its use on the player Compose / Allocation / Choose-injury panels and the GM pending-action card, the per-die chosen-target echo, the contract/flow/unit tests, and the real-browser dock audit with its self-test.
- **Reviewers:** two fresh read-only subagents that did not write the change (author: Sonnet 5.5, this session). Both worked in `/private/tmp` copies, ran lint/format/typecheck/vitest, and mutation-tested. Browser evidence is the author's (see `docs/evidence/dk-action-dock-20261003/`).

## Pass 1 findings and resolution

| # | Sev | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | High | New flow tests flaky (4 of 12 runs): `getAllByRole("group")` throws when the random roll keeps zero dice, so the zero-dice branch was dead | `queryAllByRole`; the zero-dice case is now also tested deterministically (`test/player2/DockStatus.test.tsx`). 10 of 10 consecutive runs green in pass 2 |
| 2 | Medium | Real layout defect at about 540-720px with two long buttons (Confirm + "Destroy Cowboy hat..."): `flex: none` actions crushed the status to a 1-character column, dock hit its 45vh cap and scrolled horizontally. No audited viewport lay in the band | Row layout now wraps (`flex-wrap`, status `1 1 10rem`, actions `0 1 auto`). The audit gained a 600px dock viewport; the self-test renders the **real stylesheet** at 320/360/540/600/700/800px and at 320px with 200% text, and was shown to fail on the pre-fix CSS |
| 3 | Medium | Audit could fail falsely on a zero-dice roll ("no panel controls") | Exempted when the dock status reads "No dice to assign." |
| 4 | Low | Uncaught mutations: bleed margins, the GM card's bleed variables, the volt legend rule, a dangling `aria-describedby` on the injury/GM buttons | Contract assertions added; behavioural `toHaveAccessibleDescription` tests for the injury and GM docks; the source regex now pins the exact ids |
| 5 | Nit | "Your die has a target." read awkwardly | Now "Target chosen." |

## Pass 2 (verification of the fixes)

All five fixes verified against the code; 36 mutations run (27 vitest, 7 self-test, 2 base-layout). No blocker. Remaining findings, all fixed in this change:

- **Medium:** the below-34rem (phone) layout had no regression coverage: flipping the base `column` to `row`, or the action buttons' `flex` to `none`, changed 320-540px layout with every test green. Fixed: contract assertions for both base rules, and self-test cases at 320, 360 and 320px with 200% text. Re-verified by mutating the base direction: the contract test and three self-test cases fail.
- **Low:** zero-dice status and the "you're down" / "your story is told" reasons were only reached by chance. Fixed with deterministic tests (`DockStatus.test.tsx`).
- **Low:** the audit's `panelOnScreen` window ignored sticky clamping near the panel top (about 30px false-fail window). Fixed with 40px of slack.

## Accepted / not changed (recorded, not hidden)

- `html:has(.action-dock)` scroll-padding needs `:has()` (Firefox 121+, Safari 15.4+). Without it, WCAG 2.4.11 is not guaranteed for focus-scrolled controls on older engines; the dock still pins and works. Acceptable for the target browsers.
- `overscroll-behavior: contain` on the dock: no effect when it does not overflow in Chrome; WebKit untested. A physical iPhone must confirm a touch-drag starting on the dock still scrolls the page.
- The "no anchored popover/menu/listbox" guard test is a separate concern bundled into this change; it is documented in the handoff.
- Unprotected cosmetic declarations (`overflow-wrap`, `text-transform`, `border-top`, `min-width: 0` redundancies, the 30rem short-viewport padding, the `8rem` scroll-padding fallback used only without `ResizeObserver`) are deliberately not pinned.
- The audit's Choose-injury dock was not reached by the random browser roll; it is covered in jsdom.

## Verified unaffected

No change to authority, authorization, privacy, projections, engine, contracts, Firebase configuration or licensed content (`git diff --stat` shows only `apps/web/src`, `apps/web/test`, `scripts/playtest`, docs). Handlers, payloads, disabled conditions and `role="alert"` messages are preserved; no duplicate or dangling ids; the dock (`z-index` 10) stays below the sheet (100); contrast on the ink surface is above 16:1; focus rings and the button hard shadow are not clipped by the dock's overflow.

## Verdict

Approve after the pass-2 fixes (all applied and re-verified by the gates below). Physical iOS/Android and assistive-technology rehearsal remain required before merge or deployment (`docs/PLAYTEST_TWO_DEVICE.md`).

Final gates: `npm run check` 791 passed, 11 todo; `npm run build` passed; emulator suites 18 + 86 + 4 passed (isolated remapped ports); `ui-audit.mjs` 288 states, 3,336 controls, 36 dock audits / 315 focus checks, zero failures; smoke 17/17.
