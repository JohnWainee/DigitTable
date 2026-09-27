# 2026-09-27: sixth independent review — ink-black/punk-zine legibility and mobile pop-out audit

## Scope

A fresh, isolated Sonnet pass over `factory/today-integration` at `e7efe29` (this worktree's
starting point, unchanged by this review), asked to:

1. Audit the ink-black/punk-zine reskin specifically for **legibility** (colour contrast, text
   size, letter-spacing) — a angle the five prior mobile pop-out reviews touched only in passing.
2. Re-audit every mobile select/menu/disclosure/modal/drawer/option list/allocation/action picker
   at 320/375/812-landscape/768/1280/1920px plus dynamic visual viewport, virtual keyboard, safe
   area, text scaling, reduced motion, touch, and keyboard behaviour.
3. Not duplicate the mobile utility-target and audit-selector fixes owned by draft PR #40 and its
   antecedent branches.

## PR #40 relationship, verified directly

`gh pr diff 40` shows PR #40 (`sonnet-ax/reskin-final-audit-20260927`) is based on **`origin/main`
at `b599abd`**, not on `factory/today-integration`. `main` never received the `link-button`
tap-target fix for the Cowboy Hat/Blood utility buttons (that fix, `5663d7f`, only ever landed on
`factory/today-integration`, merged at `d5f9bce`). PR #40 is re-applying the identical fix to
`main`. Directly reading `apps/web/src/player2/ChooseInjuryPanel2.tsx:83` and
`apps/web/src/player2/ComposeStep2.tsx:161` on this branch confirms both buttons already carry
`className="link-button"` here. **No action needed on this branch; nothing here overlaps PR #40's
diff.**

## Legibility audit (new angle, not previously reported in depth)

- Confirmed `apps/web/src/styles.css`, `apps/web/src/shared/**`, and `apps/web/index.html` remain
  byte-for-byte unchanged since `930e3f1` (`git diff 930e3f1..HEAD -- apps/web/src/styles.css
  apps/web/src/shared apps/web/index.html` is empty) — the palette, type stack, and reskin CSS have
  not moved since the reskin's own independently reviewed baseline.
- Independently recomputed WCAG relative-luminance contrast for `.die-chip--discard`
  (`color: var(--mute)` inheriting `background: var(--ink-0)` from `.die-chip`), the one pairing
  the static `reskinContract.test.ts` palette table does not enumerate directly (it only checks
  `mute` against `ink-2`/`ink-3` for text, plus `mute` against all four ink surfaces at the lower
  3:1 boundary threshold): `mute` `#9a9488` vs `ink-0` `#050506` computes to **~6.75:1**, clearing
  the 4.5:1 text minimum with margin. Not a defect.
- Enumerated every `color: var(--dim|--mute|--riot|--riot-deep|--cyan|--pink|--volt|--acid)`
  declaration in `styles.css` (48 occurrences) and every bright-fill `background` declaration (8
  occurrences); every bright fill pairs with `color: var(--ink-0)` text, which the existing static
  test already asserts at >=7:1 (acid/cyan/volt) or >=4.5:1 (pink). The one untested decorative
  case, `::selection { background: var(--pink); color: var(--ink-0) }`, is browser-native text
  selection, not authored UI chrome — not in scope for a tap-target/legibility defect.
- Checked every `font-size` below `1rem` (12 occurrences, smallest `0.75rem`/12px): all are
  secondary/meta text (`.party-member-stats`, `.connection-status`, portrait initials), never
  primary body copy or form input text (inputs are pinned to `1rem`/16px by
  `reskinContract.test.ts`, preventing iOS zoom-on-focus). No sub-12px text exists anywhere in the
  stylesheet.
- No new defect found. Legibility remains as documented in `styles.css`'s own header comment and
  as verified by axe-core's real-render contrast checks in every prior live `ui-audit.mjs` run
  (zero hard violations across 150 states in each of the last three live passes).

## Mobile pop-out / picker audit

- `git diff d5f9bce..HEAD --stat` shows only `CLAUDE_HANDOFF.md` and two review docs changed since
  the last code merge — no source file affecting any select/menu/disclosure/modal/drawer/picker has
  changed since the fifth independent review (`docs/reviews/2026-09-25-sonnet-af-mobile-popout-independent-review.md`).
- Re-read `apps/web/src/gm2/CorrectionDialog.tsx` in full (flagged by name in the fifth review's
  commit history but not walked through there): every button is either `.primary-action`,
  `.secondary-action`, or inside `.stepper-controls` (the one documented class-less exception); no
  class-less button, no new `<select>`/`<details>`/`<dialog>` markup.
- Re-read `apps/web/src/landing/JoinScreen.tsx` in full (the largest source diff since the reskin
  baseline, +160/-12 lines for the recovery flow) — every button (`primary-action`,
  `secondary-action`) is properly classed; no class-less button, no new pop-out control.
- Ran the repository's own exhaustive static scan for the exact defect class the fifth-review
  lineage was created to catch: `reskinContract.test.ts`'s "never adds a `<button>` with no
  className outside `.stepper-controls`" test scans every `.tsx` file under `apps/web/src` and
  passed with zero findings (part of the `npm run check` run below).

## What was not run, and why

- **Live browser audit (`scripts/playtest/ui-audit.mjs`) and `npm run test:emulator`**: the fixed
  emulator ports this repo's `firebase.json` requires (8080 Firestore, 9099 Auth, 9000 RTDB, 5001
  Functions) were held by a concurrent session (`lsof` confirmed `node`/`java` listeners already
  bound) at the time of this review. Per instruction, no competing job was killed and no alternate
  port configuration was substituted. This mirrors PR #40's own recorded gap
  ("blocked before test execution by unrelated fixed-port owners; do not terminate them").
  Physical-device evidence remains the outstanding item for John, unchanged by this pass.

## Gates run this session (fresh, this worktree)

- `npm run check` — **692 tests passed | 11 todo** (71 files passed, 1 skipped), format/lint (zero
  warnings)/typecheck clean.
- `npm run build` — clean (`apps/functions` esbuild 216.6kb; `apps/web` vite build, 138 modules,
  existing non-blocking >500kB chunk warning unchanged).
- `git diff --check` — clean.

## Disposition

**No defect found; no code change made.** This is the sixth independent pass over this defect
area (`docs/reviews/2026-09-24-sonnet-w-utility-item-tap-target-review.md`,
`docs/reviews/2026-09-25-sonnet-w-ui-audit-roster-selector-review.md`,
`docs/reviews/2026-09-25-sonnet-y-reskin-integration-independent-review.md`,
`docs/reviews/2026-09-25-sonnet-ad-mobile-popout-independent-review.md`,
`docs/reviews/2026-09-25-sonnet-af-mobile-popout-independent-review.md`, and this one), the first
to focus specifically on colour/text legibility rather than pop-out geometry, and it agrees with
all five prior passes: no blocking finding, nothing to merge or deploy. PR #40's utility-target fix
is confirmed already present on this branch and not duplicated here. Physical-device evidence and
the live-emulator/ui-audit re-run (once ports are free) remain the open items for John.
