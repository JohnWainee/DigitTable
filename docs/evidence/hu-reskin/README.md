# hu reskin increment evidence (2026-10-09)

Base `9a01f1d` (hq reskin + mobile-sheet fixes). Local Firebase emulators on remapped ports (`demo-hu`, a peer lane held the defaults) plus `vite preview` builds of the base (`before/`) and this change (`after/`). Nothing deployed. Screenshots: GM console with the opening scene loaded at phone-small 320, phone 375, tablet 768, desktop 1280, table 1920, and the new select audit framing the scene picker (320, 375, 768, 1280, and 320 at 200% text).

## Defects found and fixed (both presentation-only)
1. **Scene picker lost its context.** `#scene-select` ("The Abandoned Métro Platform" and the other scene titles up to 36 characters) is a native select, which can only ellipsise when closed. The other long-text selects already printed their choice through `SelectedEcho`; this one did not, so on a 320/375 px phone the GM saw "The Abandoned Mé…". Fix: `SceneDirector` renders `<SelectedEcho text={selected.title} />` under the control.
2. **Select unusable at 200% text on a 320 px phone.** The nested gutters (screen padding, card padding, fieldset padding, control padding and the chevron zone) were rem-only, so at 200% they consumed ~190 of 320 px: the select was 128 px wide with a 10 px text area (it showed a single glyph), and hint text broke mid-word. Fix: each gutter is `min(<old rem>, <vw>)` where the vw value equals the 100%-text rem at a 320 px viewport (`1rem` -> `5vw`, `0.85rem` -> `4.25vw`, `0.8rem` -> `4vw`, chevron zone `2.75rem` -> `13.75vw`). At 100% text and >= 320 px nothing changes; only enlarged text is affected. Same technique as the hq nested-gutter cap.
3. The `#edit-target` placeholder "Choose one…" ellipsised at 200% text; it now reads "Choose…".

## Audit
`scripts/playtest/ui-audit.mjs` gained `auditSelects`: every visible `<select>` on the GM console at 320, 375, 768, 1280 and 320 @ 200% text. Fails when the selected text does not fit the closed control and no visible `.select-echo` carries the full text, when the select leaves the viewport horizontally, or when it is under 44 px tall. It runs with `--modal-only` too.

## Results
| Check | Base build (new script) | This change |
| --- | --- | --- |
| `ui-audit.mjs` select audit | 8 failures (scene picker at 320, 375 and 320@200%; five 10 px text areas at 320@200%) | 0 failures |
| `ui-audit.mjs` (full) | 150 states, 1,434 controls, 0 control issues, 0 overflow states, 0 axe hard violations | 150 states, 1,422 controls, 0 control issues, 0 overflow states, 0 axe hard violations, 17 modal scenarios + select audit pass, **UI AUDIT PASSED** |
| `npm run check` | 715 passed / 11 todo | 718 passed / 11 todo (+3 regression tests, each verified to fail without the fix) |
| `npm run build` | | passed |
| `two-device-smoke.mjs --reload` (local emulators) | | 17/17 |
| `test:emulator` (remapped ports, a copy of the tree) | | 18 + 86 + 4 passed |

Only best-practice axe note: `page-has-heading-one` on the intentional nonexistent-room route (pre-existing, non-gating).
Reports: `reports/` (the base report is from a `--modal-only` run; the per-state sweep numbers above are from its preceding full run). The smoke report is not committed (throwaway room codes).
Limits: headless Chrome only; no physical iOS/Android keyboard or native picker, screen reader or Windows High Contrast pass; not run against staging.
