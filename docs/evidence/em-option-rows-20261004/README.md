# Option rows at large text, lane `sonnet-em` (2026-10-04)

Base `92c2b6e`. **Source change:** presentational only: markup wrappers and CSS in `apps/web`, tests, and one browser probe. Not merged,
not deployed. No Firebase project, cloud resource, authorization, privacy, projection, engine or template contract was touched, and staging
was not contacted. A preserved uncommitted attempt from another lane (`sonnet-ek`) was read once, read-only, for context; the design here
converged on the same mechanism (the constants are forced by the default px values), and every number below is this lane's own run.

**Provenance, stated plainly.** Commit `3942b1b` ("fix(web): contain option rows at large text") was committed, amended and pushed by a
Codex session working in this same worktree at 11:55-11:56 HST while the author session (this one) was still running, and it wrote
the first version of this README, the review record and the handoff entry from the evidence then available. It captured the author's
then-current working tree, so no work was lost; several of its statements were premature or inaccurate (see
`docs/reviews/2026-10-04-em-option-rows-independent-review.md`, pass C #6) and are corrected here. Commit `29444c3` and the commit
carrying this README are the author's.

## The defect, reproduced on the unmodified base

`ui-audit.mjs` on the `92c2b6e` bundle (`ui-audit-before.log`, `ui-audit-before-report.json`): 288 states, 3,336 controls, **6 failures, all
word breaks** in checkbox/radio option rows at 150-200% root text on 320-375px phones: `Phantasmagoria` (320px/150%, 320px/200%,
375px/200%), `Panzerfaust` and `submachine` (320px/200%, one character's compose screen), `Fragmentation` (320px/200%). Nothing else
failed (0 control, overflow, hard-axe, pixel-contrast failures; 8,440 contrast boxes measured, 319 insufficient to judge, 5 pages scored on
truncated slices). Root cause is arithmetic: the option row's text column is ~209px at 375px/200% and ~196px at 320px/200% while the
longest word needs ~223px, and the row's `overflow-wrap: anywhere` then cuts the word wherever it runs out. The same cuts reproduce in real
Mobile Safari (below).

## The fix

1. **Stack the label under its box when its longest word cannot sit beside it.** The text of every check/radio label (14 rows, 6 files) is
   wrapped in `<span className="option-text">`. `.gear-option` is `flex-wrap: wrap`; `.option-text` is `flex: 1 1 min-content` (with a
   `flex: 1 1 0%` declaration ahead of it for an engine that rejects the keyword), `min-width: 0; max-width: 100%;
   overflow-wrap: break-word`. A flex line breaks on an item's hypothetical size, and the flex _basis_ here is the longest word, so the text
   stays beside the box while that word fits and otherwise takes its own line under the box: no breakpoint, no guessed text-size
   threshold, and a row that fits never changes. `break-word` (not the row's `anywhere`, which shrinks min-content to one letter) keeps the
   basis at the longest word. The zero minimum plus `max-width: 100%` is the last resort: a word wider than a whole stacked line breaks
   _inside_ its row, never past it (a `min-width: min-content` would win over `max-width` and overflow).
2. **Give the side padding back as text grows, only where option rows are.** Stacking alone left five failures at 320px/200% (stacked
   column 196px, `Phantasmagoria` 223px). `--gutter-sm-fit` / `--gutter-xs-fit` = `clamp(4px, calc(27.2px - 0.85rem), min(0.85rem,
   13.6px))` (and 20.8 / 0.65 / 10.4) now give the side padding of `fieldset:has(.gear-option)` and of the option row itself (plus the
   utility item's button margin, so it stays under its label); the GM pending-action card keeps its tighter px values (23.6 / 18.4) in its
   own, more specific `:has` rule. Each is exactly the old value at and below the default 16px root. Above it they ease linearly, and reach
   the 4px floor at about 170% text (fieldset sides), 162% (row), 144% / 138% (GM card). Between 100% and the floor those paddings are in
   motion by design, so "nothing changes" is true at the default size, not at 106-170%. Other fieldsets (landing forms, GM director,
   the correction sheet's non-row groups) are untouched, so at large text a neighbouring fieldset can have wider padding than one that
   holds option rows (accepted).

Unchanged: the 48px row height (`min-height: var(--tap)`), the whole row is the label and the tap target, the `:has(:checked)` highlight,
focus ring, disabled style, box and mark sizes, accessible names (the span is inside the `<label>`), keyboard behaviour, the control-first
order. The GM "Reveal" row (a `div.gear-option` with its own span and button) keeps its structure; its side padding eases with the rest
because it shares `.gear-option` (it already wrapped its button at the default size, unchanged).

## Evidence (final code, this worktree; private stack on remapped ports, peers untouched)

Private stack: Firebase emulators on 41xxx (auth 41099, Firestore 41080, RTDB 41000, Functions 41001, hub 41400) and Vite previews 41173
(base bundle) / 41174 (candidate), a bundle built with `VITE_FIREBASE_USE_EMULATOR=true` and a throwaway Vite config that swapped only the
three port numbers in `emulatorConfig.ts` (not committed). The emulator suite used an APFS clone with ports 43xxx. Every Chrome run used its
own debug port. No peer process was touched; a stuck Chrome belonging to another lane's probe was left alone.

| Check | Before (base `92c2b6e`) | After (final code) |
| --- | --- | --- |
| `ui-audit.mjs`: 288 states, phone 320/375/390/412, phone landscape, tablet 768, desktop 1280, table 1920x1080, plus 150% and 200% text on every page state (`ui-audit-*.log`, `-report.json`) | 3,336 controls, **6 failures** (the word breaks above) | 3,192 controls, **0 failures** |
| control size (>= 44px) / inside the viewport / 16px type, horizontal overflow (incl. 256 text-scale states) | 0 / 0 | 0 / 0 |
| axe (WCAG 2.x A/AA + best-practice) hard violations | 0 (one existing best-practice note on the nonexistent-room route) | 0 (same note) |
| pixel-sampled contrast | 0 failures in 8,440 boxes (319 insufficient to judge; 5 pages on truncated slices) | 0 failures in 8,299 boxes (314 insufficient; 5 truncated pages) |
| keyboard-focus / dock-focus checks, pinch scenarios, validation scenarios, sheet cases | 87 / 385 / 4 / 8 / 23 | 87 / 187 / 4 / 8 / 23 |
| three-role smoke, `two-device-smoke.mjs --reload` (`smoke.log`, `smoke-report.json`) | not run | **17/17 steps, ALL STEPS PASSED**, 375/768/1024/1280/1920px overflow sweep clean |
| option-row stress probe (`option-row-stress-*.txt/json`): 30 width x text-scale frames (240-768px, 100-300%), 26 rows each (stat + icon, items, utility item + button, abilities, landing row, GM card, Reveal row) | 454 failures, 433 words cut beside their box: **negative control OK** | **0 failures**; 147 cut words outside the supported range (below 320px or above 200%), all inside their row, none overflowing |

Control counts differ between runs because a random roll decides how many dice (and so allocation controls) exist: 3,192 to 3,336
across this lane's four audits (base 3,336; two on intermediate candidates 3,320; final 3,192). The audit on the intermediate bundle `f119d28` (before the last test and CSS-fallback edits; its logs are not kept in the repo) also
passed: 288 states, 3,320 controls, 0 failures, with the smoke passing.

**Supported range and its thin margin.** The probe gates "no cut word" at <= 200% text on >= 320px. At 320px/200% the stacked text column
is 228px (player rows) / 232px (GM card) and the widest roster word, `Phantasmagoria`, needs 223px in this machine's `system-ui`: 5px of
headroom. A wider fallback font can still cut it (inside the row, never overflowing). At 250-300% on 320-375px a 13-14 letter name is wider
than a whole row and breaks inside it: the remaining physical limit of this layout.

### The default-size layout is unchanged

- **Controlled like-for-like** (`like-for-like-default-size.*`): identical markup rendered with the base stylesheet (bare label text) and the
  final stylesheet (the same text in `.option-text`) at 100% text and nine widths from 320 to 1920px: the allocation die fieldsets, compose
  rows, stat rows with icons, a utility item with its button, the landing "written down" row, the GM card rows and the Reveal row.
  **1,089 element boxes, 0 differ** (1 px tolerance). Negative control: with `--gutter-sm-fit` given the xs numbers (a plausible slip),
  **702 differ** (`like-for-like-negative-control.txt`).
- **Whole-app layout fingerprint** (`ui-audit.mjs --layout-dump`, `layout-normalized-diff.txt`): the new span is removed from the candidate
  dump (and each label's own-text hash blanked) because `scripts/playtest/layout-diff.mjs` skips states whose DOM differs, then every box is
  compared. 272 state/viewport pairs, 21,856 element boxes, **no element changed size**. The only moved boxes are the sticky action dock
  (the pinned `section > div` and its children) and the zero-size icon sprite: their recorded top depends on the scroll position at dump
  time, and the identical elements move between two runs of the *same* base bundle (`layout-base-vs-base2-noise-control.txt`, 8 states).
  The 16 remaining pairs (the two allocation states at 8 viewports) are not comparable because the random roll produced 87 vs 89 elements;
  the like-for-like check above covers those rows. The strict repo tool, run as-is, still exits 1 (`layout-diff-raw.txt`): 24 pairs are the
  8-9 element "not found" error pages it refuses as too small, and the states with the new span count as a DOM change.
  `layout-normalized-diff.mjs.txt` is the ad-hoc script used (a record, not repo tooling).

### Real Mobile Safari (iOS Simulator, iPhone 17 Pro, iOS 26.5; not a physical device)

- **The rows themselves** (`shots/safari/`): the real stylesheet and option-row markup, in a 320px and a 375px frame at 200% root text.
  Base: `Phantasma/goria (1 Blood)`, `Panzerfaus/t`, `Phantasmagori/a` are cut. Final: `Phantasmagoria` whole, stacked under its box;
  `Panzerfaust` whole beside its box; no horizontal overflow. (The base 320px capture also shows an iOS "Ready for Apple Intelligence"
  system banner, unrelated.)
- **The real app** (`scripts/playtest/ios-simulator/run.sh`, the `SafariFlowUITests` against the candidate on the private stack, a dedicated
  Simulator device so no peer's was used): **3 of 3 tests passed** (`ios-safari-app-tests.txt`): the signed-out join form validation with the software keyboard up, the GM correction sheet with the keyboard and the native picker, and the signed-in player flow (compose, the sticky dock, rotation to landscape with Safari's bars showing, the GM pending card). Screenshots in `shots/safari-app/` (default text size: rows beside their boxes, the dock pinned). These tests do not set a large text size, so the large-text claim rests on the row captures above and the Chrome audit, not on this run.

### Gates

| Gate | Result |
| --- | --- |
| `npm run check` (`check.log`) | Prettier clean; ESLint 0 errors, 1 existing warning (`auditHarnessContract.test.ts:395`, from `30fd95a`, an ancestor of the base); typecheck clean; **852 passed**, 11 todo (82 files passed, 1 skipped); base 829 |
| `npm run build` (`build.log`) | exit 0 (the existing Vite chunk-size warning) |
| Emulator suites (`emulator-suite.log`) | **18 rules/testing + 86 Functions + 4 web passed**, exit 0, from an APFS clone of the final tree with every emulator port remapped to 43xxx (see Disclosed for the first, mis-remapped run) |

### Disclosed

- **A rig error of mine, first emulator run** (`emulator-suite-run1-misremapped-summary.txt`): my port remap of the APFS clone missed one line
  (`apps/web/test-emulator/session.test.ts`, `firestore: { ..., port: 8080 }`), so that web test's Firestore *client* talked to the default
  port, which a peer lane's emulator holds. It failed 2 of 4 web tests (18 + 86 passed). The Functions/auth/Firestore writes in that run went
  to my own 43xxx emulators; the stray traffic was the test client's reads/listeners against the peer's port (that client only reads and
  listens). Fixed in the clone and rerun in full; the rerun is the recorded result, the failed run is not counted as a pass.
- **Control counts** differ across runs (random roll), explained above; the allocation panel was never compared on an identical roll in the
  whole-app fingerprint, hence the controlled like-for-like check.
- Temp directories: the first version of the probe never ended headless Chrome and left ~80 MB per run in `$TMPDIR`. Fixed (see the review
  record). The 40 `option-row-stress-*` directories under `$TMPDIR` that this session's probe runs (and its reviewers') left behind, about 3.3 GB, were removed after being identified by the probe's own page content; 23 other `option-row-stress-*` directories (19 from before this session, 4 newer ones not attributable to it) were left alone, as was another lane's stuck Chrome.

## Not covered (still open)

Physical iOS/Android hardware, real keyboards and browser-chrome collapse, a native `<select>` popup (OS-owned), screen readers,
Windows High Contrast, Firefox, a real TV. Real Safari was exercised in the Simulator only. Staging was not re-run: this branch is
unmerged and undeployed, so the deployed build (`9ee8aa5`, pre-reskin) is not evidence for it.

## Files here

`ui-audit-{before,after}.log` and `-report.json`; `smoke.log`, `smoke-report.json`; `option-row-stress-{base,final}.{txt,json}`;
`like-for-like-*`; `layout-*`; `check.log`, `build.log`; `emulator-suite.log`, `emulator-suite-run1-misremapped-summary.txt`; `shots/before`,
`shots/after` (full-page captures at phone 320/375, tablet 768, desktop 1280 and table 1920x1080, plus 150%/200% text), `shots/crops`
(the 320px/200% abilities region, before and after), `shots/safari` (real Mobile Safari). The full 288-state capture sets (~100 MB each) are
not committed.
