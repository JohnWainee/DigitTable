# Eighth independent mobile pop-out re-audit: class-less utility-item buttons re-fixed after parallel-worktree fix loss (branch `sonnet-bk/reskin-uiux-orchestrated-20260928`, 2026-09-28)

- **Branch:** `sonnet-bk/reskin-uiux-orchestrated-20260928`, continuing from this branch's own prior
  entry, [`docs/reviews/2026-09-28-sonnet-bk-uiux-orchestrated-audit.md`](2026-09-28-sonnet-bk-uiux-orchestrated-audit.md)
  (base `d0dac74`, HEAD `56797e7` at the time that entry was written).
- **Scope of the ask:** a fresh, evidence-led continuation of the same standing mandate — audit the
  ink-black punk reskin and every GM/player/table mobile pop-out control (select/menu/disclosure/
  modal/drawer/option-list/allocation/action control) at phone (320/375/390px), tablet, desktop, and
  table widths, with dynamic viewport/keyboard/zoom/safe-area handling, >=44px targets, and no
  horizontal overflow, while preserving functional semantics, authorization/privacy/projection
  isolation, WCAG AA, and responsiveness; implement a change only where a real gap remains.

## Part A: independent re-confirmation of the reskin and pop-out system (first-hand, not cited)

Before this session found the finding below, it independently re-derived — by reading source, not by
citing this branch's own prior "no defect found" conclusion — that the ink-black punk visual language
and the pop-out control system are genuinely, substantively implemented:

- Read `apps/web/src/styles.css` in full: the `--ink-0`..`--ink-3` near-black surface scale, the
  `--acid`/`--riot`/`--riot-deep`/`--cyan`/`--pink`/`--volt` punk accents (each with a documented
  contrast target, mechanically checked — see below), the procedural SVG `feTurbulence` grain plus
  halftone dot overlay, hard-offset "misregistered" panel shadows, condensed uppercase display type,
  and the full `.sheet`/`.sheet-backdrop` visual-viewport-aware pop-out rules (safe-area insets on
  both the narrow and the >=641px breakpoint, `dvh`-behind-`@supports` with a `vh` fallback,
  `touch-action: auto` on the backdrop with an explicit WCAG-1.4.4 rationale in the comment,
  `prefers-reduced-motion` gating both ways).
- Read `apps/web/src/shared/SheetDialog.tsx` and `useVisualViewportBox.ts` in full: portal-mounted,
  inerts every other `<body>` child, sizes itself from the *visual* viewport, locks root scroll with a
  reference count, traps Tab/Shift+Tab to only *reachable* focusable descendants (collapsed `<details>`
  content, disabled fieldsets, unchecked radios in a group, and `inert` subtrees are all correctly
  excluded), and re-scrolls a focused text control into view when the visual viewport resizes.
