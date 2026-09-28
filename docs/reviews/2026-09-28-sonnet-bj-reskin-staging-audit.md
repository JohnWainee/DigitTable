# Independent reskin/mobile visual-viewport audit (branch `sonnet-bj/reskin-staging-audit-20260928`, 2026-09-28)

**Scope.** A fresh, isolated Sonnet session, starting from `factory/staging-harness-integration-20260928`
at `4ee3e69` (byte-identical to this branch's own base), was asked to independently re-audit every
player/GM/table/setup/join/recovery/action/allocation/disclosure/select/menu/modal/drawer/pop-out
control at phone (320/375/390/412), tablet, desktop, and table widths — including visual-viewport
resize, on-screen keyboard, safe-area, 200% text, and zoom — without merely repeating prior claims.

## Finding: a real, live regression — same defect class as five prior fixed-and-reviewed passes, but on a different, divergent branch lineage

`git diff 930e3f1..4ee3e69 -- apps/web/src/styles.css apps/web/src/shared apps/web/index.html` is
empty on this lineage too, so the shared pop-out primitives (`SheetDialog`, the six native
`<select>`s, the one `<details>` disclosure, `AllocationStepper`) carry no source change and were
independently re-read in full this session (portal mount, inert-sibling trap, reachability-aware
Tab cycling, visual-viewport sizing, root scroll lock, keyboard-reveal `scrollIntoView`, Arrow/Home/End
stepper keyboard support) — no defect found there.

Reading the two files the sourcebook-roster commit (`5e8907b`) touched
(`apps/web/src/player2/ChooseInjuryPanel2.tsx`, `apps/web/src/player2/ComposeStep2.tsx`) against the
reskin's own tap-target contract (the same check `docs/reviews/2026-09-24-sonnet-w-utility-item-tap-target-review.md`
first applied) found that both new utility-item action buttons — "Destroy Cowboy hat to ignore this
result" and "Mark and regain Blood" — were still `<button type="button" onClick={...}>` with **no
`className` at all**, at HEAD, on this branch. `.link-button` (the class every other inline action in
the app uses) already carries `min-height`/`min-width: var(--tap)` (48px) and `touch-action:
manipulation` in `apps/web/src/styles.css` (lines 381-388, 454-461) — these two buttons got none of
it, rendering under WCAG 2.5.8's 44px floor and the reskin's own 48px budget on a real phone. This is
the exact defect five prior independent reviews already found, fixed, and re-verified live
(`docs/reviews/2026-09-24-sonnet-w-utility-item-tap-target-review.md` through
`docs/reviews/2026-09-26-sonnet-am-smoke-evidence-and-reskin-review.md`).

