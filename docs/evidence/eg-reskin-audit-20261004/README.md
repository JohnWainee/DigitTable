# Reskin / pop-out audit, lane `sonnet-eg` (2026-10-04): two real defects, found by looking where no earlier lane had

Base: reviewed candidate `741e455` (the `sonnet-ef` chain). **Source changed, presentation only**:
`apps/web/src/styles.css`, `apps/web/src/shared/ActionDock.tsx` (cherry-picked, see Defect 1; plus a comment correction),
two one-line component edits (`JoinScreen.tsx`, `SceneDirector.tsx`), tests, the playtest harness and docs. No authority,
authorization, projection, engine, Firebase-config, asset or secret change. Not merged, not deployed; no staging request or write.

## What this lane did differently

Every earlier lane audited with headless Chrome at 100% text, plus the correction sheet alone at 150%/200%. Three
measurements were missing; each was run against the **unmodified base first**, so every number below has a "before":

1. **Real Mobile Safari, signed in** (iOS Simulator, a dedicated iPhone 17 Pro device, iOS 26.5): the dock probe written by
   lane `sonnet-ed` (commit `c7b0981`, which never reached this lineage: `git merge-base --is-ancestor` says so).
2. **Every page at 150% and 200% root text** on the 320/375/412 phones and landscape: overflow, off-screen and squeezed
   controls, and a new **broken-word** detector (a word whose glyphs sit on more than one line, which no overflow check
   can see). Also `--font-fallback sans|wide`: pages rendered as a device without the Impact display face.
3. **Contrast measured from the rendered pixels**, because axe reports text over the panels' grain, hazard-tape and
   gradients as "incomplete", never as a violation (`scripts/playtest/pixelContrast.mjs`; negative controls in the self-test).

## Defect 1: the dock vanished on a landscape iPhone (found by `sonnet-ed`, reproduced here independently)

In landscape Mobile Safari with the tab bar and address bar showing, the visible height is 292 CSS px. The dock was released
into the page flow below 320px (`UNPIN_BELOW_PX` and `@media (max-height: 20rem)`), so "Declare action" sat at the end of a
~2,400px form. Headless Chrome's 812x375 landscape is above the line, so no Chrome lane could see it.

| `testSignedInDockInRealSafari`, iPhone 17 Pro, iOS 26.5 | base `741e455` | candidate |
| --- | --- | --- |
| landscape, bars collapsed, Compose rows on screen: `Declare action` | **outside the 874x402 web area (frame y 1414), not hittable** | frame y 324, hittable |
| landscape, bars showing | **outside the web area (y 1690), not hittable** | y 325, hittable |
| portrait at scroll 1-3, page bottom, after rotating back; GM pending dock | hittable | hittable |

Base: 4 XCTest assertion failures (`ios-before/xctest-failures.txt`); candidate: 0 failures (`ios-after/`, and again on the
final bundle in `ios-final/`: all three tests, 0 failures). Fix: `git cherry-pick -x` of `c7b0981` (threshold 320 -> 240px,
`20rem` -> `15rem`, with its tests, evidence and review under `docs/evidence/ed-reskin-audit-20261004/` and
`docs/reviews/2026-10-04-ed-dock-landscape-safari-independent-review.md`). Screenshots (device-native frames, landscape,
shown upright as saved): `ios-before/` has stat rows only, `ios-after/` has the pinned dock with "POOL: 4 DICE" and "DECLARE ACTION".

## Defect 2: large text broke the layout on narrow phones (found by the new whole-page text-scale audit)

