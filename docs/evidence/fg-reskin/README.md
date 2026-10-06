# Mobile pop-out re-audit (lane `sonnet-fg`)

Branch `sonnet-fg/reskin-orchestrated-20261005`, from `4a91dd2` (the reviewed `sonnet-fc` candidate). Everything ran against a **local** Firebase emulator stack (`demo-digitable`, a fake project; remapped ports 47xxx for the live stack, 49xxx for the emulator test suites) and local `vite preview` builds, plus the **real Mobile Safari** rig in the iOS Simulator (iPhone 17 Pro, iOS 26.5; iPad mini A17 Pro, iOS 27.0). Nothing was deployed, no production resource or secret was used, staging was not contacted. Presentation and markup only: no engine, contract, template, rules, projection, authorization or privacy change.

## Result: three evidenced defects, fixed; the baseline audits could not see two of them

The baseline (`4a91dd2`) passes every existing audit: 150 states, 1,530 controls, 0 failures, 0 axe violations, one axe best-practice item (`page-has-heading-one` on `#/claim/no-such-room`) (`reports/ui-audit-baseline-4a91dd2.json`). The defects below were found by the real-Safari rig and by reading the render branches.

| # | Defect | Evidence | Fix |
| --- | --- | --- | --- |
| 1 | **iPad Safari, landscape, software keyboard up (~266 px visible):** the correction sheet kept its pinned title and action row, which left the body about 70 px. The reason label sat half under the title bar and the field's border against the action row. The rig's earlier checks passed because they only compared the field with the action row. | Rig frame `safari-ios/ipad-mini-landscape-keyboard-before.png` vs `-after.png` (device-native portrait buffer: rotate 90° to read). New rig assertion (`field.maxY + 8 <= apply.minY`) **fails on the `4a91dd2` bundle** (field bottom 210 vs action row 209.5) and passes after (`reports/ios-rig-verdicts.txt`). In Chrome the new `medium-keyboard-*` scenarios (visible heights 360-240 px at 1133, 667 and 320 px wide, with a 20 px home-indicator inset) fail 4 checks on the old build (`reports/ui-audit-modal-baseline-medium-keyboard.json`) and 0 after. | `COMPACT_BELOW_REM` 15 → 18: under 18 rem of visible height the sheet scrolls as one page. The budget (title + action row + card padding + a labelled field ≈ 17 rem) is in the hook's comment. |
| 2 | **iPhone Safari, landscape, keyboard up:** the sheet's backdrop is sized to the visual viewport and WebKit clips fixed layers to it, so the page showed through **full-bright** between the sheet and the keyboard, with a hard seam. | Rig frames `safari-ios/iphone-17-pro-landscape-keyboard-before.png` vs `-after.png`. A first fix (a spread `box-shadow` on the backdrop) was **tried and did not work** in real Safari (clipped the same way); it was removed. | `html.sheet-open #root { opacity: .18 }` is now the only dimming; the backdrop is transparent (explicit `Canvas` under forced colors) and the body's rail/grain are dropped while a sheet is open. One source of dimming means no seam wherever the backdrop ends. |
| 3 | **Dead-end and loading states of the claim, GM and table routes had no `<h1>`** (a bare `<main>` with an alert): no page title for screen-reader users; axe reported `page-has-heading-one` for many lanes. | `axeBestPractice` was `["anon/route-claim-no-such-room@phone: page-has-heading-one"]` before and is `[]` after. New `RouteDeadEndHeadings.a11y.test.tsx`: all 7 tests **fail on the old source**, pass after. | One `<h1>` per branch, same text as the route's main state. |

