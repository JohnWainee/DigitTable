# Mobile pop-out, picker and form audit: independent review

- **Date:** 2026-10-02
- **Branch:** `sonnet-db/reskin-mobile-20261002`, from `d6e2c85` (already reviewed). Implementation `6a2fd2b`; first-pass resolutions `b8f3e0e`; second-pass resolutions `2c5fe8e`.
- **Author:** Sonnet session `db` (this branch). **Reviewer:** one fresh general-purpose agent, no access to the author's reasoning, read-only on the worktree, mutation-testing in a throwaway worktree, which ran the gates, the full emulator-backed audit and the iOS Simulator harness itself, then a second, focused verification pass (see "Verification of the resolutions").
- **Scope:** `apps/web` and `scripts/playtest` only. No engine, contracts, template, Functions, rules, projection or authorization change; no new font, image, remote URL or licensed text.
- **Verdicts:** first pass on `6a2fd2b`: **APPROVE WITH NITS** (one Medium, seven Low/process findings). Second, focused pass over `6a2fd2b..b8f3e0e`: **APPROVE WITH NITS** (one Low residual, two claimed-but-missing tests, nits). All resolved below.

Evidence: [`docs/evidence/db-popout-picker-audit-20261002/`](../evidence/db-popout-picker-audit-20261002/README.md). Harness: `scripts/playtest/ui-audit.mjs`, `scripts/playtest/ui-audit-selftest.mjs`, `scripts/playtest/ios-simulator/`.

## What was audited and changed (author)

| ID | Defect | Resolution |
| --- | --- | --- |
| P1 | Utility-item actions (Cigarettes, Cowboy hat) were class-less `<button>`s, one nested inside its checkbox `<label>`, squeezed to a four-line sliver at 375 px; the size-only audit passed it | Sibling `.secondary-action` in a `.gear-item` wrapper; contract test forbidding class-less buttons outside the +/- steppers |
| P2 | Four signed-out forms relied on the browser's native validation bubble | `noValidate` plus inline, `aria`-linked errors, an alert beside the submit button, focus on the first invalid field |
| P3 | A closed native `<select>` ellipsises the chosen value (scene, edit target, advance) | `SelectedOptionEcho` repeats it in full beneath the control |
| P4 | **iOS Safari only** (found in the iOS Simulator): landscape with the keyboard up leaves ~70-140 px; the sheet's pinned header and footer overflowed, so the title scrolled away, the field overlapped the actions and the buttons were clipped | Below 15 rem of visible height the sheet scrolls as one page (`data-compact`) |
| P5-P7 | Number agreement ("1 of 1 die still need"), scene-director rhythm, an audit that only ever visited the first roster character | Fixed; `rosterSweep` audits all six characters' compose screens and correction sheets |

## Findings and resolutions

| ID | Severity | Finding (reviewer) | Resolution |
| --- | --- | --- | --- |
| 1 | **Medium** | Compact sheet clipped the typed-in field at about 80 px visible or less: the wide-viewport `padding: 1.5rem` survived compact mode (24 px dead band under a sheet already too short). Reviewer measured field 48/48 px at 90, 36/48 at 70, 26/48 at 60. The audit could not see it: it tested only a 90 px height and compared against the viewport, not the sheet's scrollport | `.sheet-backdrop[data-compact]` now overrides top/bottom padding (device insets only) and the compact header/footer padding is trimmed. The audit judges visibility against the sheet's scrollport (`visibleRegion`/`intersect`/`bodyRect`), runs tight-keyboard cases at **90, 70 and 60 px** for two landscape widths, and a contract test pins the CSS. **Negative control:** the pre-fix bundle fails `focusedFieldVisibleInSheet`, `actionsReachableByScrollingSheet` and `titleReachableByScrollingSheet` at 70 and 60 px (12 failed checks); the fixed bundle passes all six cases |
| 2 | Low | iOS harness claims overstated: `heading` resolved to the dialog container so the title assertion was vacuous; landscape asserted only the field; README said "the sheet is in compact mode" (inferred); `xcodebuild.log` path wrong | Heading is now the `<h2>` static text with `frame.height < 120` asserted; README states what XCUITest can and cannot observe (compact mode is asserted by the Chrome tight-keyboard scenarios) and the real log path |
| 3 | Low | Three stale comments (`SheetDialog` "only the sheet body", CSS "only the body scrolls", audit "longest-labelled target") | Corrected |
| 4 | Low | The native `pattern="[A-Za-z0-9-]+"` was dead: Chrome compiles it with the `v` flag, where a trailing `-` in a class is a syntax error (`patternMismatch` always false, console error); the inline rule is the first thing that enforces it. The audit's collector would not see browser-raised messages | Attribute removed (rule lives in `inlineValidation` only); the audit now collects `Log.entryAdded` errors too; a test asserts no `[pattern]` and `novalidate` |
| 5 | Low | `required` became stricter than before (whitespace-only rejected) while the server accepts whitespace-only passphrases and session names | `required` is now non-empty only, exactly like the HTML attribute; a new `visible` rule (needs a visible character) applies only to the three display-name fields, mirroring the server. Unit and form tests for both directions |
| 6 | Low (reasoned) | The error alert stays mounted across a second failed submit and is not re-announced | `FormErrorSummary` is keyed on a failed-attempt counter and remounts each time; a test asserts a fresh node |
| 7 | Low (process) | Handoff not updated; README cites this review and checklist section that were not in the commit | This record, the evidence, the checklist section E2 and the handoff are committed with the docs commit |
| 8 | Nits | `lan-up.sh` recommended (binds unauthenticated emulators to 0.0.0.0); no non-loopback guard; simulator never shut down; hardware-keyboard assumption undocumented; no `xcuserdata` ignore; roster sweep hard-coded 5/6; `.gear-item` button `max-width: 100%` ignores its own margin | Loopback setup documented and `lan-up.sh` no longer recommended; `run.sh` refuses a non-loopback base without `--allow-remote` and shuts down simulators it booted; keyboard assumption documented; `.gitignore` entry; roster sweep sized from the live roster; `max-width: calc(100% - 0.65rem)`. 150%/200% text on the utility button at 320 px is the known 320 px / 200% layout limit, not a regression, and is unchanged |

