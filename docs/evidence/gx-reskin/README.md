# gx reskin / mobile pop-out evidence (2026-10-07)

Branch `sonnet-gx/reskin-uiux-20261007`, from `354e7c9` (fq reskin + fu audit lineage). Everything ran against a **local** Firebase emulator stack (`demo-digitable`) and local `vite preview` builds. Nothing was deployed, no staging or production resource was contacted, and this is **not** candidate-against-staging evidence.

## The defect (found by measuring, not guessing)

The fu audit recorded a ~5 px overflow at 320 px / 200% text but only measured it with the correction sheet open. A closed-sheet sweep (new in this change: `captureTextScale` in `scripts/playtest/ui-audit.mjs`) showed it was far wider than recorded: on the unmodified base, with **no pop-out open**, the page scrolled sideways at 320 px / 200% text on six states, and label text spilled out of its row on 25 states at 320/375/390 px.

| State (320 px, root text 200%) | Page overflow before | After |
| --- | ---: | ---: |
| player compose / compose with "Why?" open / paused | 47 px | 0 |
| player allocation / allocation assigned | 12 px | 0 |
| GM console with a pending action | 5 px | 0 |

Cause: nested rem-sized inline chrome (screen padding > panel padding > fieldset padding > option-row padding and gap > 1.65rem check box) is ~12 rem wide in a 10 rem viewport, leaving ~2 px for a label. Fix (`apps/web/src/styles.css`): `--fit-*` tokens, each `min(<rem>, <n>vw)` with `n` chosen so the value equals the rem size at 320 px / 100% text (nothing moves at default text size), applied to those layers; option rows also get `min-width: 0; overflow-wrap: anywhere`; the check glyph and radio dot scale with their box. No markup, behaviour, engine, contracts, template, Functions, rules, projection or authorization file changed.

## Files

- `before/` — the unmodified `354e7c9` build; `after/` — this change. Phone 375x812, tablet 768x1024, desktop 1280x800, table 1920x1080 (downscaled to 1000 px wide) for player compose, player allocation, GM console (pending action) and the table display, plus the 320 px / 200% text frames (`*-phone-small-text200.jpg`) for compose, allocation, paused and the GM console.
- `reports/ui-audit-after.json` — full run on the final candidate. `reports/text-scale-before-baseline.json` — the text-scale sweep against the unmodified build (6 overflow states, 25 spill states). `reports/text-scale-after.json` — the same sweep on the candidate (0 and 0).
- Smoke reports are not committed (throwaway room codes).

## Results

| Check | Base `354e7c9` | Candidate |
| --- | ---: | ---: |
| `ui-audit.mjs` state x viewport captures (25 states; this change adds a 390 px viewport) | 150 (6 viewports) | 175 (7 viewports) |
| Control findings / overflow states / axe hard violations | 0 / 0 / 0 | 0 / 0 / 0 |
| Text-scale checks (150% and 200% text, 320/375/390 px, sheet closed) | 6 overflow, 25 spill states | 100 run, 0 overflow, 0 spill |
| Modal scenarios (incl. sheet at 320 px / 200%, previously "recorded, not gating") | 17, one non-gating failure | 17, all gating, all pass |
| `npm run check` | 714 passed, 11 todo | 721 passed, 11 todo (7 new) |
| `two-device-smoke.mjs --reload` (local build + emulators) | not rerun | 17/17 |
| `npm run test:emulator` (remapped ports, scratch clone) | 18 / 86 / 4 | 18 / 86 / 4 |

axe best-practice note unchanged: `page-has-heading-one` on the intentional nonexistent-room route.

## How it was produced

```bash
cd apps/web
VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_AUTH_DOMAIN=demo-digitable.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=demo-digitable VITE_FIREBASE_APP_ID=1:000000000000:web:demo \
VITE_FIREBASE_USE_EMULATOR=true npx vite build --outDir /private/tmp/gx-dist-after --emptyOutDir
npx vite preview --outDir /private/tmp/gx-dist-after --port 4381 --host 127.0.0.1
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4381 --label after --out <dir>
node scripts/playtest/two-device-smoke.mjs --base http://127.0.0.1:4381 --out <dir> --reload
# emulators: the lane's own emulator held ports 8080/9099/5001/9000, so the suite ran from an APFS
# clone with those ports (and hub/logging/websocket) remapped to 1xxxx; the remap is not committed.
PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator
```

## Known limits (not hidden)

- The audit's font override scales `rem`, not the browser default that `em` media queries read; the fix deliberately uses viewport-capped lengths, not em breakpoints.
- No physical iOS Safari / Android keyboard, screen-reader, Windows High Contrast, or real browser font-size-setting pass. Headless Chrome cannot reproduce the iOS visual-viewport/keyboard split.
- No 280 px viewport or landscape-at-200% sweep. Reviewer-noted candidates outside the audited states: `.party-member` and `.connection-status` have no `overflow-wrap` rule (a long display name could widen them); the audited fixtures fit.
- The audited control count differs between runs of the same build (1,659 and 1,841 on the candidate, 1,470 on the base). I did not investigate why (the audit drives a live, randomised session); every run's checks passed or failed independently of it.
