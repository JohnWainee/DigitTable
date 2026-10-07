# gx reskin and pop-out evidence (2026-10-07)

Branch `sonnet-gx/reskin-orchestrated-20261007`, from the reviewed candidate `ccb9f2d` (the fq reskin lineage). Everything ran against a **local** Firebase emulator stack on remapped ports (project `demo-digitable-gx`; peers hold the default ports, so a throwaway Vite plugin and an untracked `firebase.gx.json` moved only the port numbers — no repository change) and local `vite preview` builds. Nothing was deployed; no staging or production resource was touched.

- `before/` — unmodified `ccb9f2d`. `after/` — this branch. Same states, same widths: `phone` 375×812, `tablet` 768×1024, `desktop` 1280×800, `table` 1920×1080 (downscaled to ≤900 px, full-page). The audit also covers `phone-small` 320×568 and `phone-landscape` 812×375 (not all screenshotted here; see the JSON).
- `reports/ui-audit-before.json` / `ui-audit-after.json` — full machine-readable output of `scripts/playtest/ui-audit.mjs`. Smoke reports are not committed (they hold throwaway room codes).

## What changed

- **Ink**: `--ink-0` is now `#000000` (was `#020203`); other ink tokens darker; the red/cyan page haze is dimmer so surfaces read black.
- **Hierarchy (three tiers)**: active-decision panels (compose, allocation, injury, resolved, declared, pending actions, invite) keep the paper border and loud print shadow and gain an inner ink rim and registration crop marks; reference panels (scene, party, roster, GM tools) recede to a quiet rule border with a coloured spine; fieldsets are dashed. The one primary action of a decision panel is a taller (3.5 rem, 1.5 rem type) full-width slab. The pop-out's action row is deliberately excluded, so Apply/Cancel stay above an on-screen keyboard.
- **Pop-outs**: inventory of every native `<select>`, `<details>` disclosure and the single modal sheet. A new in-page audit (`POPOUT_INVENTORY`) checks, at all six viewports, that each select is inside the viewport, ≥44 px tall, ≥16 px type, labelled, and — if its selected option is truncated — echoed in full next to it; and that each open disclosure is inside the viewport, ≥44 px summary, with no clipped descendant. It found one real defect: the GM scene select truncated its title at 320 px with no echo. Fixed (`SelectedEcho`) with a unit test.
- Narrow-phone panel padding is now `min(1rem, 3.2vw)` below 24 rem. Side effect, verified: the previously **non-gating** 320 px + 200 % text sheet check (`dialogInsideViewport`, `noPageOverflow`) now passes, so that documented limit is closed.
- A first draft also made the sheet footer's primary button tall; the existing 320×312 keyboard scenario failed (`actionsVisible`) and caught it before commit. Reverted for the sheet and pinned by a contract test.

## Results

| Check | Before (`ccb9f2d`) | After |
| --- | ---: | ---: |
| State × viewport captures | 150 | 150 |
| Controls audited | 1,530 | 1,470 |
| Control findings (<44 px, outside viewport, text entry <16 px) | 0 | 0 |
| States with horizontal overflow | 0 | 0 |
| axe hard (WCAG 2.x A/AA, 2.2 AA, incl. real colour contrast) violations | 0 | 0 |
| axe best-practice notes | `page-has-heading-one` on the nonexistent-room route | same (intentional) |
| Pop-out inventory checks (selects / disclosures) | not present | 12 sweeps: 36 selects, 6 disclosures, 0 failures |
| 320 px + 200 % text sheet geometry | recorded, not gating (failed) | passes |
| Audit failures | 0 | 0 |
| `two-device-smoke.mjs --reload` | n/a | 17/17 |
| `npm run check` | 714 passed | 720 passed / 11 todo |
| Emulator suite | — | 18 rules/testing, 86 Functions, 4 web passed |

## Limits (not claimed)

Headless Chrome only. No physical iOS Safari / Android keyboard pass, no VoiceOver / TalkBack / NVDA, no Windows High Contrast run (forced-colors is asserted in CSS only), no real-device or staging evidence. Native `<select>` option popups are drawn by the OS/browser and cannot be inspected through CDP; the audit covers the closed control and its context, not the OS popup itself.
