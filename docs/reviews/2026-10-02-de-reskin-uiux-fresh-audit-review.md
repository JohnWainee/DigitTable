# Fresh reskin UI/UX audit of PR #41 candidate `d0fe5b4` (2026-10-02, second pass of the day)

- **Branch:** `sonnet-de/reskin-uiux-20261002`, from `d0fe5b4` (the head of PR #41, `factory/reskin-ca-integration-20260930`).
- **Scope:** every mobile select, menu, disclosure, modal sheet, native option list, allocation/action picker and
  input/recovery secret field at phone, tablet, desktop and table widths, with the on-screen keyboard, dynamic
  viewport, safe areas, 200% text and zoom, plus accessibility and flows; the deployed experience and the source.
- **Constraint kept:** presentation only. No engine, contracts, template, Functions, rules, authorization,
  projection, asset or deployment change; nothing merged or deployed.

## Verdict: two real defects found and fixed; everything else checked is sound

The harness and the earlier passes on this lineage reported no remaining product defect. Each defect below was
invisible to them for a specific reason: D2 needs the keyboard behaviour of **iOS** (headless Chrome shrinks the
layout viewport instead, so its keyboard emulation never reaches the failing heights), and D1 needs a control
whose command the server **rejects**, which the audit never pressed. This pass added real iOS Mobile Safari (iOS
26.5 Simulator, real soft keyboard), measurements of what a person sees after acting, and a few detectors the
harness lacks (focus order, clipped content, forced colors, a real browser text size). It also closes the soft-keyboard
verification gap left by `ebac344`.

### D1 — a rejected command's message was off screen (GM console, claim list, player dashboard)

Pressing "End round" while a roll is still open is a real server rejection (`ROUND_HAS_OPEN_ROLLS`, "Resolve or
void: roll-1"). The screens render that message near the top of a very tall page while the control sits far below,
so the tap looked ignored. Measured after the tap, on the unmodified candidate:

| Viewport  | Page height | Control → message | Message top relative to viewport |
| --------- | ----------- | ----------------- | -------------------------------- |
| 375×812   | 5,405px     | 855px             | −542px (off screen)              |
| 320×568   | 5,734px     | 924px             | −734px                           |
| 812×375   | 4,801px     | 686px             | −591px                           |
| 768×1024  | 4,801px     | 686px             | −266px                           |
| 1280×800  | 3,029px     | 780px             | −472px                           |

("Control → message" runs from where the control was before the tap to the top of the message. The message is inserted
above the control, so the page grows by 69px at the first four widths and the control sits that much further down; the
desktop multi-column layout does not grow.)

**Fix:** `CommandAlert` (`apps/web/src/shared/CommandAlert.tsx`) replaces the bare `<p role="alert">` on the three
long screens. A message from the screen's **own** command is scrolled into view when it appears (`block: "nearest"`,
instant, so there is no motion to suppress for reduced-motion visitors); focus never moves (checked in a real browser:
the pressed button still has focus after the scroll at all five widths). The screens clear their
error before every send, so an identical repeated rejection scrolls again. A failure the room session reports on its
own account (a queued command replayed after reconnecting, a lost connection) is still shown but does **not** scroll,
so it cannot pull the page away from someone typing lower down with the keyboard up (an independent-review finding,
fixed). After: the message is fully on screen at all five widths (top at 12px, the scroll margin). The three forms
(join/create/table) already render their alert under the submit button and were left alone.

**Alternative measured, not adopted — the sibling lane's sticky banner (`d5d30b3`, `sonnet-cw/reskin-pr41-fresh-20261002`).**
Both fix the visibility; the cost differs (`evidence/…/comparison/`):

| Measured at the same states                                | Scroll into view (this branch) | Sticky banner (`d5d30b3`)                          |
| ---------------------------------------------------------- | ------------------------------ | -------------------------------------------------- |
| Message fully on screen after the tap (5 widths)           | yes                            | yes (also in the desktop multi-column layout)      |
| Footprint after the tap                                    | in flow, scrolls away          | 63px pinned until the next command: 8% of an 812px viewport, **17% of a 375px-tall landscape one** |
| Keyboard focus walking up the page (Shift+Tab, 812×375)    | 0 of 25 stops under the message | **10 of 25 stops partly hidden under it**         |
| Moves the page                                             | yes, to the message            | no                                                 |
| The control that was pressed is still on screen afterwards | **1 of 5** widths (tablet); at the other four it ends 60–438px below the bottom edge | 5 of 5 (nothing moves) |

The cost of this branch's choice is that the person is taken to the message and the control they pressed is usually left
below the fold (the row above; the person must scroll back to it), and that `scrollIntoView` moves the page at all. The
sticky banner avoids both, but it takes a fixed slice of short screens and, as keyboard focus walks up the page, partly
covers focused controls: 10 of 25 stops at 812×375, **none entirely** (0 of 25 are fully under it). That is a pass for WCAG 2.2 SC 2.4.11 Focus Not Obscured (Minimum, AA: not _entirely_ hidden) and a fail for
SC 2.4.12 (Enhanced, AAA: no part hidden). The two cannot both be applied (same three call sites, same stylesheet
region); the integrator should pick one.

### D2 — the GM correction sheet was clipped in landscape with the iOS keyboard (a gap every earlier record named)

Measured by the page itself (`visualViewport` and `getBoundingClientRect`, pixels relative to the top of the visual
viewport) on iPhone 17 Pro, iOS 26.5, Mobile Safari, from the committed page logs
(`ios-simulator-logs/page-log.before-fix.jsonl` for the unmodified candidate, `page-log.after-fix.jsonl` for the final
bundle; one `run.sh` run each) and cross-checked against the XCUITest frames (`sheet-keyboard.*.log`) and screenshots:

| State                                   | `visualViewport.height` | Before the fix (unmodified `d0fe5b4`)                                                                                                                                                                                              | After the fix                                                                                                                                                                                             |
| --------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portrait, keyboard up                   | 377px (innerHeight 754) | Pinned layout: body 197px; label 195…215, field 220…268, Apply/Cancel 299…365, all inside the 351px sheet                                                                                                                           | unchanged (still pinned)                                                                                                                                                                                  |
| Landscape, **rotated** with keyboard up | **98px** (innerHeight 402) | Body 28px; label −3.6…16.4 (hidden under the title); field 22…70 (half outside the body); Apply/Cancel 64…131 against a 98px sheet, labels cut mid-glyph. Three touch drags inside the sheet scrolled the body only: Apply/Cancel stayed at 64…131 | Single scroll: label 16…36 and field 42…90 inside the 94px scrolling box; Apply/Cancel at 104…152. **One touch drag brings both to 22…70** and they stay there (further drags do not move them)             |
| Landscape, keyboard **raised** there    | **126px**               | Body 45px; label 3…23; field 29…77 past the body's end; Apply/Cancel 81…147 against a 126px sheet, the buttons cut off at its edge. Drags again moved only the body                                                                                       | Label 44…64 and field 70…118 inside the 122px scrolling box; Apply/Cancel at 132…180; after one drag, 50…98, fully visible. Tapping Cancel then closed the sheet with the keyboard up                      |

At 126px the unmodified sheet's Cancel could also be tapped (the top 45px of the button was visible), so the tap is not
what separates the two builds; what does is that the label and field are visible together, that both actions can be
brought fully into view by touch, and, at 98px, that a drag leaves the unmodified actions where they were.

(A first run, taken while iOS's one-time "slide to type" panel stood in for the keyboard, was discarded: that panel is
much taller than the real keyboard, and the screenshot is what exposed it.)

Cause: iOS shrinks only the visual viewport for the keyboard (`innerHeight` stayed 402), so no media query can react,
and a pinned title + action row (~90px of chrome) leaves nothing for the body below ~140px. The previous harness
emulated the keyboard as 45%/55% of the screen (169px at best), above that failure band.

**Fix** (`styles.css`, `SheetDialog.tsx`): `.sheet-backdrop` — which is exactly the visual viewport (`--vv-*`) — is a
size container, and `@container sheet-viewport` switches the sheet to one scrolling page below **11rem** (176px; it
scales with text size), or below 20rem for a phone under 22rem wide. `reveal()` now measures whichever box scrolls, and
the single-scroll sheet carries 0.4rem of scroll padding so that a Tab-focused action's focus ring is not clipped at the edge.

- Why 11rem and not 15rem. A first version used 15rem; the dense sweep showed the pinned layout still fits label + field
  + a one-row action row from ~177px, and above that pinned is better than scrolling to the actions. 11rem is where
  pinning stops fitting; the 190px "must stay pinned" gate pins the other side.
- Why the narrow branch. At 320px the two buttons stack (~120px); the footer's 40% cap hid Cancel behind its own
  scrollbar below ~300px (pre-existing, found by the sweep).
- Sweep (Chrome, 7 widths × 12 visible heights, judged on the box that scrolls): the minimum visible height at which the
  field and both actions are usable fell from **320 / 200 / 140px** (320 / 375 / ≥568px wide) to **60 / 80 / 60px**.
  Rotating with the sheet open already kept focus, typed text, scroll lock and inert state in all four cases.
- Fallback: engines without container queries (iOS < 16, Chrome < 105) ignore the block and keep today's pinned layout.

**Gates.** `ui-audit.mjs` now runs five single-scroll cases (874×98, 874×126, 667×100, 320×220, 320×280) and two
controls that must stay pinned (667×190, 375×447) — seven in all — and its keyboard and 200%-text checks judge the
scrolling box instead of assuming a pinned body. Only 98px and 126px were measured on a device (the iOS Simulator); the
other heights are derived from them and from the pinned layout's limits. In Chrome the landscape cases reproduce the
iOS pixels (no `--vv-*` override, no vertical backdrop padding); the portrait cases (320×220/280, 375×447) share the
layout the stylesheet chooses but not the chrome iOS would add around it, because iOS keeps the layout viewport tall
and Chrome shrinks it. **Against the unmodified candidate the new gates fail with 18
findings** (5 command-feedback + 13 tight-keyboard); against this branch the full audit passes. Unit/contract tests
were each mutation-verified (reverting `reveal()`, restoring the bare alert, narrowing the effect keys).

## Checked and found sound (evidence tier in brackets)

- **Secret entry on a real iOS soft keyboard** [iOS Simulator, on-screen keys]. This verifies fix `ebac344`, recorded
  by its pass as "source-read, NOT test-verified". Positive control: a default-traits field typed `teh ada` came out
  `The ada` (iOS capitalised and autocorrected it). Room code `ab12cd` → `AB12CD`; passphrase `teh wolfbane gate` →
  unchanged; recovery code `abcd2345efgh` → `ABCD2345EFGH`. (XCUITest `typeText` bypasses iOS autocapitalise/
  autocorrect and could not have shown any of this — the tool uses the on-screen keys.)
- **Native validation bubble** [iOS Simulator, screenshot]: on an empty submit with the keyboard up, iOS shows "Fill out
  this field" above the focused field, fully visible. The sibling lane's claim that it is hidden by the keyboard did
  **not** reproduce. (The test records, it does not assert: the bubble is drawn by the OS outside the web view, so the
  accessibility query logs `exists=false`; the screenshot is the evidence.)
- **Native `<select>` option list** [iOS Simulator, screenshot]: the OS draws a popover with full option text and a
  checkmark; the closed control shows the whole value at 402pt. (Also record-only: iOS 26 shows a popover list, not a
  wheel, so the `wheels=0` the test logs is expected.)
- **Keyboard focus order** [Chrome]: a visible focus indicator on every stop and every stop inside the viewport on the
  join/create/table forms, player compose (10 stops), allocation and GM console (30 stops). There is no sticky/fixed
  element besides the sheet backdrop.
- **Clipped content** [Chrome]: no `overflow: hidden` text loss at 320/375/812. 27 captures per pass (9 states × 3
  widths: the four signed-out routes, recovery, player compose with the disclosure closed and open, GM console, table)
  at default text and again with a 200% root size; the second run added 6 player-compose and 3 allocation captures at
  200%. (The default-text pass has no allocation state.)
- **Forced colors** [Chrome emulation, not a Windows run]: no boundary-less control; checked/unchecked boxes and radios
  distinguishable on compose and in the sheet; a focus outline is drawn.
- **A real 200% browser text size** [Chrome `--blink-settings=defaultFontSize=32`, which moves the rem media queries]:
  the state sweeps are clean (174 states, 1,518 controls, 0 control/overflow/axe findings). The modal scenarios report 11
  findings on the final build, none of them a product defect: 3 are default-text assumptions that fail identically on
  the unmodified build (actions visible without scrolling at 320×568 and 667×375; actions inside a 1.6×-zoomed visual
  viewport); 6 are the iOS-measured tight-keyboard heights (98, 100 and 126px, chosen at 100% text), where a doubled
  label, field and pair of buttons cannot fit at all; and 2 are the "must stay pinned" controls (190px and 447px), whose
  expected layout is calibrated at 100% text: the thresholds are in `rem`, so at 200% text (11rem = 352px, 20rem = 640px)
  the sheet correctly chooses the single-scroll layout there. The unmodified build fails 35 in the same (modal-only) run,
  including all five command-feedback widths and every keyboard case.
- **Zoom equivalents** [Chrome]: 640×400 (200% of 1280×800) and 320×200 (400%) keep the field and both actions usable
  (320 wide needed 300px before the fix).
- **Reduced motion, safe areas, pinch zoom, reflow, 15 prior modal scenarios** [harness]: unchanged and passing.

## Observations left alone (not defects of this change, or out of scope)

- At 320px, two options of the edit-target `<select>` — "Threat: Station Patrol A" and "…B" — show identical visible text
  (the value is truncated with an ellipsis); at ≥375px they differ. GM-only, shipped content; the sibling lane echoes the
  selected value below the control (`6a2fd2b`, not adopted).
- The server accepts `ReassignCharacter` to a member id that does not exist and `GrantItem` with a `bonusPlus` outside the
  UI's 0–4. That is the GM-trusted engine's behaviour, outside this UI audit, flagged for the owner.
- The opening scene's GM briefing reads "…RevealThreat it once round 2 begins." (a command name inside prose,
  `templates/eat-the-reich/src/scenes.ts`).
