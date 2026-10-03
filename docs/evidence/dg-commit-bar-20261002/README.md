# Commit-bar evidence — 2026-10-02 (sonnet-dg)

Baseline `492bf27`; candidate is this branch. Everything ran against a **local** `demo-digitable-dg` Firebase emulator
stack (auth/firestore/functions on remapped ports, so a peer lane's emulators were never touched) and local
`vite preview` builds. Nothing was deployed; staging (`powerglove-1cd23`) was not contacted.

## The gap

Every earlier audit proved controls were reachable, large enough and inside the viewport, but not that the *primary
action* of a long picker stays near the option being chosen. On a 375 px phone the compose card is about 1,650 px tall
and the allocation card about 1,330 px, and their Declare / Confirm buttons sit at the very bottom (see
`before/player-*-midcard-*.jpg`: half way down the card there is no button on screen). The change adds a
`position: sticky` `.commit-bar` (Declare; or the running "N of M dice still need a target" plus Confirm). It is not a
fixed overlay, so it cannot collide with an on-screen keyboard (neither picker has a text field). It is gated by
`@media (min-height: 32rem)`, so phone landscape and large browser text fall back to an ordinary in-flow row.

## Files

- `before/`, `after/` — viewport (not full-page) captures half way down the compose and allocation cards at `phone-small`
  320x568, `phone` 375x812, `tablet` 768x1024, `desktop` 1280x800 and `table` 1920x1080 (`player-<state>-midcard-<viewport>.jpg`).
  The audit also ran `phone-landscape` 812x375, where the bar is deliberately static; that capture is in the raw run only.
- `after/report.json` — the full `ui-audit.mjs` run on the candidate. `after/report-text200.json` — the
  `--text-scale 200` run (real browser default-font-size, commit-bar checks only). `before/report*.json` — the same
  commands on the baseline build with `--tolerate-baseline`: every commit-bar case reports "no .commit-bar rendered".
- `smoke-log.txt` — `two-device-smoke.mjs --reload` on the candidate: 17/17 steps.

## Results

| Check | Result |
| --- | --- |
| Full `ui-audit.mjs` (6 viewports) | 216 states, 2,550 controls, 0 control issues, 0 overflow states, 0 hard axe violations, 87 keyboard-focus checks, 8 validation scenarios, 21 sheet cases, **12 commit-bar cases**, 0 failures. Non-gating: `page-has-heading-one` on the intentional missing-room route |
| Commit bar, 100% text | sticky at 320/375/768/1280/1920; static at 812x375. Button on screen and uncovered with the card top and middle in view, 74 px (compose) / 106 px (allocation) tall at most, last option clears the bar when focused |
| Commit bar, 200% real browser text | static on phones and desktop (the rem gate sees the large text), sticky on tablet/table height; no new failures. 320 px wide overflows by 47 px (compose) / 11 px (allocation) — **identical on the baseline** build, the already-recorded 320 px + 200% geometry limit, recorded and not gating |
| Mutation check | the same built bundle with `sticky` replaced by `static` fails 26 audit assertions (bar not sticky, button off screen), so the audit is not vacuous |

## Limits (nothing is hidden)

- Headless Chrome only: no iOS/Android device, no Safari, no screen reader, no Windows High Contrast. The physical-device
  rehearsal in `docs/PLAYTEST_TWO_DEVICE.md` remains owed. This change does not touch the keyboard-up case because neither
  picker has a text field, but that has not been seen on a real phone.
- The 320 px + 200% text overflow predates this work and is not fixed here.
