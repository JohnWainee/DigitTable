# Picker / pop-out re-audit of `b993f56`, lane `sonnet-ey` (2026-10-05)

**No product defect found; no `apps/`, `packages/`, `templates/`, rules, Functions, asset or secret change.** The only edits are test tooling
(see "What changed"). Nothing merged or deployed; staging is still `5e8907b` and is NOT validated by this run. Isolated ports 47xxx (peers hold the
defaults); the throwaway `firebase.ey.json` and `vite.ey.config.ts` (emulator port remap) were deleted before the commit.

Scope: every select / menu / disclosure / sheet / option list / allocation / action picker across GM, player and table, at 320/375/390/412 phones,
landscape phones, tablet, desktop and table widths, with short VisualViewport, dynamic Safari chrome and the software keyboard up.

| Check | Result |
| --- | --- |
| `npm run check` (`check.log`; `check-base.log` is the untouched base) | passed: 864 tests, 11 todo (83 files passed, 1 skipped); base was 862, the 2 new tests are the contract tests |
| `npm run build` (`build.log`) | passed (known chunk-size warning) |
| `two-device-smoke.mjs --reload` (`smoke.log`, local emulators, base-source build) | ALL STEPS PASSED (17), incl. no overflow 375/768/1024/1280/1920 |
| `ui-audit.mjs --font-fallback sans` (`audit-base.log`, `reports/ui-audit-base-sans.json`) | 288 states, 3,320 controls, 0 control/overflow/contrast/hard-axe failures; 23 sheet cases, 87 keyboard-focus, 363 dock-focus checks; only the known `page-has-heading-one` note on the nonexistent-room route |
| `ui-audit.mjs --extra-viewports` 480/540/600/640/700 phones-and-folds, 1024x768, 1366x768, 2560x1440, 3840x2160 (`audit-extra.log`, `reports/ui-audit-extra-viewports.json`) | 612 states, 6,783 controls, 0 failures; 32 sheet cases (9 new) |
| Real Mobile Safari, iPhone 17 Pro, iOS 26.5: correction sheet + software keyboard + native select (`ios/*measurements.log`) | passed (warm run); keyboard up: reason field, Apply, Cancel and title all above the keyboard, no overlap |
| Real Mobile Safari, iPad mini (A17 Pro), iOS 27.0: same sheet-with-keyboard test | passed |
| Real Mobile Safari, iPhone 17 Pro: Back with the sheet open (`ios/iphone-17-pro-back.log`) | passed on the edited rig (iPhone path unchanged) |
| Real Mobile Safari, iPad mini, iOS 27.0: Back with the sheet open (`ios/ipad-mini-back.log`) | **passed** on the edited rig: Safari's `BackButton` tapped, sheet closed, director console still mounted |

An earlier first run of the sheet test on iPhone 17 Pro failed only its `scene loaded` assertion (Functions cold start, already a documented rerun case);
the warm rerun passed with every assertion.

## What changed (tooling only)
1. **iPad Back is now actually pressed** (`scripts/playtest/ios-simulator/UITests/SafariFlowUITests.swift`). The `ew` lane's iPad failure was a rig gap: the test
   expanded Safari's toolbar by tapping an iPhone bottom-pill coordinate that does not exist on iPad. On iPad it now taps the TOP address pill, then finds
   `BackButton`; if Back still cannot be found it writes the accessibility hierarchy and fails (it never taps iPhone coordinates on an iPad). Result above:
   the `useBackDismiss` fix works on iPad Safari (rerun after the review fixes below: still passed). This closes the open "Back-dismiss on iPad is UNTESTED" item from `ew`.
2. **`ui-audit.mjs --extra-viewports name:WxH[:m],...`** adds viewports for one run to the per-state sweep and the sheet containment cases. The standard eight
   skip the 480-720 band (foldables, large phones in split view), 1024-1366 landscape tablets/laptops and 2560/3840 TVs.
3. `apps/web/test/playtest/auditHarnessContract.test.ts`: contract tests pinning both (so the rig cannot silently revert to iPhone coordinates, and the flag
   cannot silently stop reaching the sheet cases).

## Findings that close earlier "open" notes
- **Keyboard-up footer safe-area padding (`eu`/`ew` open item) is not a defect.** In real iPhone 17 Pro Safari with the keyboard up, the sheet ends above
  Safari's address pill and form-accessory bar and the footer carries only its normal padding (Cancel's bottom edge to the sheet's bottom is ~14pt in
  `ios/iphone-17-pro-sheet-keyboard-up.jpg`), i.e. `env(safe-area-inset-bottom)` is 0 there and nothing is double-counted. Pictures and frames: `ios/`.
- The un-dimmed page visible below the sheet in that picture is Safari's own chrome area (pill + accessory bar over scrolled page content), outside the
  visual viewport the backdrop is sized to; it is not a gap in the backdrop.

## Not covered
Physical iPhone/Android, VoiceOver/TalkBack, Windows High Contrast, Firefox, the OS-owned native `<select>` popup contents, a real TV, Android Back on a real
device, emulator suites (18 + 86 + 4: not rerun because no Functions, rules, authority, projection or engine code changed and default emulator ports are
held by a peer lane; last complete result is in `ew-reskin-audit-20261005/emulator.log`). `shots/` holds representative GM correction-sheet captures only
(the full 650-image run was not committed).

## Review remediation (second pass, see `docs/reviews/2026-10-05-ey-picker-audit-independent-review.md`)
`--extra-viewports` now throws on an empty value, a duplicate or standard-viewport name, a malformed size or an unknown flag (it used to silently audit
less); `import UIKit` added to the rig; a `--modal-only` rerun with `w540:540x960:m,tv3840:3840x2160` passed (25 sheet cases) and the five bad inputs
were each rejected.
