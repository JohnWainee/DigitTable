# fw reskin completion evidence (2026-10-07)

Branch `sonnet-fw/reskin-orchestrated-20261007`, from `ccb9f2d` (the reviewed, undeployed fq candidate). Everything here ran against a **local**
Firebase emulator stack (project `demo-digitable-fw`, ports 53xxx, so it could run beside other lanes' stacks) and local `vite preview` builds of two
bundles: **before** = `ccb9f2d`, **after** = this branch. Nothing was deployed; no staging or production resource was touched.

## The report, reproduced, and what it turned out to be

"The sheet is clipped at 320px with 200% text and a dynamic visual viewport/keyboard" is real, and it is three defects, not one (a fourth, in the
sheet's action row, turned up when the audit was strengthened; it is item 4):

1. **Option rows collapsed to a 2px text column at 320px / 200% text.** Every horizontal gutter was a `rem`, so five nested panels (page, card,
   fieldset, option row, check box) doubled with the text and left `section.step` 250px, `fieldset` 182px, `.gear-list` 128px, the row 124px and its
   label **2px** (Stat, Items, Abilities, Bonus claims, Engaged threats, the per-die allocation targets, the GM's pending-action threats).
   Compose overflowed the page by **47px**, allocation by 12px, the GM pending panel by 5px; a phone browser then lays the page out wider than the
   screen and zooms it out (`innerWidth` 367px on a 320px phone), so the sheet's geometry check failed too. That is the limit earlier lanes recorded as
   "the console's, not the sheet's" and excused (`text-200-phone-small`: non-gating).
2. **The bottom sheet's pinned layout broke between 150% and 200% text and whenever the keyboard shrank the visible area.** Its header and action row
   were pinned from a fixed 10rem threshold, but how tall they are depends on the text size, the width (the two buttons stack below about 21rem) and
   the title. At 150% text on a 320px phone with the keyboard up they took all but 48px of a 262px sheet, clipped the action row by 18px and left
   **Cancel outside the sheet** behind a second, nested scroller (the action row's 40% cap); at 200% that held at *every* height, even 800px. Scanning
   168 cells (widths 320/375/412 x text 100/125/150/200% x visible heights 800..120px) found **74 flagged cells** (`reports/sheet-scan-before.json`).
3. **A closed `<select>` lost its value.** At 200% the chevron's 2.75rem reserve took 88px and left a **10px** value window; the scene select showed an
   ellipsis with no echo even at 375px and the default text size ("The Forecourt of the Gare des Ombres" is 280px wide in a 213px window).
4. **Button labels broke mid-word.** In the sheet's action row at 360-390px with *default* text, two equal 9rem-minimum columns are 155-170px wide, narrower
   than the tracked, uppercase "CORRECTION" (about 175px in headless Chrome, about 163px in Impact on iOS): "APPLY CORRECTIO / N"
   (`sheet-keyboard/before-360-x1-kb400.jpg`; this lane's own first `after` still had it until the audit's new label probe caught it). On Android, where Impact and Arial Narrow do not exist and the display font falls through to `system-ui`,
   it happens at every phone width at default text. The GM console's "Reveal" button (hidden-threat row, scenes 2 and 4) was squeezed below its label by its
   flex row ("RE / VEA / L" on the base; after the first fix the label overflowed its box by 10-30px; keeping the label whole then left the text beside it
   57px wide at 320px/200% and broke "Enforcer" mid-word, which the scene-2 large-text gate caught).

## What changed (presentation only: `apps/web` styles, one hook, one echo, the audit harness)

- `--g = min(1rem, 5vw)` is the horizontal gutter unit and every nested horizontal gutter is a multiple of it (page, card, fieldset, option row, summary,
  disclosure, sheet header/body/footer, inputs, buttons). 5vw is 16px at 320px, so from a 320px phone up it equals the old `1rem` and nothing moves at the
  default text size; at 200% a 320px phone keeps 16px gutters instead of 32px. The drawn check/radio box (`--box`), the select chevron and its reserve, the
  stat icon inside an option row are capped the same way, and button labels are `min(1.25rem, max(1rem, 7vw))` (never below the text itself, so they keep
  following the text-size preference; 20px at the default size from 320px up). Option-row text wraps inside its row (`overflow-wrap: anywhere` on the row);
  a button inside a row keeps its label (`flex: none`, normal wrapping), and a row that holds its own button (the GM's hidden-threat "Reveal") wraps the button
  onto its own line once the text beside it would be narrower than 8rem; where there is room the row is unchanged.
- The sheet's action row (`.sheet-actions`) is two equal halves while the longest word of each label fits its half, otherwise one full-width column
  (`flex-wrap` plus the automatic minimum width clamped by `max-width: 100%`: the browser measures the word, so it holds for any font, and a word wider than the whole row breaks instead of overflowing). This changes the default-size layout of the two sheet
  buttons on phones narrower than about 380px with Impact (iOS, macOS, Windows; stacked, 138px tall instead of 119px) or about 450px with Arial-like fonts (Android); wider than that they stay side by side.
- `useSheetLayout` (`apps/web/src/shared/useSheetLayout.ts`) measures the header, the action row's natural height and the visible area and sets
  `data-layout="pinned"` (header and action row fixed, body scrolls) only while they and 7rem of body fit, otherwise `"page"` (the sheet is the one
  scroller, nothing nested, nothing clipped). It re-measures on resize of the backdrop/header/action row and the viewport, has hysteresis, and brings
  whatever has focus back into view after a flip (a flip changes which element scrolls, so a focused checkbox or button, not only a text field, could be left
  below the visible area; focus events and the keyboard opening still reveal text fields only). The old 10rem container query stays as the no-JavaScript
  fallback.
- The scene select echoes its full title like the other long selects (`SelectedEcho`, `aria-hidden`).
- Scope: `git diff ccb9f2d..HEAD --stat` lists only `apps/web/src`, `apps/web/test`, `scripts/playtest/ui-audit.mjs` and these docs. No engine,
  contracts, template, Functions, rules, projection, authorization, asset (`assets/`, `apps/web/public/`) or provenance file changed, so the original-art
  provenance table is untouched and the licensing-hygiene test (system fonts, inline procedural textures only) still passes.
- `scripts/playtest/ui-audit.mjs` now **gates** the 320px/200% family: `largeTextPass` (option lists and pickers at 320/375px, 150%/200%, including the scene-2
  console), a button-label probe (a label word must sit inside its button and may not be broken mid-way) in the control audit, `sheet-layout-*` (the sheet at
  320/360/375/568x320, 100/150/200% text, a stand-in `window.visualViewport` for the iOS keyboard, including an `offsetTop` that iOS sets when it scrolls the page;
  `sheetContentFits` probes the portaled sheet's own rows, fields and action row), `sheet-flip-*` (bisects the height at which the layout flips and compares it with an
  independent computation) and `sheet-flip-keeps-focused-control-in-view`, `--default-font-px N` (one Chrome per device with a real default-font preference, which also
  scales `rem` in media queries; fails unless the root font really is N), and a reachability probe (44px of the control in view after scrolling, and a tap there lands
  on it). The older default-text sheet checks accept the page layout. `--only-scenario` runs one modal scenario.

## Results

All numbers are from the **final** tip (the code under review plus the follow-up fixes listed above), the same `ui-audit.mjs` on both bundles.

| Check | Before (`ccb9f2d`) | After |
| --- | ---: | ---: |
| `ui-audit.mjs`, emulated 150%/200% text: failures | 493 | **0** |
| ... of which checks that can fail on any build / checks that read the new `data-layout` attribute | 430 / 63 | 0 / 0 |
| ... option-list elements wider than their box / words broken inside option rows / button labels / selects hiding their value | 103 / 100 / 160 / 30 | 0 / 0 / 0 / 0 |
| ... pages that overflow and zoom out at 320px/200% (compose, why-open, allocation, GM pending) | 4 (47, 47, 12, 5 px) | 0 |
| ... modal scenarios with a failing behavioural check (25 of 41 with any failing check) | 17 of 41 | 0 of 41 |
| `ui-audit.mjs`, **real** 200% default font (one Chrome per device): failures / states that overflow the page / control issues | 513 (490 behavioural) / 6 / 129 | **0 / 0 / 0** |
| State x viewport captures (150 states, 6 viewports 320..1920) | 150 | 150 |
| Controls audited (44px, inside the viewport, 16px text entry, label inside its button) / control issues | 1,434 / 2 | 1,542 / 0 |
| Large-text passes (option lists and pickers at 320/375px, 150%/200%) / modal scenarios | 24 / 41 | 24 / 41 |
| axe (WCAG 2.x A/AA + best-practice) hard violations | 0 | 0 |
| axe best-practice note | `page-has-heading-one` on the nonexistent-room route | same (intentional, unchanged) |
| Sheet scan, 168 cells (3 widths x 4 text sizes x 14 visible heights): flagged | 74 | 5 |
| Sheet scan at iPad widths, 120 cells (744/834/1024/1180px x 100/150/200% x 10 visible heights): flagged | 15 | 1 |
| Layout at the **default** text size (351 state x viewport captures, 13 widths 320..1920px): boxes compared / differing | n/a | 18,057 / **0** in 23 of 27 state groups; the other four are explained below |
| Unit tests (`npm run check`) | 714 | **750** (+36), 11 todo |

The 5 remaining phone cells are 120 and 150px of visible height at 200% text, and the 1 remaining iPad-width cell is 1024px wide at 200% text with 180px visible. They are
the same physical limit: the scan's criterion is that Apply can be scrolled *wholly* inside the visible window, and the 119px Apply button (a two-line 32px label) cannot be wholly
inside a 72-102px sheet. (Two of the five are new: the label floor made Apply 19px taller at 200%.) What matters, 44px of each button in view after scrolling and a tap there that
lands on it, holds in all of them: `reports/sheet-reachability-120-298px-visible-200pct.txt` (16 cases at 320/375/412px, 64-119px of each button in view) and the gated
`sheet-layout-568x320-x2-kb150` scenario.

The gates have teeth. A variant bundle whose sheet insists on 2rem instead of 7rem of body (`MIN_BODY_REM`) fails `layoutMatchesMeasurement`, `bodyKeepsRoom` and
`focusedFieldVisible` in three `sheet-layout-*` scenarios (9 failures); the reviewer's 30 mutants of the hook (and a set of stylesheet mutants) are recorded in
`docs/reviews/2026-10-07-fw-reskin-independent-review-pass2.md` (ten hook mutants survived the first 12 unit tests; the 24 now kill them); and the base bundle fails 493 and 513 (above).
The two behavioural checks added after the first review each fail on the base and pass on the candidate: `sheet-layout-360-*` (the action row's label) and
`sheet-flip-keeps-focused-control-in-view` (the focus reveal), the latter with a `startedPinned` premise assertion.

`reports/layout-diff-default-size.json`: the before and after bundles were dumped (every visible element's rectangle) at 100% text for 27 state groups x 13 widths
(320, 340, 360, 375, 390, 412, 430, 540, 600, 768, 1024, 1280, 1920), 351 captures and 24,254 boxes, and compared with a 1.5px tolerance. Only **data-dependent** differences are
tolerated: zero-size boxes (closed `<option>`s), a leaf whose text differs between the two sessions (room codes, dice faces; compared on x only), and the two allocation states,
where random dice change the element set (compared on x/width only). The scene select's new echo is hidden in the after dump (it is an intentional visible addition).
**Twenty-three groups are identical** (18,057 boxes). **Two are the random-dice allocation states**: the rolls differ between the two sessions (a "4" against a "6" on the first die),
and the only boxes that differ are six die chips each at 540px and wider, where the chip order follows the roll (the first dump of the day matched). **Two differ at 320-430px and are
identical from 540px up**, both on purpose: the GM console in scenes 2 and 4, where the hidden-threat "Reveal" row (its label broke mid-word on the base at every phone width, and was
17px wide beside it at 200%) is now whole and everything below it moves (105 of the state's 134 boxes at each of those widths), and the correction sheet, whose page behind it is that
same console (the same 105 boxes) plus the sheet's own action row, which now stacks at 340, 360 and 375px (5 more boxes; at 320px it was already one column and from 390px the buttons
stay side by side in this Chrome). With a wider display font the buttons stack at wider phones too: below about 450px with Arial-like widths (Android's `system-ui`), against about 380px
with Impact (iOS, macOS, Windows).

## Real Mobile Safari (iOS 26.5 Simulator, `ios/`)

The rig `scripts/playtest/ios-simulator/` (it lives on the `sonnet-eg`/`sonnet-ed` lineage, not on this base; it was exported to a scratch directory and
run unmodified) drives real Safari with the real software keyboard against the after bundle (re-run on the final bundle, after the follow-up fixes):

| Device | `testCorrectionSheetWithKeyboardAndPicker` | What it measured |
| --- | --- | --- |
| iPhone 17 Pro 402x874 | **passed** | Portrait + keyboard (top 583): title, reason field, Apply and Cancel all above it and hittable without scrolling. Landscape 874x402 + keyboard (top 238): reason field above it; Apply/Cancel hittable after scrolling (the sheet is one scrolling page there). The scene select's OS picker lists full titles and the closed select's echo line is visible (`ios/iphone17pro-scene-select-picker-with-echo.jpg`). |
| iPad mini (A17 Pro) 744x1133 | **passed** | Portrait + keyboard (top 848): everything above it. Landscape + keyboard (top 371): reason field, Apply and Cancel all above it and hittable (before the 1rem `scroll-padding-block` on the page layout, the first run had the action row's bottom edge 1pt under the keyboard top). |
| iPhone SE (3rd gen) 375x667 | **could not run** | The rig failed three times (once more on the final bundle) typing into the create form's "Your display name" (`Neither element nor any descendant has keyboard focus`, `UITests/SafariFlowUITests.swift:69`), before the sheet is reached. Earlier lanes recorded the same device-specific rig failure on the unmodified base. |

On the iPhone 17 Pro and iPad mini the sheet's two buttons stay side by side (176px and 295px wide each), as before. The `.log` files hold every measured frame. A Simulator is not a physical device; Dynamic Type and Android font scaling are not driven (a 200% *browser*
font preference is, in Chrome).

## How it was produced

```bash
# 1. dependencies and an isolated stack (an APFS clone outside ~/Documents; esbuild hangs under it)
npm ci && npm run build --workspace @digitable/functions
# firebase.fw.json: auth 53099, firestore 53080 (+53081), database 53000, functions 53001, hub 53400, logging 53401, eventarc 53402, tasks 53403
PATH=/opt/homebrew/opt/openjdk/bin:$PATH npx firebase emulators:start --config firebase.fw.json --only auth,firestore,database,functions --project demo-digitable-fw
# 2. two bundles with the emulator ports swapped by a throwaway Vite plugin (apps/web/vite.fw.config.mjs, not committed)
FW_PORTS='{"auth":53099,"functions":53001,"firestore":53080}' FW_OUT=/tmp/dist-after VITE_FIREBASE_API_KEY=demo-key \
VITE_FIREBASE_AUTH_DOMAIN=demo-digitable-fw.firebaseapp.com VITE_FIREBASE_PROJECT_ID=demo-digitable-fw \
VITE_FIREBASE_APP_ID=1:000000000000:web:demo VITE_FIREBASE_USE_EMULATOR=true npx vite build --config vite.fw.config.mjs   # from apps/web
npx vite preview --outDir /tmp/dist-after --port 53175 --host 127.0.0.1 --strictPort                                         # before: 53174
# 3. the audits (a unique --port keeps them off other lanes' Chrome)
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:53175 --label fw-after  --out /tmp/audit-after  --port 9720
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:53175 --label fw-after-real200 --out /tmp/audit-after-real200 --port 9700 --default-font-px 32 --no-shots
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:53174 --label fw-before --out /tmp/audit-before --port 9951 --tolerate-baseline   # the same script on the base
node scripts/playtest/two-device-smoke.mjs --base http://127.0.0.1:53175 --out /tmp/smoke --reload --port 9940
# fast loops while developing: --modal-only (the pop-out scenarios only; it does NOT cover the gutters), and with it
# --only-scenario <substring> (e.g. sheet-flip-keeps-focused) to run one scenario
```

## Folders

- `before/`, `after/` (`ccb9f2d` and this branch): eight states at phone 375x812, tablet 768x1024, desktop 1280x800 and table 1920x1080 (downscaled to
  at most 640px wide). They are the same at the default text size except for the GM console's scene echo (one extra line) and, below, the two intentional
  changes the layout diff lists (the scene-2 "Reveal" row, and the sheet's action row where its labels no longer fit side by side).
- `large-text/`: the same pages at 320px and 200% text, before and after (full-page captures).
- `sheet-keyboard/`: the correction sheet with the stand-in keyboard (visible area 320x298, 360x400, 375x400 with the page scrolled 150px, 568x150), before and after;
  `before-360-x1-kb400.jpg` shows "CORRECTIO / N".
- `ios/`: real Safari frames and logs (above). `reports/`: the four audit reports, the layout diff summary, the sheet scans and the probe logs (Reveal row before and
  after, reachability at 120-298px visible, the action row under wider fonts). The layout dump/diff, scan and font probes are throwaway scripts kept outside the repository;
  the method is described above and in the handoff.

## Limits (not hidden)

- No physical device, no Android Chrome with `interactive-widget=resizes-content` on hardware, no VoiceOver/TalkBack/NVDA, no Windows High Contrast run
  (forced-colors is asserted in CSS only), no real iOS Dynamic Type, no iPhone SE rig run (above).
- Display headings still break mid-word at 320px/200% ("Forecourt", "Director console"), as does the 14-letter "Reinforcements" legend; the one-time
  secrets card's `dl` is 20px wider than its card at real 200% (no page overflow). None is a pop-out, picker or option list, so they were left alone.
- The sheet's action row stacks by measuring the label's longest word. If that word is wider than the whole row (a wide font at 200% text on a 320px phone) it breaks
  mid-word instead of overflowing, so nothing is clipped. Measured with the display font replaced by Impact, Arial, Helvetica Neue and Arial Black at 320/360/375/412px
  and 100/150/200% text (48 combinations, `reports/sheet-action-row-wider-fonts.txt`): 44 are clean; in the other 4 (Arial, Helvetica Neue and Arial Black at 320px/200%, Arial Black at
  360px/200%) "CORRECTION" breaks and the Apply button is exactly the row's width. (A first version forced the word's width with an explicit `min-content`, which overflowed the
  row by 9-32px there and was clipped by the sheet; the second review pass found it.) Apply's label is 3px solid when enabled and 2px dashed when disabled, so in a 4px band of
  widths (378-381px with Impact, 448-450px with Arial) the row restacks when Apply becomes enabled, i.e. while the first reason character is typed.
- Button labels now grow with the text setting down to a floor of the text itself and up to 7vw on a narrow phone (about +12% at 320px) rather than exactly
  with it: a design call for John (see the handoff). Below about 316px at 200% text the floor brings mid-word breaks back in two GM-console labels ("Switch to
  simplified", "Reassign"; the old cap had none at 280-320px). The audit's narrowest large-text width is 320px.
- The focus reveal after a layout flip runs once, at the flip. If the visible area shrinks in a burst of resizes (rotation, split-screen, a dragged window; 12 steps
  16ms apart in the review probe) and the flip lands mid-burst, a focused checkbox can end up just below the fold. The on-screen keyboard cannot cause it (it opens only for
  text fields, which are revealed on every resize); a reveal on every resize would also fire while a mobile toolbar collapses under a scrolling finger.
- At the default text size with the keyboard up, small and landscape phones (320x568, 568x320, 667x375) now get one scrolling page where the base kept a 33-112px
  pinned body and a nested action scroller: Apply and Cancel are reachable by scrolling there, not visible at rest. Portrait 360-412px phones stay pinned.
- The injury picker's own state is not reached by every audit run (it depends on the dice); it uses the same `fieldset` + `.gear-option` structure as the
  Stat group, which is audited every run.
- Headless Chrome cannot shrink only the visual viewport; the `sheet-layout-*` scenarios use a stand-in `window.visualViewport` (real layout, real CSS,
  real scrolling). Real Safari was run separately (above).
