# Seventh independent mobile pop-out re-audit, plus a real harness regression found and fixed (2026-09-28)

- **Branch:** `sonnet-bk/reskin-uiux-orchestrated-20260928`, based on `d0dac74`.
- **Scope of the ask:** re-audit the ink-black punk reskin and every GM/player/table mobile
  pop-out control (select/menu/disclosure/modal/drawer/option-list/allocation/action control) at
  phone (320/375px), landscape, tablet, desktop, and table widths — visual-viewport keyboard
  behavior, safe areas, zoom/text scaling, internal scrolling, focus containment, 44px targets, no
  forced zoom or horizontal overflow, responsive bottom-sheet/full-width mobile patterns — while
  preserving GM/player/table functional flows, authorization/privacy/projection isolation,
  semantics, contrast, keyboard/touch support, reduced motion, and responsiveness. Implement a
  reskin change only where a real gap remains; otherwise record a rigorous audit and do not create
  cosmetic churn.

## Part A: confirming the reskin and pop-out system's actual state (not just citing prior reviews)

Before trusting `CLAUDE_HANDOFF.md`'s extensive prior-review history (seven named independent
passes between 2026-09-18 and 2026-09-26, all "no defect found"), this session independently
re-derived the same conclusion from the code itself:

- `git diff 930e3f1..d0dac74 -- apps/web/src/styles.css apps/web/src/shared apps/web/index.html`
  is empty on this branch too — the pop-out system (`SheetDialog`, six native `<select>`s, one
  `<details>` disclosure, the `AllocationStepper` spinbutton) has had no source change since the
  reskin's own fully-reviewed baseline.
- Read `apps/web/src/styles.css`'s token layer directly: `--ink-0: #050506` through `--ink-3:
  #20202a` (near-black surface scale), `--paper: #f3ecda` (body text), and the punk accent set
  `--acid: #ffe600`, `--riot: #ff3348`/`--riot-deep: #c8102e`, `--cyan: #22e6ff`, `--pink:
  #ff3fae` — each documented in the file's own comments as meeting >= 4.6:1 contrast against
  `--ink-2` (or >= 5.6:1 as a fill with `--ink-0` text). A procedural SVG `feTurbulence` grain
  layer (`--grain`) plus a dot-halftone gradient (`--halftone`) are composited into the page
  background; panels use hard, offset `box-shadow`s (e.g. `6px 6px 0 var(--riot-deep)`) and a
  separate `--font-display` for headings with an offset `text-shadow`. This substantively is the
  ink-black/punk-palette/print-texture/bold-hierarchy visual language the task asked for — already
  shipped, not merely described.
- Read `apps/web/src/shared/SheetDialog.tsx` in full: portal-mounted, snapshots and `inert`s every
  other `<body>` child on mount, sizes itself from the *visual* viewport
  (`useVisualViewportBox`), locks root scroll with a reference count for stacked sheets, moves
  focus to its heading on open and returns it to the trigger on close, traps Tab/Shift+Tab to only
  *reachable* focusable descendants (excluding collapsed `<details>` content, disabled fieldsets
  except their own first legend, non-checked radios in a group, and anything `inert`), and
  re-scrolls a focused text control into view when the visual viewport resizes (the on-screen
  keyboard case). This is the one modal pattern in the app; it already implements everything the
  task's mobile-pop-out mandate asks for.
- `apps/web/src` files that changed since `930e3f1` (`git diff 930e3f1..d0dac74 --stat -- apps/web`)
  are limited to the sourcebook-roster fix, the utility-item tap-target fix (already reviewed:
  `docs/reviews/2026-09-24-sonnet-w-utility-item-tap-target-review.md`), and the seat-recovery UI
  added to `JoinScreen.tsx`. Read `JoinScreen.tsx`'s recovery-mode diff directly: every new control
  reuses existing, already tap-target-covered classes (`primary-action`, `secondary-action`,
  `session-form`, `form-field`, `error-message`, `reveal-card`) and introduces no new pop-out-shaped
  markup (`select`/`details`/`dialog`/`sheet`/`popover`/`menu`) and no class-less `<button>`.

**Conclusion for Part A: no new visual or pop-out defect.** The reskin and the pop-out system are
genuinely, substantively present as designed, and nothing in the code delta since the last full
review introduces a new gap. This agrees with all seven prior independent passes — but this time
from first-hand reading of the CSS, the component, and the diff, not from citing their prose.

## Part B: a real defect found in the audit harness itself, not the app

