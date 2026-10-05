# Second ink-black reskin pass and pop-out audit (lane `sonnet-fa`)

Branch `sonnet-fa/reskin-orchestrated-20261005`, from `main` at `b599abd`. Everything here ran against a **local** Firebase emulator stack (`demo-digitable`, fake project, remapped ports) and local `vite preview` builds. Nothing was deployed, no production resource was created, no secret was used, and staging was **not** contacted (see "Staging" below).

## What changed (presentation only)

- **Look:** near-black field (`--ink-0..3` darkened), an acid/ink hazard rail across the top of every page, 0.5rem coloured top rails on panels (riot red for player steps, hot pink for scene cards, cyan for GM panels, acid for secrets), a dashed "cut line" and diagonal scuffs inside each panel, a misregistered black + red hard shadow, a stronger procedural grain, bigger display headings, louder primary buttons. All textures are procedural CSS / inline SVG (provenance unchanged: `assets/generated/eat-the-reich/README.md`).
- **Pop-outs:** `useBackDismiss` makes the browser/OS **Back** control close the sheet instead of leaving the console (see below).
- **Large text:** gutters, display type and button type ease with the viewport (`--gut`, `--gut-sm`, `min(clamp(...), Nvw)`), identical at 100% text from about 372 px up (button side padding is capped at `5.4vw`, i.e. unchanged from 370 px; display-type caps only bite when text is enlarged).
- **Option rows:** the "Mark and regain Blood" action was an unstyled button squeezed inside an option row (wrapped to four lines at 375 px; pushed 37 px off-screen at 320 px / 150% text). It is now a real `secondary-action` below its text; the GM "Reveal" row gets the same wrap rule.
- **Forced colors:** the "Why?" disclosure marker vanished in Windows High Contrast; it now uses a system colour.

No change to `packages/*`, `templates/*`, `apps/functions`, rules, routing tables, projections or authorization.

## Files

- `before/`, `after/` — 38 images each: nine screen states (`anon-landing`, `anon-create-form`, `player-claim-roster`, `player-compose`, `player-allocation`, `player-resolved`, `gm-console-pending`, `table-idle`, `table-after-roll`) at `phone` 375×812, `tablet` 768×1024, `desktop` 1280×800 and `table` 1920×1080 (downscaled to ≤1000 px, JPEG q55), plus the GM correction sheet at phone and tablet. `before` is `b599abd` built the same way.
- `safari-ios/` — real Mobile Safari (iOS 26.5 Simulator, iPhone 17): the real stylesheet and the real `CorrectionDialog` in a throw-away harness page, and the app landing page. Fresh-simulator coach marks overlay some frames.
- `reports/` — the machine-readable `ui-audit.mjs` reports: `before-100pct`, `after-100pct`, `before-150pct-text`, `after-150pct-text`, `after-200pct-text`, `before-forced-colors`, `after-forced-colors`. Each `report.json` holds every state × viewport (axe findings, control audit, overflow, broken words) and the pop-out scenarios.

## How it was produced

```bash
# once; remapped ports (36xxx) because peer lanes hold the defaults
npm ci && npm run build --workspace @digitable/functions
npx firebase emulators:start --config <remapped-ports.json> --only auth,firestore,functions --project demo-digitable &
VITE_FIREBASE_*=demo VITE_FIREBASE_USE_EMULATOR=true npx vite build --outDir /private/tmp/dist-after   # a local config swaps only the port numbers
npx vite preview --outDir /private/tmp/dist-after --port 36174 &
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:36174 --label after --out /private/tmp/audit-after
node scripts/playtest/ui-audit.mjs ... --root-font 24                      # 150% text, every state
node scripts/playtest/ui-audit.mjs ... --root-font 32                      # 200% text, every state
node scripts/playtest/ui-audit.mjs ... --emulate-media forced-colors=active
```

## Headline numbers (150 state × viewport captures per run, six viewports 320/375/812-landscape/768/1280/1920)