- Known limit of the final threshold: 375px wide × 177–199px tall keeps the pinned layout, whose two-line buttons
  (66px) exceed the footer's 40% cap, so they sit behind the footer's own scrollbar. No real device is there (portrait
  phones keep ≥220px with a keyboard; landscape phones are ≥568px wide). Below ~80px visible nothing can fit a 66px button.
- A rejection that arrives while a sheet is open is shown but not scrolled to (the page is inert, and closing the sheet
  scrolls back to its trigger anyway), so in that narrow timing it can still end up above the viewport.
- In the single-scroll layout the sheet's scroll padding (0.4rem each side) leaves about 7.6px of slack around the
  label + field pair at the 98px iOS height (73.6px of pair in 81.2px); at roughly 110% text the pair no longer fits and
  `reveal()` shows the field alone, by design. `0.4rem` covers the 6px focus ring at a root font of 15px or more.
- D1 was exercised in real Chrome and by the GM-flow test; the claim list and player dashboard use the same component and
  are pinned by a source test, not by a real-browser rejection. D1 was not exercised on iOS WebKit.
- Operationally: a sibling session held the default emulator ports (see the evidence README for the workaround) and
  later killed every emulator process on the machine, including this run's; nothing here depends on a run that spanned it.

## Overlap with sibling lanes (for the integrator)