`CLAUDE_HANDOFF.md` asserts (under "Independent audit: reskin mobile pop-out defect," 2026-09-24)
that `scripts/playtest/ui-audit.mjs`'s GM-correction-sheet trigger was made "roster-agnostic" after
the sourcebook roster replaced the visible name "Rook" with "Iryna" (keeping the internal id
`rook`), in a change reviewed at `docs/reviews/2026-09-25-sonnet-w-ui-audit-roster-selector-review.md`.

That claim is **false for this branch.** `scripts/playtest/ui-audit.mjs`'s `openCorrection()`
still read:

```js
const finder = `[...document.querySelectorAll(".roster-panel-list li")].find(li => /^rook/i.test(li.textContent.trim()))?.querySelector("button")`;
```

— a selector against the roster row's *visible text*, which is "Iryna…", never "Rook…"
(`templates/eat-the-reich/src/roster.ts:63-64`: `id: "rook"`, `name: "Iryna"`). `git log --oneline
-- scripts/playtest/ui-audit.mjs` on this branch shows exactly four commits, none of them the
roster-agnostic fix. The commit the prior review cites, `c77cd94`, does exist in the shared `.git`
object store (worktrees of one repository share objects, and dozens of other `sonnet-*` worktree
branches contain it — corrected from this session's first pass, which mis-stated that
`git cat-file -t c77cd94` returned nothing), but `git merge-base --is-ancestor c77cd94 HEAD`
confirms it is **not an ancestor of this branch's `HEAD`** — it was never merged into this branch's
`main`/`factory/today-integration` lineage. This project has dozens of concurrently-run `sonnet-*`
worktrees for this same reskin/audit task (`git worktree list` on 2026-09-28 shows over twenty),
and the fix's history was carried forward in `CLAUDE_HANDOFF.md`'s prose across several of them
without the underlying commit ever actually reaching this branch. (The independent reviewer also
compared `c77cd94`'s actual fix — a case-insensitive `/^correct$/i` regex — against this session's
independently-written fix below and confirmed they are functionally equivalent, not a cherry-pick.)

**Reproduced live, not just by inspection.** Built `apps/web` in emulator mode
(`VITE_FIREBASE_USE_EMULATOR=true`, fake `demo-digitable` config, matching
`scripts/playtest/lan-up.sh`), served it via `vite preview` on `localhost:4199`, and ran it against
a separate, already-running local `demo-digitable` Auth/Firestore/Database/Functions emulator
stack (confirmed via `lsof`/`ps` to belong to a different, long-running, unrelated worktree
process — not started, not disturbed, and not stopped by this session, matching the
non-destructive shared-emulator pattern several prior reviews in this history already used and
documented). Before the fix:

```
FAIL flow: [gm] timed out waiting for: Rook's Correct button
{ "states": 108, "controlsAudited": 1020, "controlIssues": 0, "overflowStates": 0,
  "axeHardViolations": 0, "failures": 1 }
UI AUDIT FOUND PROBLEMS
```

The audit silently stopped at 108 of its 150 intended states — every scenario downstream of
opening the GM correction sheet (the one true modal/bottom-sheet in the app) was never exercised
by this run, and the script correctly reported failure rather than a false pass.

## Fix

`scripts/playtest/ui-audit.mjs`'s `openCorrection()`:

```js
const finder = `[...document.querySelectorAll(".roster-panel-list button")].find(b => b.textContent.trim() === "Correct" && !b.disabled)`;
await waitFor(gm, finder, 20000, "a roster row's Correct button");
```

Matches `apps/web/src/gm2/RosterPanel.tsx`'s actual markup: each roster `<li>` renders exactly one
always-enabled `<button>Correct</button>`. No other control in `apps/web/src` uses the exact text
"Correct" as a button label, so the selector cannot collide with an unrelated control.

**Regression coverage added:** `scripts/playtest/test/uiAuditRosterSelector.test.mjs`, a static
source-scan test in the existing `scripts/playtest` Vitest project (registered in the root
`vitest.config.ts`), asserting the file never again matches `/rook/i` and that the finder targets
`.roster-panel-list button` by exact text `"Correct"` and `!b.disabled` rather than any name or
list position. Mutation-verified: reverting to a Rook-name-based selector made both new assertions
fail; restoring the fix makes them pass again.

## Verification (this session, fresh)

- `npm run check` — format/lint (zero warnings)/typecheck clean; **702 tests passed | 11 todo**
  (74 files, 1 skipped; baseline 700 + 2 new).
- `npm run build` — clean (existing non-blocking >500 kB chunk warning only).
- `git diff --check` — clean. `package-lock.json` churn from this session's fresh `npm install`
  was discarded, not committed (the repository had no `node_modules` at all when this session
  started).