Side effects, recorded: because the threshold is in rem, (a) 200% text on a phone shorter than 576 px (320×568) now uses the one-page-scroll layout (the audit's 200% scenario now checks reachability by scrolling the sheet); (b) a small phone in portrait with the keyboard up (about 270 px visible, iPhone SE class) that used to keep the pinned footer now scrolls Apply/Cancel as part of the sheet, and the layout flips when Safari's toolbar crosses 288 px (the review flagged this; accepted, not driven in a real SE-class device). 292 px (iPhone landscape with both Safari bars, measured by an earlier lane) stays pinned.

## Gates on the final source

| Gate | Result |
| --- | --- |
| `npm run check` (format, lint, typecheck, tests) | exit 0, **713 passed**, 11 todo (baseline 705) |
| `npm run build` | exit 0 |
| Emulator suites (APFS clone `/private/tmp`, ports 49xxx) | **18 + 86 + 4 passed**, exit 0 |
| `ui-audit.mjs` 100% text (screenshots) | 150 states, 1,470 controls, 42 modal scenarios, **0 failures, 0 axe violations, 0 best-practice items** |
| `ui-audit.mjs` 150% text | same, 1,422 controls, 0 failures |
| `ui-audit.mjs` 200% text | same, 1,434 controls, 0 failures |
| `ui-audit.mjs` forced colors (emulated) | 61 axe `color-contrast` findings, **0 other failures**; identical count to `sonnet-fc` (tool artefact: Chrome 154's axe reads authored colours against a white backdrop that forced colors replaces; see `docs/evidence/fc-reskin/README.md`) |
| Real Safari `testCorrectionSheetWithKeyboardAndPicker` | iPhone 17 Pro **pass**, iPad mini **pass** (the iPad run fails the new assertion on the old bundle) |
| Real Safari `testBackClosesOnlyTheSheet` | iPhone **pass**; iPad **fails exactly as on the untouched baseline** (see below) |
| `two-device-smoke.mjs --reload` (local/emulator GM + player + table playthrough) | **17/17** steps passed (`reports/two-device-smoke-after.txt`) |

## Pop-out inventory (re-audited)

Unchanged from `docs/evidence/fc-reskin/README.md`: six native `<select>` (OS-drawn picker; the rig captured the iPhone popover; iPad exposes no wheel in the accessibility tree), one `SheetDialog` (bottom sheet under 641 px, centred card above; visual-viewport sized; safe-area padding; scroll lock; inert background; focus trap; Back closes it; compact under 18 rem), one `<details>` "Why?", option rows and allocation radios (≥ 48 px). No custom menu, popover, tooltip, toast or drawer exists.

## Rig failures that are NOT defects of this change

- `testJoinFormValidationWithKeyboard` and `testSignedInDockInRealSafari` fail on both devices on the untouched baseline: they assert features that exist only on the sibling `sonnet-db…ez` lineage (inline form errors, sticky dock). Merge decision for John (unchanged from `sonnet-fc`).
- `testBackClosesOnlyTheSheet` fails on iPad on the untouched baseline too: the rig taps an iPhone-toolbar coordinate that does not exist on iPad (before/after frames identical, Back never pressed). Rig limitation; Back-dismiss itself was not exercised on iPad.

## Files

`before/` (baseline `4a91dd2` build) and `after/` (final): 44 and 45 JPEGs each (landing, create, player compose/allocation, GM console, table idle/after roll at phone 375×812, tablet 768×1024, desktop 1280×800, table 1920×1080 and landscape phone; correction sheet and keyboard states; the iPad-landscape 266 px frame). `reports/`: machine-readable audit reports and the iOS verdicts. `safari-ios/`: real-Safari landscape keyboard frames, before and after.

## Provenance and limits

- Original assets only (the existing `assets/generated/*` pack shown in the screenshots); no new art, text or audio.
- A Simulator is not a physical device. Not exercised: physical iPhone/iPad/Android, VoiceOver/TalkBack/NVDA, real Windows High Contrast, Safari swipe-back, pinch-zoom ≥ 4× (it also engages compact; judged harmless), staging (the Firebase web key is not in the repo; the deployed site still serves an older build).
- No axe pass runs while a sheet is open: `#root` is dimmed and inert there and axe would read it at that opacity (noted in `ui-audit.mjs`). Page states are audited with the sheet closed.
- The `100vh` body `min-height` (iOS large viewport) was considered and left alone: no evidence it harms anything.
- Process note: another Claude session (`digitable-reskin-fg-finish`) committed and pushed this branch (`b803ca9`) from this shared worktree while the work was in progress, with documentation claiming the `box-shadow` scrim as the fix. That scrim was disproved here; this commit supersedes that text.
