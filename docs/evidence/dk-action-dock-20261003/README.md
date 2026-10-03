# Action dock evidence (2026-10-03, `sonnet-dk/reskin-orchestrated-20261003`)

Presentation-only change in `apps/web`: a sticky **action dock** (live status + primary action) on the
player Compose, Allocation and Choose-injury panels and on each GM pending-action card, plus a per-die
chosen-target echo in the allocation legends. See `docs/reviews/2026-10-03-dk-action-dock-independent-review.md`.

Everything here was produced against a local build and an isolated, remapped Firebase emulator stack
(auth 29099, Firestore 28080, Functions 25001; project `demo-digitable`; web 24175, Chrome debug ports
293xx). Nothing touched the default emulator ports, any peer lane, or any cloud resource.

| Path | What it is |
| --- | --- |
| `before/` | Full-page captures from the base commit `f59f421`: Compose, Allocation and GM pending actions at phone (375), tablet (768), desktop (1280) and table (1920) widths. On a phone the Compose page is 2,605px tall with "Declare action" at the very bottom. |
| `after/` | The same states and widths on this change (full page, so the dock appears in its resting place at the end of the panel). |
| `after-dock/` | **Viewport-only** captures scrolled to the middle of each panel, at 320, 375, 390, 412, 600, 768, 812 (landscape), 1280 and 1920 wide: the dock pinned over the choices. A full-page capture cannot show a pinned element, so these are the evidence for the new behaviour. |
| `before-summary.json`, `after-summary.json` | `ui-audit.mjs` summaries (and, for "after", every dock audit result). |
| `smoke-final.log` | `two-device-smoke.mjs --reload`, 17/17 steps (final candidate). `smoke-first-candidate.log` is the same run on the first candidate, before review fixes. |
| `emulator-suite-summary.log` | `npm run test:emulator` result lines (see "Emulator suite" below). |

## Numbers

- `ui-audit.mjs` before (base): 288 states, 3,272 controls, zero control, overflow or hard axe findings.
- `ui-audit.mjs` after: 288 states, 3,336 controls, zero control, overflow or hard axe findings (control
  counts vary with the random roll). Plus **36 dock audits** (4 states x 9 viewports) and **315
  focus-not-obscured checks**: dock fully on screen while its panel is, within 45% of the visible height,
  its primary button described by visible status text, and every enabled control, scrolled to by the
  browser from just below the viewport, left clear of the dock (WCAG 2.2 SC 2.4.11).
- The known best-practice note `page-has-heading-one` on the intentional missing-room route remains.
- The Choose-injury dock is covered by jsdom tests but was not reached by the browser audit (it needs an
  injury roll, which the random audit roll does not guarantee).

## Emulator suite

Fixed default ports 8080/9099/9000/5001 and the hub (4400) were held by peer lanes, which were not
stopped. `npm run test:emulator` ran from an APFS clone (`/private/tmp/digitable-dk-emu`) whose only
differences were the port numbers (`firebase.json`, `packages/testing/src/emulator.ts`,
`apps/web/test-emulator/session.test.ts`): 18 rules, 86 Functions, 4 web tests passed. The change itself
touches no rules, Functions, contracts or engine file.

## Limits (not hidden)

- Headless Chrome cannot reproduce the iOS Safari visual-viewport-only keyboard, rubber-band overscroll,
  or the dynamic toolbar; the dock does not rely on them (no text entry on any dock screen) but a
  physical iPhone/Android pass is still required (`docs/PLAYTEST_TWO_DEVICE.md`).
- No screen reader (VoiceOver, TalkBack, NVDA) was run: the dock's accessible name and description are
  asserted in jsdom (`toHaveAccessibleDescription`) and by axe only.
