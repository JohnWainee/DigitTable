# hq reskin increment evidence (2026-10-09)

Base `c7415d4` (reviewed candidate `9c6d254`). Local Firebase emulators (`demo-digitable`) plus `vite preview` builds of the base (`before/`) and this change (`after/`); nothing deployed. Screenshots: GM console, landing, and the sheet at 320 px / 200% text, at phone 375, tablet 768, desktop 1280, table 1920 (plus 320 small phone).

## Defect found and fixed
The fu audit's recorded backlog item: with the correction sheet **closed**, the GM console overflowed the page horizontally at 320 px and 200% root text (rem-only gutters on card > option row > panel). The old script only measured it with the sheet open.

- Fix: `.gear-option`/`.form-field--checkbox` gap+inline padding and `.pending-action-card` etc. padding are now `min(<old rem>, <n>vw)`, never larger than before.
- Audit: `ui-audit.mjs` text-scaling scenarios now also measure the closed page (`closedNoPageOverflow`) and the 320 px/200% scenario is **gating** (was informational).
- Regression: `reskinContract.test.ts` pins the `min(rem, vw)` gutters.

## Results
| Check | Base build (new script, `--modal-only`) | This change |
| --- | --- | --- |
| 320px/200%: dialogInsideViewport, noPageOverflow, closedNoPageOverflow | all three FAIL | pass (closed overflow 0 px) |
| Full `ui-audit.mjs` (150 states, 17 modal scenarios) | n/a (old script passed with the item informational) | 0 failures |
| `two-device-smoke.mjs --reload` (local) | | 17/17 |
| `npm run check` | | 715 passed / 11 todo |
| `npm run build` | | passed |
| `npm run test:emulator` | | 18 + 86 + 4 passed |

Reports: `reports/`. Smoke reports are not committed (throwaway room codes).
Limits: headless Chrome only; no physical iOS/Android keyboard, screen reader or Windows High Contrast pass.