### Mutation testing (reviewer; first pass)

Mutations against the whole `apps/web` project (the reviewer's report says 71 but lists 68 killed and 5 survived): **68 killed, 5 survived**, now all addressed:

| Survivor | Disposition |
| --- | --- |
| E7: edit-target echo drops the "Objective:" prefix | Test now selects an Objective and asserts the prefix |
| E8: advance echo drops "(already unlocked)" | Test unlocks an advance and asserts the suffix |
| C5: `<` to `<=` at exactly 15 rem | Test asserts 239 compact, 240 and 241 not |
| S5: invalid-border rule moved before the base and focus rules (equal specificity, source order decides) | Contract test pins the rule's source order after both; the browser audit's computed-style check (3 px, `--riot`) also covers it |
| S13: `.scene-director-detail` spacing | Contract assertion added |

The reviewer also noted that the class-less-button scan's regex stopped at the `>` of `=>`: replaced by a real tag scanner (skips `{...}` and quoted strings). The class-less-button claim itself held (per-file counts pinned).

### Checked and sound (reviewer, first pass)

Only `apps/web` and `scripts/playtest` changed; no request/command/projection shape changed; every native constraint in the markup is mirrored by the inline rules; `requestIdRef` idempotency and the pending guard are unaffected; pattern anchoring and `minLength` match the browser; the passphrase hint stays first in `aria-describedby`; specificity and the compact cascade are correct; contrast (computed): `.field-error` text 11.7-15.2:1, `.select-echo` text 11.8-15.8:1, cyan label 9.2-12.3:1, riot border against ink 4.99-5.65:1; forced-colours survive; listeners are removed on cleanup.

### Commands the reviewer ran (first pass, on `6a2fd2b`)

`npm run check` exit 0 (742 passed, 11 todo); `npm run build` exit 0; `node scripts/playtest/ui-audit-selftest.mjs` passed; the full emulator-backed audit (216 states, 2,586 controls, 0 control issues, 0 failures, 87 keyboard checks, 8 validation scenarios, 21 sheet cases); the iOS harness on iPhone 17 Pro (iOS 26.5) passed. `npm run test:emulator` was not run by the reviewer (the author ran it: 18 + 86 + 4).

## Verification of the resolutions (second, focused pass by the same reviewer, over `6a2fd2b..b8f3e0e`)

**Verdict: APPROVE WITH NITS.** Finding 1 (compact clipping) was confirmed fixed for the case first measured and the audit would now catch it; two of the author's claims did not hold and one residual was found.

| ID | Severity | Finding | Resolution (`2c5fe8e`) |
| --- | --- | --- | --- |
| 2-1 | Low | The bottom safe-area inset was counted twice in compact mode: `.sheet-backdrop[data-compact]` padding-bottom `env(safe-area-inset-bottom)` **and** the compact footer's own `calc(.25rem + env(...))`. With a landscape iPhone's 21 px inset the focused field was 43/48 px visible at 70 px and 33/48 at 60 px. The audit ran its tight cases with zero insets, so it could not see it | Backdrop `padding-bottom: 0` (the footer owns the inset). The tight cases now run with and without a landscape iPhone's insets (notch 47 px left/right, home indicator 21 px), and compact reachability scrolls each control into view (`geometryRevealing`) instead of demanding the bottom scroll stop (which wrongly fails a sheet whose footer padding sits below the button). **Negative control:** the `b8f3e0e` bundle fails `focusedFieldVisibleInSheet` and `actionsReachableByScrollingSheet` at 70 and 60 px with insets (8 failed checks); the fixed bundle passes all 12 tight cases |
| 2-2 | Low | The echo tests for E7 (the "Objective:" prefix) and E8 (the "(already unlocked)" suffix) that the first resolution claimed were not in the commit: the edit script that added them had silently not applied after a lint auto-fix changed the file | Added; **mutation-verified by the author** (dropping the prefix, then dropping the suffix, each fails the test) |
| 2-3 | Low | `visible: true` on the join and recover display names was untested; and the recover display name is local-only (the recover callable takes just the room and recovery codes), so "the server's rule" does not apply to it | A join-form test (visible name required, whitespace passphrase passes through); the recover rule drops `visible` and keeps the browser's semantics, with a test |
| 2-4 | Nits | Compact header padding and the compact backdrop's top padding had no test; `run.sh`'s glob guard accepted `http://localhost:80@evil.example`; no `trap`, so Ctrl-C left a script-booted simulator running | Contract assertions added; strict loopback regex (verified to refuse `localhost:80@evil.example`, `127.0.0.1.evil.com`, and remote URLs, and to accept IPv6 loopback); trap-based shutdown |

Second-pass compact probe (Chrome, real flow, no insets unless stated): at 812, 667 and 568 px wide the focused field, Apply, Cancel and the title were fully visible at every height from 241 px down to 60 px; at 241 px the layout is pinned and at 239 px compact; below about 52 px (50 px: field 44/48) a 48 px control cannot fit in a sheet that is the visible height minus 4 px, which is geometry, not a bug, and is below the measured range. Portrait 320 px (568, 312, 239, 120 px) and 200 % root font size (threshold 480 px) were fine; at 200 % text a landscape phone is compact even without a keyboard (a first-pass side effect of the rem threshold, noted). No horizontal overflow anywhere.

Second-pass mutation table (whole `apps/web` project per mutant): killed C5 (`<` to `<=`), S5 (rule order), S13, N1 (drop `visible`), N2a, N3 (`required` reverts to `trim`), N4 (drop `key={attempt}`), N5, N6/N6b/N6d (compact block, original bottom-padding defect, footer padding), N7 (`pattern` restored), N8 (`max-width: 100%`), N9, N10. Survivors then: E7, E8 (fixed above), N2b/N2c (join/recover `visible`; fixed above), N6c/N6e (compact top and header padding; contract assertions added above). The reviewer also showed the old button-tag regex raises a false positive on `<button onClick={() => ..} className="primary-action">` while the new scanner does not.

Second-pass commands (clean clone of `b8f3e0e`): `npm run check` exit 0 (749 passed, 11 todo); `npm run build` exit 0; `ui-audit-selftest.mjs` passed. Not run by that pass: the full emulator-backed audit and the pre-fix negative controls (the author's runs held the ports), the Simulator.

The `2c5fe8e` changes were verified by the author's gates and negative controls below, not by a third review pass (the same convention as `docs/reviews/2026-09-18-sonnet-d-reskin-independent-review.md`).

## Author's gates on the final code (`2c5fe8e`)

- `npm run check`: format, lint, typecheck and **752 tests passed, 11 todo** (77 files passed, 1 skipped; baseline 703).
- `npm run build`: passed (existing Vite chunk-size warning).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator`: **18 rules + 86 Functions + 4 web** passed.
- `node scripts/playtest/ui-audit.mjs` (local emulators): **216 states, 2,442 controls, 0 control findings, 0 overflow states, 0 hard axe violations, 87 keyboard-focus checks, 8 validation scenarios, 21 sheet cases, 12 tight-keyboard cases, 0 failures**; the same script against the unmodified `d6e2c85` build: 216 states, 2,514 controls, 65 control findings, **154 failures**. (The control count varies by a hundred or so with the dice roll in the allocation state; it is not a regression.)
- `node scripts/playtest/ui-audit-selftest.mjs`: passed (12 detectors, good and bad fixtures).
- `scripts/playtest/ios-simulator/run.sh`: passed on iPhone 17 Pro (iOS 26.5), iPhone 17e and iPad mini (iOS 27.0); against the `d6e2c85` build it fails (the field overlaps the action row; no inline errors).

## Not verified by anyone (manual release gate)

Physical iPhone/Android hardware, VoiceOver, TalkBack, NVDA, Windows High Contrast, Firefox, and real networks. The iOS Simulator and headless Chrome emulate touch and keyboards but are not devices; the 70-140 px range is an estimate from Simulator screenshots (XCUITest cannot read `visualViewport`) and needs a physical-device look. Section E2 of `docs/evidence/today-qwen/CHECKLIST.md` lists the owed checks.