- **Live evidence, after the fix, against the same shared local `demo-digitable` emulator stack:**
  `node scripts/playtest/ui-audit.mjs --base http://localhost:4199 --no-shots`:
  ```
  { "states": 150, "controlsAudited": 1434, "controlIssues": 0, "overflowStates": 0,
    "axeHardViolations": 0, "failures": 0 }
  UI AUDIT PASSED
  ```
  covering exactly the required phone-small(320)/phone(375)/phone-landscape/tablet(768)/desktop(1280)/
  table(1920) matrix plus dynamic-viewport-keyboard, pinch-zoom, safe-area, and 150%/200%
  text-scaling scenarios (read directly from the script's `VIEWPORTS` list and scenario bodies).
  Only the same two already-documented, non-gating notes every prior review recorded appear
  (the 320px+200%-text geometry extreme; the intentional nonexistent-room route's best-practice
  heading nit) — no new finding.
- `node scripts/playtest/two-device-smoke.mjs --reload --no-images` (hardened for genuine
  console/network failures per `docs/reviews/2026-09-26-sonnet-am-smoke-evidence-and-reskin-review.md`):
  **17/17 steps passed**, zero device console errors or failed requests, no horizontal overflow at
  375/768/1024/1280/1920px.
- `npm run test:emulator` was not rerun standalone: the default emulator ports were held the
  entire session by a separate, long-running, unrelated local worktree process (confirmed via
  `ps`/`lsof`, not started or disturbed by this session — the same class of legitimate concurrent
  contention several prior reviews in this history already recorded). This change touches only
  `scripts/playtest/**` — no file in `packages/testing`, `apps/functions`, `apps/web` production
  source, or the Firestore/RTDB rules changed, so the last recorded 108/108 emulator result is
  unaffected and stands.
- Background `vite preview`/build artifacts from this session's live-evidence generation were
  stopped/discarded afterward; nothing from the emulator-mode build was committed.

## Independent review

A fresh, isolated reviewer agent with no access to this session's reasoning verified every claim
above from scratch, not by trusting this session's narrative: grepped the whole app for the literal
text "Correct" and confirmed the only `<button>` with that exact text anywhere in `apps/web/src` is
`RosterPanel.tsx`'s roster-row button (the only other hit, `CorrectionDialog.tsx`'s dialog `title`
string, becomes an `<h2>`, not a button, and sits outside `.roster-panel-list` anyway) — so the
selector cannot collide with an unrelated control. Independently re-read `RosterPanel.tsx` and
confirmed the markup assumptions. Independently mutation-tested the new regression test by editing
the live file back to the Rook-name selector, confirmed both assertions fail, restored the file
(byte-diffed clean), confirmed both pass again. Confirmed the diff scope is exactly
`scripts/playtest/ui-audit.mjs` (5 insertions, 2 deletions) plus the new test file, nothing else.
Independently reran `npm run check` (702 passed | 11 todo, matching) and `npm run build` (clean,
matching). Independently built the app in emulator mode, served it via a separate `vite preview`
port, and reran both `ui-audit.mjs` (**150 states, 0 control issues, 0 overflow, 0 axe violations,
0 failures — PASSED**) and `two-device-smoke.mjs` (**17/17 PASSED**) against the same
already-running, untouched shared emulator — without disturbing it and cleaning up its own preview
process afterward.

**Verdict: PASS.** Two minor discrepancies were found and both are corrected in this document: the
`git cat-file`/ancestor-check wording above, and the exact `controlsAudited` count (this session's
run: 1,434; the reviewer's independent rerun: 1,530 — both zero-issue, zero-failure passes; the
difference is plausibly session/room state accumulated on the shared emulator across repeated
runs, not a defect, and does not change the pass/fail outcome). The reviewer also confirmed the
fix's scope is exactly the test-harness files claimed, touching none of the pure-function,
platform-authorization, or projection-isolation surfaces `AGENTS.md`'s engineering invariants
govern.

## Disposition

**Real, narrowly-scoped defect found, fixed, and independently confirmed.** A documented fix from
an unrelated, never-integrated worktree was absent from this branch, silently truncating the
GM-correction-sheet audit coverage by roughly a third of its states. No production application
code, Firestore/RTDB rules, engine, template, or Functions file changed; no merge, deploy, resource
creation, or promotion occurred. The reskin itself (palette, texture, hierarchy, pop-out system)
required no change — this is the "no defensible source delta for the reskin itself, but a real
harness gap" outcome, not cosmetic churn. Physical-device evidence (real iOS/Android hardware, real
Safari visual-viewport keyboard behavior) remains the one open item for John, unchanged by this
pass.