**Root cause of the regression (branch lineage, not a code revert).** `git merge-base 4ee3e69
factory/today-integration` is `b599abd`: this task's base branch
(`factory/staging-harness-integration-20260928`, tip `4ee3e69`, identical to
`sonnet-bj/reskin-staging-audit-20260928`'s own base) diverged from `factory/today-integration`
**before** the fix (`5663d7f`, and its later refinement `0cb9ef1` on yet another lineage,
`sonnet-ax/reskin-final-audit-20260927`) ever landed there. `ChooseInjuryPanel2.tsx`'s commit history
on this branch stops at `5e8907b`; the fix commits exist only on sibling lineages this branch's own
history never merged. **The staging build actually deployed per `CLAUDE_HANDOFF.md` (commit `5e8907b`)
is on this same unfixed side of the split**, so this was a live, currently-deployed accessibility
defect, not a hypothetical one — even though the defect class had already been found, fixed, and
independently reviewed multiple times elsewhere. This is a branch-integration hygiene finding as much
as a code finding: with dozens of parallel review/fix branches outstanding (`sonnet-a*` through
`sonnet-b*`), a fix approved on one lineage does not automatically apply to a sibling lineage that
branched off earlier, or to whatever gets deployed from a lineage that never merged it.

## Fix (this branch, narrow — identical to the already-reviewed fix on two other lineages)

- `apps/web/src/player2/ChooseInjuryPanel2.tsx`, `apps/web/src/player2/ComposeStep2.tsx`: both
  buttons now carry `className="link-button"`.
- `apps/web/test/styles/reskinContract.test.ts`: ported the same regression test five prior reviews
  already approved elsewhere — `stepperControlsRanges()` (balanced-tag ranges for every
  `.stepper-controls` block, the one place a class-less `<button>` is legitimate) plus a new test,
  "never adds a `<button>` with no className outside `.stepper-controls`," scanning every `.tsx` file
  in `apps/web/src`. Mutation-verified this session: reverting either `className="link-button"`
  addition (test file untouched) makes the new test fail at exactly `ChooseInjuryPanel2.tsx:83` and
  `ComposeStep2.tsx:159`; restoring the fix makes all 43 tests in the file pass again, confirmed
  byte-identical to the pre-mutation diff afterward.
- No other file changed. `packages/*`, `templates/*`, `apps/functions`, rules, `styles.css`,
  `SheetDialog`, and every other previously-reviewed pop-out control are untouched (`git diff --stat`
  confirms exactly these three files).

## Gates run this session (fresh `npm install`, this worktree)

- `npm run check` — format (clean), lint (zero warnings), typecheck (clean, all 6 workspaces), and
  **701 tests passed | 11 todo** (72 files passed, 1 skipped; this branch's own pre-fix baseline,
  independently confirmed by temporarily stashing the change, is 700 passed | 11 todo — exactly +1
  for the new test, no other regression).
- `npm run build` — clean (`apps/functions` esbuild 216.6kb; `apps/web` vite build, 138 modules; the
  existing non-blocking >500kB chunk warning only).
- `git diff --check` — clean. `package-lock.json` churn from the local `npm install` was discarded,
  not committed.
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **not run standalone**: the
  default ports (8080/9099/9000) were held for this session's entire duration by a separate,
  long-running `firebase emulators:start` process rooted in a different worktree
  (`/private/tmp/digitable-sonnet-aj-reskin-hourly-20260926`, confirmed via `ps`/`lsof` — not a
  process this session started or has any authority to stop). This change touches only
  `apps/web/src/player2/**` and one `apps/web/test/**` file — no `packages/testing`, `apps/functions`,
  Firestore/RTDB rule, or other `apps/web` production file — so the last recorded 108/108 result for
  this exact lineage (`CLAUDE_HANDOFF.md`, the "Ninth independent review" entry, same `4ee3e69` base)
  stands unaffected.

## Independent review

A fresh, isolated Sonnet reviewer (no access to this session's reasoning) was dispatched to verify
the finding and fix from scratch. It independently: confirmed the pre-change buttons had no
`className` by reading `git show HEAD:...`; confirmed `.link-button`'s CSS gives correct tap-target
and visual treatment; independently re-scanned every `<button>` tag in `apps/web/src` with its own
script (not the new test's regex) and found no blind spot; independently re-verified the branch
divergence claim with its own `git merge-base`/`git log`/`git show` commands; **found a third
independently-reviewed lineage** carrying a byte-for-byte identical patch
(`0cb9ef1`, `sonnet-ax/reskin-final-audit-20260927`) that this session had not cited; ran its own
mutation test (revert fix → new test fails at the right two lines → restore → 43/43 pass, working
tree confirmed byte-identical to before); reproduced `npm run check` (701 passed | 11 todo) and
`npm run build` clean; confirmed `git diff --stat` touches only the three claimed files with no
privacy/projection/authorization-relevant code. **Verdict: approve, no blocking finding.** One
non-blocking note: `stepperControlsRanges()` only balances `<div>` tags, so a hypothetical future
`.stepper-controls` wrapper built from a non-`<div>` element would break its depth count — not a real
risk today (all three current usages are `<div>`), left as-is per the reviewer's own assessment.

## Live-browser evidence (partial; environment-limited, not app-limited)

A from-scratch, `VITE_FIREBASE_USE_EMULATOR=true` production build was served locally
(`vite preview` on `127.0.0.1:4199`) and pointed at the already-running shared local Firebase
emulator (the same concurrent session's ports noted above — a non-destructive sharing pattern this
repo's own review history already used, e.g. `docs/reviews/2026-09-26-sonnet-am-smoke-evidence-and-reskin-review.md`
Part A). Two `node scripts/playtest/ui-audit.mjs --no-shots` runs against it each reached **60
states, 318 controls audited, 0 control issues, 0 overflow states, 0 hard axe violations** before
timing out waiting for "player reveal," reproducibly at the same point both times. This is judged an
artifact of sharing a live Firebase emulator instance whose Functions/Firestore state was populated by
a *different* worktree's differently-versioned code (that worktree is not on this branch's roster
commit), not an application defect: the states that did complete found nothing, and the failure was
identical and deterministic across two independent runs rather than the transient single-run flake
prior reviews recorded from raw port contention. A full from-scratch local emulator instance was not
started, because doing so would require commandeering ports already owned by another live session —
explicitly out of scope for this task. This is a narrower live-browser proof than several prior
reviews obtained (which ran against emulators they started themselves); it is offered in addition to,
not instead of, the jsdom-level `apps/web` a11y suite (which does exercise both fixed buttons'
render tree, `npm run check`, above) and the direct source/CSS verification and independent review
above. Recommend a follow-up full live audit once the shared emulator ports are next free, purely as
belt-and-suspenders confirmation — no material risk is assessed to remain from this fix.

## Other categories audited, no defect found

- **Setup/join/recovery** (`apps/web/src/landing/JoinScreen.tsx`, the largest diff since `930e3f1` on
  this lineage): both join and recovery forms use `.primary-action`/`.secondary-action` buttons (tap-
  sized), proper `<label htmlFor>` associations, `autoCapitalize`/`pattern`/`autoComplete` on the
  relevant fields, `role="alert"` on errors, and a polite `LiveRegion` for async state — read in full,
  no defect.
- **Breakpoint coverage at 390/412px:** `apps/web/src/styles.css`'s narrowest `@media` boundary is
  `(min-width: 40.0625rem)` (641px) — there is no query between 320px and 641px, so 390px (iPhone
  12/13/14) and 412px (common Android) fall in the same unconditional mobile-first bucket already
  exercised at 320px and 375px by every existing pass. No CSS-breakpoint-specific divergence is
  expected at these widths; not independently re-verified live this session (see the live-evidence
  limitation above), so this is a reasoned judgment from the stylesheet's actual rule set, not a
  proof, and is offered as context rather than as new permanent test coverage (adding untested
  viewports to `ui-audit.mjs` without a live pass to confirm them would be speculative churn).
- **GM tools / scene director selects and disclosure:** confirmed 6 native `<select>`s
  (`GmToolsPanel.tsx` x4, `SceneDirector.tsx` x2) and 1 `<details>`/`<summary>` disclosure
  (`ComposeStep2.tsx`), matching every prior review's count; all covered by the existing
  `select, textarea`/`summary` tap-size CSS rules verified by `reskinContract.test.ts`, unchanged.
- **Observed but out of scope for this audit:** neither `ChooseInjuryPanel2.tsx`'s "Destroy Cowboy
  hat" button nor `ComposeStep2.tsx`'s "Mark and regain Blood" button has any dedicated behavioral
  test on this lineage (the "Eighth independent review: promoted utility-item regression coverage"
  test recorded in `CLAUDE_HANDOFF.md` also never made it onto this branch's history). This is a
  functional/behavioral coverage gap, not a viewport/accessibility one, so it is recorded here for
  John's awareness rather than fixed in this pass.

## Disposition

**Fixed, tested, and independently reviewed.** No other in-scope defect found. Merge, integration
with the other divergent lineages, and any deployment remain John's decision — see the branch-lineage
note above for why this same fix now needs to be checked for on every other unmerged branch that also
diverged from `factory/today-integration` before `b599abd`'s successors landed there.