Base `741e455` with the new probes (`ui-audit-base-new-probes.log`, 288 states): **302 failures**, 15 of them page overflow
(up to **102px** on a player's Compose at 320px/200%, 24px at 375px, 9px at 412px), 140 squeezed controls, 56 selects whose
chosen option was ellipsised with no full-text echo. (The log also lists 91 "contrast" flags: those are **measurement
artifacts** of the unfixed page, not findings. The page overflowed, which left Chrome's mobile emulation at a page scale of
1.14, so later screenshots no longer mapped CSS px to pixels; the sampler now refuses to score such a view and says
"contrast not measured": `ui-audit-base-contrast-sanity.log`.) Cause: `rem`-sized horizontal gutters. Nested five deep
(screen, panel, fieldset, row, control) they take about 70% of a 320px phone at 200% text, leaving a ~100px column
(captures in `before/` and `after/`, 320px wide, 200% text):

- "DECLARE ACTION" read "DECL / ARE / ACTIO / N", "THE FORECOURT OF THE GARE DES OMBRES" read "FOREC / OURT ... OMBRE / S",
  "JOIN A SESSION" read "SESSIO / N";
- the sentence button "Lost your browser? Recover your seat" wrapped to 4-7 lines; a one-time recovery code split across
  two lines; "REINFORCEMENTS" and the allocation legends broke mid-word; native selects showed "Choos...".

A third defect surfaced at the **default** text size while building the detector, and is pre-existing in the base CSS: the GM's
"Reveal" button on a hidden threat (scene director) was squeezed to 77px and read "REV / EAL" at every phone width 320-412px
(`min-width: var(--tap)` is an explicit minimum, so as a flex item the button loses the content-based minimum it would otherwise
keep). Reproduced in isolation against the old stylesheet: 77x67px and broken; after the fix 104x48px, whole.

### Fix (presentation only: `apps/web/src/styles.css` plus two copy edits)

- Horizontal gutters capped at their default-size px: `--gutter: min(1rem, 16px)`, `--gutter-sm`, `--gutter-xs`,
  `--gutter-btn`; the dock bleeds by the same token. Large text goes to the type, not the padding.
- Display sizes held to the width by a `vw` cap that sits above the default-size result from 320px up: `h1` and landing `h1`
  (14vw), `h2`, sheet `h2`, buttons (7.5vw), legends, the one-time code. Check/radio boxes and their marks, and the select
  chevron and its reserved room, keep their px size. Long words wrap at a row or button edge (`overflow-wrap: anywhere`).
- A row's own action (`Reveal`) keeps its natural width, sits beside its label on a wide row, and drops under it when the
  two do not fit.
- Copy: "Lost your browser?" is a hint (the button's `aria-describedby`) above a short "Recover your seat" button; the
  scene-target placeholder is "Choose...".
- Not changed: `--tap: 3rem` (the contract deliberately scales targets with text), the 44px minimums, 16px control type.

**Nothing changes at the default text size** (the one exception, the Reveal row, is the defect above), proved three ways:
(a) `reskinContract.test.ts` evaluates every cap at 320-1920px and requires it to equal the old value at a 16px root; 15 of
the stylesheet contract tests fail against the base stylesheet; (b) `layout-diff.mjs`: the rounded box of every element
(display:none ones kept as zero boxes), 112 state/viewport pairs (8,832 element boxes: landing, forms, claim, Compose, table
idle at 1920x1080, GM console in four states, at 320/375/390/412, landscape, tablet, desktop, table) is **identical within
1px** between the base and the final bundle (`layout-diff.log`); the only boxes that differ are 24 whose own text differs (a
random room code), counted and not compared (under the 1% cap); the 8 join-form pairs differ by the intended hint DOM and
are named with `--allow-skip join-form`; (c) the full audit's 100% sweep below. An independent reviewer's own differential (old
vs new stylesheet over 14 widths, 320-1920, on hand-built DOM that mirrors the components) found 0 differing boxes except the
Reveal rows.

## Gates

| Gate | Result |
| --- | --- |
| `npm run check` on the final source (`check-final.log`) | exit 0: format, lint, typecheck, **829 passed**, 11 todo (80 files passed, 1 skipped); base was 805 (`check-base.log`) |
| `npm run build` (`build.log`) | exit 0 (existing chunk-size warning) |
| `ui-audit-selftest.mjs` (`selftest.log`) | SELF-TEST PASSED, with new negative controls: PNG decoder (every row filter), a gradient the contrast measurement must fail, an occluded line it must skip, a mid-word break the detector must report and wrapped/hyphenated/identifier/`<dd>` text it must not, layout fingerprint moves with width, text, display:none and not with scroll |
| `ui-audit.mjs` full audit, default fonts, candidate before the last three small commits (`ui-audit-candidate-fix6-full.log`, `...-report.json`) | 288 states, 3,256 controls, **0** control issues, **0** overflow states (256 text-scaled), **0** hard axe violations, 8,296 text boxes measured from pixels with **0** contrast failures and 0 invalid slices, 87 keyboard-focus + 275 dock-focus checks, 4 pinch, 8 validation, 23 sheet cases. 6 findings: single 13-14 letter words in a checkbox row ("Phantasmagoria", "Fragmentation": ability names) broken at 150-200% text on 320-375px, the corner where a word is wider than the 157px label column |
| `ui-audit.mjs` pages + text-scale + contrast on the **final bundle**, default fonts (`ui-audit-candidate-pages-default.log`) | 208 states, 2,184 controls, **0 failures**, 0 overflow, 0 axe, 0 contrast failures, 4 long pages scored only through 12 slices (flagged `truncated`) |
| same, `--font-fallback sans` (Roboto-class face; `...-sans-fallback.log`) | 208 states, **0 failures** |
| same, `--font-fallback wide` (Verdana-class display and body: the DejaVu Sans worst case; `...-wide-fallback.log`) | 39 findings, all at the extreme corner (32 at 320px): "CHARACTER" in the claim `h1` (also at 100% text and identical on the old CSS), "simplified" in a GM button, "dashboard" in the player `h1`, four ability/stat words in a 157px label column, one long primary label on 4 lines. 0 overflow, 0 contrast failures. Recorded as known limits, not fixed |
| `two-device-smoke.mjs --reload` (GM + player + table) on the final bundle (`smoke.log`) | ALL STEPS PASSED, 17 PASS, no overflow at 375/768/1024/1280/1920 |
| iOS Simulator, real Mobile Safari, iPhone 17 Pro, iOS 26.5, final bundle (`ios-final/`) | `testJoinFormValidationWithKeyboard`, `testCorrectionSheetWithKeyboardAndPicker`, `testSignedInDockInRealSafari`: 3 tests, 0 failures |
| iOS Simulator, iPhone SE (3rd gen), iOS 26.5 (`ios-se3/`) | `testJoinFormValidationWithKeyboard` passes; the two session-creating tests fail typing into the third create-form field ("Your display name": no element has keyboard focus), **identically on the unmodified base build**, so not a regression; whether it is the rig or the page on a 667pt phone is undetermined (a settle-then-tap tweak did not fix it and was dropped) |
| Emulator suites, APFS clone, every port remapped to 52xxx (`emulator-suite.log`, repeated callable-verification debug lines removed) | 18 rules + 86 Functions + 4 web passed, script exited 0 |

## Not covered (still open)

Physical iOS/Android hardware, VoiceOver/TalkBack/NVDA, Windows High Contrast, Android Chrome's real font scaling (the
audit sets the root font size, which is what it does to `rem`; `--font-fallback sans|wide` approximates a face without Impact),
a real TV at viewing distance, real hardware pinch, Safari's own text-size menu, the iPhone SE create-form typing failure above.
Known limits left as they are: at 200% text in a 292px-tall landscape phone the capped dock shows only 48-67px of its button
(documented by `sonnet-ed`); the `vw` caps mean display type grows only about 1.17x at 200% text on a 320px phone while body text
doubles; a media-query rem moves with the browser's default font-size setting while `UNPIN_BELOW_PX` does not (comment corrected);
the `wide` residuals above. Staging was not re-run: no new deployed build exists, so the reskin release is not complete
until one is deployed (John's call) and the physical pass is done.

## Isolation

Peers held default ports and 27xxx/34xxx-39xxx/54xxx-59xxx/61xxx. This lane used 51xxx only (live stack: auth 51099, Firestore
51080/51081, RTDB 51000, Functions 51001, hub 51400; previews 51274-51282; Chrome 51350-51376; demo project `demo-digitable`) and
52xxx for the emulator-suite clone. The bundles were built with a throwaway Vite config outside the repo that rewrites only the
three client port numbers (no default 9099/5001/8080 remains in any bundle). The iOS runs used dedicated Simulator devices
("eg-iPhone17Pro", "eg-iPhoneSE3") and a private derived-data directory. No peer process was touched. One subagent reviewer ran a
single `pkill` that matched only its own scratch-profile Chrome helpers (disclosed in its report; the other lanes' and this
lane's browsers kept running).
