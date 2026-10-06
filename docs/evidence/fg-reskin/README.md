# Mobile pop-out re-audit: compact threshold, scrim and route headings (lane `sonnet-fg`)

Branch `sonnet-fg/reskin-orchestrated-20261005`, from `4a91dd2` (the reviewed `sonnet-fc` baseline). Everything ran against a **local** Firebase emulator stack (`demo-digitable`, fake project, remapped ports 47xxx/49xxx) and local `vite preview` builds, plus the real Mobile Safari rig in the iOS Simulator (iOS 26.5 iPhone 17 Pro, iOS 27.0 iPad mini). Nothing was deployed, no production resource or secret was used, staging was not contacted. Presentation and markup only: no engine, contract, template, rules, projection, authorization or privacy change.

## Result: three evidenced defects, fixed

| # | Defect | Evidence | Fix |
| --- | --- | --- | --- |
| 1 | **iPad Safari, landscape, keyboard up (~266 px visible):** the correction sheet kept its pinned title and action row, leaving the body ~70 px. The reason label sat half under the title and the field's border against the action row (the rig's earlier checks passed because they only compared field vs. action row). | Real Safari rig, new assertion `field.maxY + 8 <= apply.minY` fails on the old bundle (`ios-ipad-mini-a17-pro-old.txt`: field bottom 210 vs action row 209.5), passes on the new one. Chrome: new `medium-keyboard-*` scenarios (heights 360-240 px at 1133/667/320 wide, 20 px home-indicator inset) fail 4 checks on the old build, 0 after. | `COMPACT_BELOW_REM` 15 → 18 (sheet scrolls as one page under 18 rem visible). Budget in the hook comment. |
| 2 | **iPhone Safari, landscape, keyboard up:** the backdrop is sized to the visual viewport, so the page showed through **undimmed** beside/below the sheet with a hard seam. | Frames in `safari-ios/` (`...-old.png` vs `...-new.png`). | `box-shadow: 0 0 0 100vmax` in the backdrop's own colour (no layout/overflow effect). Forced colors drops shadows; the seam remains there (documented). In the "after" frame the area below the sheet is dimmed but still reads slightly lighter than the strip above; not removed entirely. |
| 3 | **Dead-end/loading states of the claim, GM and table routes had no `<h1>`** (bare `<main>` with an alert): no page title for screen-reader users; the audit reported axe `page-has-heading-one` on `#/claim/no-such-room` for many lanes. | `axeBestPractice` was `["anon/route-claim-no-such-room@phone: page-has-heading-one"]` before; `[]` after. New `RouteDeadEndHeadings.a11y.test.tsx`: 7 tests fail on the old source, pass after. | One `<h1>` per branch, same text as the route's main state. |

Side effect, recorded: because the threshold is in rem, 200% text on a phone shorter than 576 px (320×568) now also uses the one-page-scroll layout (audit scenario updated to check reachability by scrolling the sheet). 292 px (iPhone landscape with Safari's bars) stays pinned.

## Gates on the final source

| Gate | Result |
| --- | --- |
| `npm run check` (format, lint, typecheck, tests) | exit 0, **713 passed**, 11 todo (was 705) |
| `npm run build` | exit 0 |
| Emulator suites (APFS clone, ports 49xxx) | **18 + 86 + 4 passed** |
| `ui-audit.mjs` 100% / 150% / 200% text | each: 150 states, 42 modal scenarios, **0 failures, 0 axe violations, 0 best-practice items** (1,518 / 1,422 / 1,422 controls) |
| `ui-audit.mjs` forced colors | 61 axe `color-contrast` findings, identical count to `sonnet-fc` (tool artefact on Chrome 154: axe reads authored colours; 0 other failures) |
| Real Safari `testCorrectionSheetWithKeyboardAndPicker` | iPhone 17 Pro **pass**, iPad mini **pass** (iPad fails the new assertion on the old bundle) |
| `two-device-smoke.mjs --reload` (local/emulator full GM/player/table playthrough) | **17/17**, `ok: true` |
| Baseline `ui-audit.mjs` on `4a91dd2` | 150 states, 0 failures (the three defects above are invisible to it; that is why the new scenarios exist) |

## Pop-out inventory (re-audited)

Unchanged from `docs/evidence/fc-reskin/README.md`: six native `<select>` (OS-drawn picker; the rig captured the iPhone popover; iPad shows no wheel in the accessibility tree), one `SheetDialog`, one `<details>` "Why?", option rows and allocation radios. No custom menu, popover, tooltip, toast or drawer exists.

## Rig runs: expected failures and a rig artefact (not product defects)

- `testJoinFormValidationWithKeyboard` and `testSignedInDockInRealSafari` fail on both devices: they assert features that exist only on the sibling `sonnet-db…ez` lineage (inline form errors, sticky dock). Unchanged from `sonnet-fc`'s record; merge decision for John.
- `testBackClosesOnlyTheSheet` passes on iPhone; on iPad it fails because the rig taps an iPhone-toolbar coordinate that does not exist on iPad (before/after frames identical, Back never pressed). Rig limitation, not exercised further.

## Files

`before/`, `after/`: 34 JPEGs each (landing, create, player compose/allocation, GM console, table idle/after roll at 375×812, 768×1024, 1280×800, 1920×1080; correction sheet and keyboard states; the iPad-landscape 266 px frame). `reports/`: audit JSON, smoke report, iOS verdicts. `safari-ios/`: real-Safari landscape keyboard frames (rotated), old and new.

## Limits

Simulator, not hardware. Not exercised: physical iPhone/iPad/Android, VoiceOver/TalkBack/NVDA, real Windows High Contrast, Safari swipe-back, staging (web key not in repo). The `100vh` body `min-height` on iOS (large viewport) was considered and left alone: no evidence it harms anything.