| Check | Before (`b599abd`) | After |
| --- | ---: | ---: |
| Controls audited / control findings (<44 px, outside viewport, text-entry <16 px) | 1,518 / 0 | 1,530 / 0 |
| Horizontal-overflow states | 0 | 0 |
| axe WCAG 2.x A/AA/2.2 violations (real colour contrast) | 0 | 0 |
| axe best-practice | `page-has-heading-one` (intentional nonexistent-room route, F7) | same |
| Pop-out scenarios (containment at 6 sizes, keyboard, pinch, safe areas, 150/200% text, reduced motion) | pass | pass |
| **Browser Back with the sheet open** | **fails**: navigates `#/room/<id>/gm` away; the console and the open sheet are lost | **passes** (sheet closes, route and console stay; the typed reason is discarded with the sheet, no inert/scroll-lock leak, Cancel leaves no stray history entry) |
| **150% text, every state** (broken-word detector + overflow + targets) | 51 failures (word breaks in "Correct", "Reinforcements"; a 37 px overflow; "Mark and regain Blood" 37 px off-screen at 320 px) | **0** |
| **200% text, every state** (plus a check that button text really grew ≥1.5×) | not run on `before`; 205 failures in the first iteration of this pass | **0** |
| **Forced colors (Windows High Contrast)** | 12 "disclosure marker invisible" failures (+ axe contrast artefacts) | **0** |

The first `before` run stopped at 108 of 150 states because `ui-audit.mjs` hard-coded a character called "Rook" that the sourcebook roster no longer contains; the selector is now roster-agnostic (this was the previously recorded "selector fix that never reached this lineage" problem).

## Pop-out inventory (what exists in `apps/web/src`, and what was audited)

| Control | Behaviour | Evidence |
| --- | --- | --- |
| 6 native `<select>` (`#scene-select`, `#edit-target`, `#grant-character`, `#advance-character`, `#advance-select`, `#reassign-character`) | Deliberately native. On touch the OS draws the picker; on desktop the browser positions it. We own only the closed control: full width, ≥48 px, 16 px type, ellipsised, dark popup via `color-scheme`. A custom popover/listbox would reintroduce the anchor-clipping risk the brief names; the native popup cannot clip. Headless Chrome cannot screenshot the popup itself | control audit: 0 findings at all 6 viewports × 150 states, also at 150%/200% text |
| GM correction sheet (`SheetDialog`) | Bottom sheet below 641 px, centred card above; visual-viewport sized, safe-area padding, pinned header/actions, only the body scrolls, scroll lock, inert background, focus trap + return, **Back closes it** | `reports/after-100pct.json` `modal[]`; screenshots `gm-correction-sheet-*` |
| "Why?" `<details>` | In-flow, never floating; ≥48 px summary | `player-compose-why-open-*` |
| Stat / item / ability / bonus / threat / injury option rows, per-die allocation radios | ≥48 px full-width label rows; row actions wrap below the text | `player-compose-*`, `player-allocation-*` |
| Blood / item-use steppers | ≥48 px buttons, wrap at large text | sheet scenarios |

There is no custom menu, popover, tooltip, toast or drawer anywhere in the app.

## Limits (nothing hidden)

- **No staging playthrough.** The task asked for a real staging playthrough after source validation. Running *this build* against the staging backend needs the Firebase web API key, which is not in the repository (`docs/RUNBOOK.md` keeps it as `<staging-web-api-key>`); the one way to obtain it without credentials (reading it out of the deployed public bundle) was blocked by the session's permission classifier and was not pursued, and deploying is out of scope. The deployed staging site still serves the pre-reskin build. The local emulator playthrough (create → join → claim → table → declare → roll → allocate → resolve → pause → next scene, three isolated browser contexts) is the same flow `two-device-smoke.mjs` runs on staging. John (or a session with explicit approval) should run `two-device-smoke.mjs --reload` against a staging build of this branch.
- **iOS Safari on-screen keyboard** (visual viewport shrinks, layout viewport does not) could not be exercised: the Simulator cannot be tapped or typed into without a UI-test rig, and this lane did not build one. Real WebKit rendering of the sheet, option rows and landing page was captured (`safari-ios/`); the visual-viewport hook remains covered in jsdom (`SheetDialog.test.tsx`) and by pinch-zoom scenarios in Chrome. A physical iPhone pass is still owed.
- 200% text on a **320 px** phone is clean in the whole-page sweep after this pass; combinations beyond that (200% + WCAG 1.4.12 text-spacing overrides, 320 px) were not run.
- Chrome only for the browser audits; no Firefox, Android device, screen reader, or Windows machine. Forced colors was **emulated** (Chrome re-colours for real, but it is not Windows).
- Back-dismiss was verified with Chrome's `history.back()`; Safari's swipe-back gesture was not exercised.