- Read every component that renders a `<select>`, `<details>`, radio/checkbox row, or the allocation
  stepper (`SceneDirector.tsx`, `GmToolsPanel.tsx`, `ComposeStep2.tsx`, `ChooseInjuryPanel2.tsx`,
  `AllocationPanel2.tsx`, `PendingActionsPanel.tsx`, `CorrectionDialog.tsx`, `AllocationStepper.tsx`,
  `JoinScreen.tsx`'s new recovery mode). Independently re-ran the pop-out source inventory
  (`grep -rnE '<select|<details|<dialog|role="dialog|menu|listbox|tooltip"|popover|aria-haspopup|position:\s*fixed|position:\s*absolute'`)
  and got exactly the same six `<select>`s, one `<details>`, and one `role="dialog"` this branch's
  prior audit and the original `sonnet-d` reskin evidence both found — no new or hidden pop-out
  pattern exists anywhere in `apps/web/src`.
- Read `apps/web/test/styles/reskinContract.test.ts`: a genuinely mechanical static contract (not a
  snapshot) that parses the real stylesheet rules and asserts on concrete properties — tap sizes,
  safe-area insets at both breakpoints, `dvh`/`vh` fallback ordering, `touch-action` never `none`/
  `pinch-zoom`, no viewport-zoom-lock meta tags, WCAG contrast ratios computed from the actual hex
  token values, reduced-motion gating, and licensing hygiene (system fonts only, no external
  resources). This is a regression backstop for exactly the defect class this task cares about, at
  the CSS-authoring level, independent of any live browser run.

**Conclusion for Part A: confirmed, first-hand.** This agrees with all seven prior independent passes
recorded in `CLAUDE_HANDOFF.md`, but from this session's own reading of the CSS, the components, and a
fresh grep — not from citing their prose.

## Part B: a real, previously-fixed-elsewhere defect this branch had lost — found, re-fixed, independently reviewed, independently re-verified

### The finding

`CLAUDE_HANDOFF.md` (`## Independent audit: reskin mobile pop-out defect`, `sonnet-w/reskin-audit-20260925`,
2026-09-24) documents that commit `5e8907b` shipped two `<button type="button" onClick={...}>` elements
with **no `className` at all** — "Destroy Cowboy hat to ignore this result"
(`apps/web/src/player2/ChooseInjuryPanel2.tsx`) and "Mark and regain Blood"
(`apps/web/src/player2/ComposeStep2.tsx`), the utility-item action controls in the injury-choice and
compose-action flows. Every other button in the app is `.primary-action`/`.secondary-action`/
`.link-button`, or one of the documented class-less `.stepper-controls` +/- buttons sized via a
descendant selector — all of which resolve to `min-height`/`min-width: var(--tap)` (48px). These two
did not: a bare `button { font: inherit; }` was their only rule, so on a real phone they rendered at
native intrinsic size — under the 44px WCAG 2.5.8 target and under the reskin's own 48px `--tap`
budget. `reskinContract.test.ts`'s original button-coverage test had a blind spot that let this
through silently: its regex only inspected buttons that *already had* a `className` attribute, so a
wholly class-less button outside `.stepper-controls` was invisible to it.

That defect was fixed once already, on 2026-09-24, as commit `5663d7f` ("fix(web): give the two new
utility-item action buttons the reskin's tap-target rule"), independently reviewed
(`docs/reviews/2026-09-24-sonnet-w-utility-item-tap-target-review.md`), and re-confirmed present at
merge commit `d5f9bce` across **four further** independent passes recorded in `CLAUDE_HANDOFF.md`
between 2026-09-25 and 2026-09-26.

**That fix was never on this branch.** This session verified directly:

```
$ git rev-parse HEAD
56797e7f208d1eaedf55f98abdc2ac811b7337e8
$ git merge-base --is-ancestor 5663d7f HEAD; echo $?
1
$ git merge-base --is-ancestor d5f9bce HEAD; echo $?
1
```

Neither commit is an ancestor of this branch's `HEAD`. `git branch -a --contains 5663d7f` lists roughly
two dozen sibling `sonnet-*`/`factory/*` branches that do carry it — but not this one. This branch
shares ancestor `b599abd` with that fix lineage, then diverged onto its own commits
(`94a30b2` → `4ee3e69` → `d0dac74` → `56797e7`) that never merged the fix back. `CLAUDE_HANDOFF.md`'s
extensive, confidently-worded "already fixed, independently re-reviewed four times" narrative is true
of *other* branches sharing this repository's object store — not of this one. This is a concrete,
verified instance of the pattern already on record in this operator's standing notes about this
project: handoff prose can assert a fix is integrated when the underlying commit never actually
reached the branch being worked. Both this session's own prior entry
(`docs/reviews/2026-09-28-sonnet-bk-uiux-orchestrated-audit.md`) and every one of the four "re-confirmation"
passes cited above read the *code* at their own branch tip and were correct about *that* tip; none of
them re-checked ancestry against `sonnet-bk` specifically, so the gap persisted silently until this
pass diffed and merge-based against this exact `HEAD`.

### Provenance of the change in this worktree

This session found the fix already re-applied, uncommitted, in this shared worktree — `git status`
showed `apps/web/src/player2/ChooseInjuryPanel2.tsx` and `ComposeStep2.tsx` modified,
`apps/web/test/styles/reskinContract.test.ts` modified, and two new untracked test files — before this
session had made any source edit itself. A separate agent in this same background job independently
reviewed that change and reported approval. This session did not accept either the diff's presence or
the review's verdict at face value; every load-bearing claim below was re-derived independently in
this session, from the actual files, before this session chose to keep and commit the change:

- **Diff, read directly (`git diff`):** exactly `className="link-button"` added to both bare buttons,
  nothing else in either component.
- **`reskinContract.test.ts`, read directly:** the button-coverage test is rewritten with a brace-aware
  tag matcher (`<button\b(?:[^>{]|\{[^}]*\})*>`, treating each `{...}` JSX expression as one atomic
  unit so an embedded `>=`/`=>` inside `disabled={value >= max}` or `onClick={() => ...}` can never be
  mistaken for the tag's own closing `>`) plus a check that any button with *no* `className` at all
  sits within 1000 characters of `stepper-controls` in its source file — otherwise it fails. This
  directly closes the blind spot described above.
- **Dispatch wiring, independently re-greped in `PlayerDashboardScreen.tsx`:** both `onUseHat` and
  `onUseUtilityItem` route to `handleUseUtilityItem`, which dispatches a real
  `{ type: "UseUtilityItem", characterId, itemId, rollId }` command — not dead code.
- **Roster data, independently re-checked in `templates/eat-the-reich/src/roster.ts`:** Orsolya carries
  item `orsolya-draft-horse` "Cowboy hat" with `useEffect: { kind: "ignoreInjuryOrDownedAndDestroy" }`;
  Iryna (internal id `rook`) carries `rook-pocket-mirror` "Cigarettes..." with
  `useEffect: { kind: "gainBlood", amount: 2 }` — exactly the items that surface these two buttons in
  real play.
- **`.link-button` fit, independently re-greped:** before this diff, `.link-button` existed only in
  `styles.css` (its definition, its inclusion in the 48px tap-target rule, and its underlined-inline
  styling) with zero `.tsx` usages anywhere in `apps/web/src` — it was CSS defined but dead in markup.
  It is the correct minimal fit here: an underlined inline action inside a checkbox/label row, sharing
  the same 48px `--tap` sizing as every other interactive control, without the visual weight of
  `.primary-action`.
- **New tests, read in full:**
  `apps/web/test/player2/ChooseInjuryPanel2.test.tsx` (4 tests: renders `link-button`-classed; calls
  `onUseHat` with the correct item id on click; does not render once uses are exhausted; does not
  render when the caller passes no handler) and
  `apps/web/test/player2/ComposeStep2.test.tsx` (2 tests: renders `link-button`-classed; a real click
  through a full `createSessionAsGm` → `loadOpeningSceneAsGm` → `joinAsPlayer` → `claimRook` session
  flow decrements Cigarettes' remaining uses from 3 to 2 without checking its pool-selection checkbox).
  Both assert real rendered/behavioural outcomes, not tautologies, and both follow this codebase's
  established test conventions (direct-render for a component needing only a minimal fixture;
  `support/flows.ts` session helpers for one needing a real `ViewerProjection`).

### Verification, this session, fresh and first-hand

- `npx vitest run apps/web/test/styles/reskinContract.test.ts apps/web/test/player2/ChooseInjuryPanel2.test.tsx apps/web/test/player2/ComposeStep2.test.tsx`
  — **3 files passed, 48 tests passed.**
- `npm run check` — **708 passed | 11 todo** (75 files passed, 1 skipped, 76 total; format/lint/
  typecheck all clean — `check` short-circuits on the first failing step, so a clean test run confirms
  all three passed). This is exactly 6 more than this branch's own pre-fix baseline of 702 recorded in
  this session's own local-gate check minutes earlier, matching the two new test files' 6 assertions.
- `npm run build` — clean: `@digitable/functions` 216.6kb in 14ms; `@digitable/web` (Vite) 138 modules,
  CSS 23.32kB, JS 897.98kB gzip 259.60kB, only the pre-existing non-blocking >500kB chunk advisory.
- `git diff --check` — clean (no whitespace errors).
- Firebase emulator suite: not rerun standalone. Ports 8080/9000/5001/9099 were held by an unrelated,
  long-running concurrent worktree session for this entire session (confirmed via `lsof`, polled for
  ~12 minutes, not disturbed). This change touches only `apps/web` component/test source and a test
  contract — no `packages/testing`, `apps/functions`, or Firestore/RTDB rules file changed
  (`git diff <last-emulator-verified-commit>..HEAD --stat` over those paths is empty), so the last
  recorded 108/108 result (18 testing + 86 Functions + 4 web) is unaffected and stands.
- Full diff scope confirmed minimal: `git status --short` shows exactly the five files named above;
  nothing else in the worktree changed.

## Independent review

This change had two independent passes before it reached this branch's committed history: the
original 2026-09-24 authorship-and-review pair for commit `5663d7f` (`docs/reviews/
2026-09-24-sonnet-w-utility-item-tap-target-review.md`), and a second, fresh independent reviewer in
this session's own background job, who verified (against this exact worktree, not by trusting this
session's narrative): the diff matches its description; both buttons are real, reachable UI wired
through `PlayerDashboardScreen.tsx`; the merge-base non-ancestry of `5663d7f`/`d5f9bce` against this
branch's `HEAD`; the `.link-button` fit; the brace-aware regex against real examples in
`AllocationStepper.tsx` and `CorrectionDialog.tsx` (no false-positive on the legitimate class-less
`.stepper-controls` buttons); a live mutation test (reverting the fix made the new assertion fail with
a precise message, then restored the file byte-for-byte); the six new tests running 6/6 in isolation;
and `npm run check`/`npm run build` matching. That reviewer's one non-blocking note: the 1000-character
proximity exemption is textual, not a true DOM-containment check, so a theoretical false negative is
possible in an unusually large file with an unrelated class-less button positioned near the literal
text `stepper-controls` — flagged, not blocking, since no such file currently exists in this codebase
and every `className` here is a plain string/template literal, not computed.

This session then independently re-derived every one of those load-bearing claims from scratch, a
third time, as recorded in Part B above, rather than accepting either the diff's presence or that
review's verdict on trust.

## Disposition

**Real, narrowly-scoped, twice-independently-reviewed fix, re-applied after verified parallel-worktree
fix loss.** Only `apps/web/src/player2/ChooseInjuryPanel2.tsx`, `apps/web/src/player2/ComposeStep2.tsx`,
`apps/web/test/styles/reskinContract.test.ts`, and two new test files changed. No engine, contracts,
template, Functions, Firestore/RTDB rules, or platform-authorization/projection-isolation surface
touched. No merge, deploy, resource creation, or promotion occurred. The broader reskin and pop-out
system required no further change (Part A). Physical-device evidence remains the one open item for
John, unchanged by this pass.
