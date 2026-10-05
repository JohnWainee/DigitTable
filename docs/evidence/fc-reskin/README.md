# Pop-out audit and landscape-keyboard sheet fix (lane `sonnet-fc`)

Branch `worktree-digitable-sonnet-fc-reskin-mobile-20261005`, from `86e6c93` (the validated `sonnet-fa` reskin candidate). Everything ran against a **local** Firebase emulator stack (`demo-digitable`, fake project, remapped ports 44xxx/45xxx) and local `vite preview` builds. Nothing was deployed, no production resource or secret was used, staging was not contacted.

## Result

One independently evidenced defect, fixed; everything else audited clean.

**Defect (real Mobile Safari, iOS 26.5 Simulator, iPhone 17 Pro, landscape, software keyboard up):** the GM correction sheet kept a pinned header and footer. The keyboard leaves ~70-140 px of visible height, so the reason field overlapped the action row (`testCorrectionSheetWithKeyboardAndPicker`: "the field (135,12,604,49) overlaps the action row (135,44,296,71)", 61 px > 44.5 px allowed). Headless Chrome at 100% cannot shrink only the visual viewport, so the previous lane's audits (all passing) could not see it; this lane used the real-Safari rig that sibling lane `sonnet-ez` built (`scripts/playtest/ios-simulator/`, copied byte-for-byte; see "Provenance").

**Fix (presentation only):** `useVisualViewportBox` sets `data-compact` on the sheet backdrop when the smaller of visual/layout height is under 15rem; the stylesheet then makes the whole sheet scroll as one page (title and actions reached by scrolling the sheet; the focused field is scrolled into view by the existing focus handler). Default layouts are unchanged (compact never engages above 15rem). No change to engine, contracts, templates, rules, projections or authorization.

| Check | Before (`86e6c93`) | After |
| --- | --- | --- |
| Real Safari `testCorrectionSheetWithKeyboardAndPicker` (landscape + keyboard) | **fail** (overlap 61 px) | **pass** (final bundle) |
| Real Safari `testBackClosesOnlyTheSheet` | pass | not re-run (no change in that path) |
| Chrome `ui-audit.mjs` with the new compact-aware keyboard checks and `tight-keyboard-*` scenarios (90/70/60 px visible, with and without landscape-iPhone safe-area insets) | **42 failures** (`compactModeEngaged`, `focusedFieldVisibleInSheet`, `actionsReachableByScrollingSheet`, `focusedFieldVisible`) | **0** (150 states, 1,494 controls, 0 control issues, 0 overflow, 0 axe violations) |
| 150% text / 200% text, every state | 0 / 0 (previous lane) | **0 / 0** (1,470 / 1,566 controls) |
| Forced colors (emulated) | 61 axe `color-contrast` findings | 61 axe `color-contrast` findings, **identical set**; 0 non-contrast failures. See "Forced-colors note" |
| Local three-context playthrough `two-device-smoke.mjs --reload` | n/a | **17/17** steps, no console errors |

Gates on the final source (APFS clone in `/private/tmp`, because esbuild hangs under `~/Documents`): `npm run check` exit 0 (**705 passed**, 11 todo; format, lint, typecheck, tests); `npm run build` exit 0; emulator suites (remapped ports) **18 + 86 + 4 passed**.

## Pop-out inventory (re-audited)

Unchanged from `docs/evidence/fa-reskin/README.md`: six native `<select>` (OS-drawn popup, cannot clip; closed control ≥48 px, 16 px type), one `SheetDialog` (bottom sheet <641 px, centred card above; visual-viewport sized; safe-area padding; scroll lock; inert background; focus trap; Back closes it; now compact under 15rem), one `<details>` "Why?", option rows and allocation radios (≥48 px). No custom menu, popover, tooltip, toast or drawer exists. The audit's modal scenarios cover six sizes, zoom, pinch, safe areas, 150/200% text, reduced motion and keyboard.

## Observed on real Safari, deliberately NOT changed (not defects of this lineage)

The same rig also failed two tests that assert features which exist only on sibling lineage `sonnet-db…ez` (inline form errors `testJoinFormValidationWithKeyboard`; sticky action dock `testSignedInDockInRealSafari`). This lineage uses the browser's native validation bubble and no sticky dock; neither was shown to hide a control behind the keyboard, so per "fix only evidenced defects" they were left alone. Adopting that lineage is a merge decision for John (it overlaps this lineage's Back-dismiss, forced-colors and large-text work; "merge ez OR this line, not both").

## Forced-colors note

`ui-audit.mjs --emulate-media forced-colors=active` reports 61 axe `color-contrast` findings (foreground `#22e6ff` vs `#ffffff` on `.connection-status`, etc.) on **both** builds with Chrome 154.0.8037.93: axe reads the author colours against a white backdrop that forced-colors mode replaces, so these are tool artefacts, not rendered contrast, and identical before and after. The `fa` lane recorded 0 with an older Chrome. The audit's own forced-colors checks (emulation applied, disclosure marker visible) pass in all states.

## Files

`before/`, `after/`: 44 JPEGs each (anon landing/create, player compose/allocation, GM console, table idle/after-roll, correction sheet and keyboard at phone 375×812, tablet 768×1024, desktop 1280×800, table 1920×1080, and landscape phone). `reports/`: machine-readable audit reports and the iOS per-test verdicts. `safari-ios/`: real-Safari landscape frames, keyboard up, before and after.

## Provenance and limits

- `scripts/playtest/ios-simulator/`, `sheet-viewport-probe.mjs`, `sheet-history-probe.mjs`, `pixelContrast.mjs`, `layout-diff.mjs` are copied unchanged from `origin/sonnet-ez/reskin-orchestrated-20261005`. `ui-audit.mjs` gained the compact-aware checks and `tight-keyboard` scenarios ported from the same branch.
- A Simulator is not a physical device. Not exercised: physical iPhone/Android, VoiceOver/TalkBack/NVDA, real Windows High Contrast, Safari swipe-back, iPad. **No staging playthrough** (staging needs the Firebase web key, which is not in the repository; the deployed site still serves an older build).
- Browser-chrome states (Safari toolbar modes) and pinch-zoom ≥4× (visible height under 15rem also engages compact; judged harmless/better) were reasoned about, not driven.
- A CSS-only fallback for engines without `visualViewport` (no compact mode there; the existing `max-height: 34rem` block remains) was suggested by review and not added.