- `sonnet-cw` / `d5d30b3` (pushed): sticky `ActionFeedback`, same defect as D1; mutually exclusive with `CommandAlert`.
- `sonnet-db` / `6a2fd2b` (local only, from the older `b599abd`): a JS `data-compact` sheet below 15rem, inline form
  errors, selected-value echo and an iOS Simulator harness. This pass reproduced its sheet finding independently
  (D2), measured its validation-bubble claim as not reproducible, and did not adopt the rest.
- `sonnet-cz`, `sonnet-dd` (older lineage): code-entry hardening and the un-nested utility-item buttons are already
  in this candidate as `ebac344` and `98bb2db`.

## Verification (final tree)

- `npm ci`; `npm run check` — Prettier, ESLint, `tsc`, **730 passed | 11 todo** (74 files passed, 1 skipped; baseline 709).
- `npm run build` — Functions and web pass (existing chunk-size advisory only).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **18 + 86 + 4 = 108/108**. Run before the
  review-driven edits; nothing it exercises (Functions, rules, contracts, the client's Firebase seams) changed afterwards
  (`git diff d0fe5b4 -- packages templates apps/functions firestore.rules database.rules.json` is empty).
- `node scripts/playtest/ui-audit.mjs` against a live-mode production build and local emulators, after the review's
  changes — **174 states, 116 large-text sweeps, 1,614 controls, 22 modal records, 5 feedback records, 0 findings**, zero
  console/request errors on all four devices; the only axe note is the known `page-has-heading-one` on the intentional
  nonexistent-room route. (The control total moves between runs with the dice; see the evidence README.)
- The same final harness against the unmodified candidate (`--modal-only`): **18 findings** (5 command-feedback, 13
  tight-keyboard), with the two "must stay pinned" controls passing. Under a real 200% text size: 11 modal findings on the
  final build (classified above), 35 on the unmodified one.
- Sheet-height sweep, zoom equivalents and rotation with the sheet open, on the final build: minima 60 / 80 / 60px,
  12 of 12 zoom rows and 4 of 4 rotation cases pass.
- `two-device-smoke.mjs --reload` — local **17/17** (zero console errors, zero failed requests, no positive overflow);
  deployed staging (`powerglove-1cd23.web.app`, the pre-candidate build, 2026-10-03T00:09Z) **17/17**.
- iOS 26.5 Simulator through the documented `scripts/playtest/ios-keyboard/run.sh` (a fresh dedicated device per run,
  removed afterwards): all four tests ran on the final bundle (`** TEST SUCCEEDED **`) and the sheet test on the unmodified
  bundle. The tests record measurements; the claims rest on the page logs, frames and screenshots in the evidence pack.
- `git diff --check d0fe5b4..HEAD` clean.

## Independent review

### Review 1 — a fresh read-only reviewer on the first commits (`5a907c1`)

A separate agent that had not seen the author's reasoning judged only the repository: it ran the unit, contract, lint,
typecheck and format suites, `git diff --check`, and re-derived the numbers from the committed JSON. **Verdict: request
changes — small, and docs/evidence plus a few P2 code items. No P0 and no code-level P1; both product fixes were found
sound.** It confirmed that nothing under `packages/`, `templates/`, `apps/functions/`, the rules, or any authorization
or projection code changed; that no key, token, email or personal path was added; that the numbers it re-derived match
the JSON (the D1 table, the sticky comparison, the 18 mutation findings, 22 modal and 5 feedback records, 174 / 116 /
1,614, real-200% 10 vs 35, the sweep minima, smoke 17/17 twice); and that each new test fails under the mutation it names.

| #     | Finding                                                                                                                       | Disposition (all applied)                                                                                                                                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1-1  | Two smoke reports held room codes (one from a live staging room whose passphrase is in the committed script); README said none | `two-device-smoke.mjs` records only the code's shape; both reports redacted; README states exactly what the pack holds; the three local commits were rebuilt before the first push, so no code is in any pushed history                       |
| P1-2  | The D2 viewport/body/label numbers had no committed source                                                                      | Page logs for the unmodified and the final bundle are committed (`ios-simulator-logs/page-log.*.jsonl`), produced by the documented `run.sh` with a fresh device each; the logger records geometry and typed-value lengths only, no URL      |
| P1-3  | The handoff said the sticky banner "fully hides" 10 of 25 stops                                                                 | It partly covers them, none entirely (0 of 25, now a counted field); handoff and record say so, with the WCAG 2.4.11 (AA) / 2.4.12 (AAA) distinction                                                                                         |
| P2-4  | `CommandAlert` also scrolled for failures the person did not cause                                                              | Only the screen's own `error` scrolls; a session `failure` is shown but never moves the page; unit tests pin both                                                                                                                            |
| P2-5  | The pressed control is left off screen; the comparison had no such row                                                          | Row added, with the control's position measured after the tap (`pressedControlAfter`), not inferred; the probe also now focuses the button first, as a tap does, and confirms focus stays                                                    |
| P2-6  | Stale `SheetDialog` comments; `=== "auto"` discriminator                                                                         | Comments and docblock corrected (narrow-phone and large-text cases named); any scrollable `overflow-y` now counts                                                                                                                           |
| P2-7  | Focus ring clipped at the edge in the single-scroll layout                                                                      | `scroll-padding-block: 0.4rem` on `.sheet` inside the container block; the sweep minima are unchanged (60 / 80 / 60px)                                                                                                                      |
| P2-8  | The contract test could not see a second or looser `@container` block                                                           | Exactly one `@container` block and its exact normalized query are pinned                                                                                                                                                                     |
| P2-9  | Reload race in the feedback gate                                                                                                | A marker set on the old document must be gone before the new one counts                                                                                                                                                                      |
| P2-10 | The feedback gate could pass on an unrelated alert                                                                              | It measures the screen's own rejection (`main > [role="alert"].error-message`); against the unmodified build it still finds the message and fails, with the D1 table's values                                                              |
| P2-11 | Portrait tight cases do not reproduce iOS pixels; boxes recorded after the actions were scrolled into view                     | The comment and this record say which cases reproduce iOS pixels and which share only the layout choice; screenshot and recorded boxes are taken before the scroll                                                                           |
| P2-12 | iOS tooling: relative `--dist` resolved after `cd`; signal traps did not exit; ignore rules; a malformed `%` crashed the logger | All fixed; `xcuserdata` ignored; examples use `$TMPDIR`; the logger answers 400                                                                                                                                                              |
| P2-13 | Smaller doc inaccuracies                                                                                                        | "six cases" → five plus two controls; "36 captures" → 27 per pass; the real-200% findings re-classified (3 / 6 / 2); the two record-only iOS tests described as such; landscape screenshots stored upright (a stray EXIF tag had rotated them in viewers); the differing control totals explained (allocation-state dice); `git diff --check` clean; the 98px touch scroll now shown on iOS with a corrected in-sheet drag |

### Review 2 — a second fresh reviewer, on the changes made in response to Review 1

A different read-only agent examined only the uncommitted changes made after Review 1 and checked that each earlier
finding was really resolved, running the targeted suites (`vitest` on `shared`, `styles`, `gm2`: 133 passed; `tsc`;
`eslint`) and reading the code. **Verdict: request changes, for one reason only:** the room-code redaction existed in the
working tree while the codes were still in local commit `5a907c1`. The branch had no upstream, so nothing had been
pushed; the three local commits were rebuilt from the final tree before the first push (no force-push involved), so
those codes appear in no pushed history. It found no P0 or P1 in code and judged the other seven items resolved
(`CommandAlert`'s condition and deps and each call site clearing its error first; the `scrollsItself` discriminator; the
scroll padding confined to the container block and consistent with `reveal()`'s arithmetic; the contract test's pins and
its independence from build minification; the reload marker, the scoped alert selector and the screenshot ordering; the
iOS tooling; the probe arithmetic). Its P3 suggestions:

| #   | Suggestion                                                                                                                                     | Disposition                                                                                                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `run.sh`: an empty `--dist` became the caller's directory, so the missing-dist check could never fail (and `apps/web` has an `index.html`)       | Empty values stay empty and are refused with a message (checked: exit 2, no Simulator device created); cleanup ignores a second INT/TERM; the README build step runs in a subshell so the next command starts at the repository root                                    |
| 2   | `two-device-smoke.mjs` could still leak a code in a failure message that quotes the invite panel                                                | Every code the run learns (room, table, recovery) is collected; failure text, captured alerts, the `FAIL` console line and the whole serialized report go through one `scrub()`                                                                                          |
| 3   | A rejection that arrives while a sheet is open scrolled the hidden page, which closing the sheet then undoes                                    | `CommandAlert` does not scroll under `[inert]` (the sheet makes the rest of the page inert); the message is still shown. Known limit: such a message is not scrolled to afterwards                                                                                      |
| 4   | Test gaps                                                                                                                                       | Added: a new `failure` object with an unchanged `error` does not re-scroll (the `[error, failure]` mutation is now caught); the real GM flow presses End round twice and expects two scrolls (dropping `setError(null)` is caught); `scroll` and `overlay` for `scrollsItself`, with the iOS-measured 73.6px pair, 6.4px padding and 94px sheet (reverting to `=== "auto"` is caught); the default `.sheet` has no `scroll-padding-block`. Kept as is: the global `@container` count is deliberately strict, because an unnamed container query would also apply to `.sheet` |
| 5   | `ui-audit.mjs`: the proportional-keyboard screenshot was still taken after the scroll-into-view step; a stale comment; an `=== "auto"` check     | Screenshot first; comment corrected; the same "scrollable overflow" notion as `SheetDialog`                                                                                                                                                                              |
| 6   | `fresh-probes.mjs`: the old-document reload race; it threw when the button finder found nothing                                                 | Reload marker; null guard                                                                                                                                                                                                                                                |
| 7   | The scroll padding narrows the 98px margin (73.6px pair in 81.2px: 7.6px of slack, not 20px); `0.4rem` covers the 6px ring only at a root of 15px+ | Accepted and noted below. At about 110% text the label drops out and the field alone is revealed, by design. The iOS "after" evidence was regenerated on the bundle that contains this CSS                                                                                |
| 8   | README: a repository-root-relative command after a `cd`; the masked shape quoted as `XXXX-XXXX`                                                  | Fixed (`XXXXX-XXXXX`)                                                                                                                                                                                                                                                    |

Both reviewers, working from the repository alone, found the two product fixes sound; neither found anything under the
engine, contracts, templates, Functions, rules, authorization or projection code, and neither found a key, token, email
or personal path (the only secrets found were the room codes Review 1 caught, now redacted and kept out of pushed
history). Everything above was applied and the gates re-run on the final tree.

## Not verified (the remaining physical-device gap)

Physical iPhone/iPad and Android hardware (touch feel, other models' keyboard heights and Safari toolbar states,
Android Chrome and Firefox), VoiceOver/TalkBack and other assistive technology, a real Windows High Contrast run,
OS-level text-size settings (Dynamic Type, Android font scale — Chrome's default-font flag stands in), D1 on iOS
WebKit, and the deployed site (staging still serves a pre-candidate build). Nothing was deployed or merged.
