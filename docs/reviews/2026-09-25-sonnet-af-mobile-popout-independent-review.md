# Fifth independent review: mobile pop-out defect (branch `sonnet-af/reskin-fresh-20260925`, 2026-09-25)

**Scope.** A fresh, isolated Sonnet reviewer (no access to prior sessions' reasoning) was asked
to independently audit every mobile select, menu, disclosure, modal, drawer, option list, and
action/allocation picker in the currently reviewed ink-black punk reskin — with special emphasis
on dynamic visual-viewport changes from browser chrome/on-screen keyboard, safe areas, 44px touch
targets, scroll/focus behavior, reduced motion, horizontal overflow, and GM/player/table state
semantics — starting from `factory/today-integration` at commit `2452f66` (docs-only, records the
fourth independent review) and preserving authorization, privacy, projection isolation, and
sourcebook/provenance constraints. This is the fifth independent pass over this exact defect area,
following
[`2026-09-24-sonnet-w-utility-item-tap-target-review.md`](2026-09-24-sonnet-w-utility-item-tap-target-review.md),
[`2026-09-25-sonnet-w-ui-audit-roster-selector-review.md`](2026-09-25-sonnet-w-ui-audit-roster-selector-review.md),
[`2026-09-25-sonnet-y-reskin-integration-independent-review.md`](2026-09-25-sonnet-y-reskin-integration-independent-review.md),
and
[`2026-09-25-sonnet-ad-mobile-popout-independent-review.md`](2026-09-25-sonnet-ad-mobile-popout-independent-review.md).

**Method.** Read `AGENTS.md`, `CLAUDE_HANDOFF.md`, `docs/ARCHITECTURE.md`,
`docs/IMPLEMENTATION_ROADMAP.md`, `docs/TEMPLATE_ARCHITECTURE.md`, `docs/DATA_AND_SYNC_MODEL.md`,
`docs/UX_RESOLUTION_THEATRE.md`, `docs/EAT_THE_REICH_BUILD_GUIDE.md`, and the full `docs/reviews/`
history of this defect, before touching anything. Confirmed `git diff 930e3f1..HEAD` still shows
`apps/web/src/styles.css`, `apps/web/src/shared/**`, and `apps/web/index.html` byte-for-byte
unchanged (only `scripts/playtest/ui-audit.mjs`'s roster-agnostic selector differs) — the pop-out
system itself (`SheetDialog`, the six native `<select>`s, the one `<details>` disclosure, the
custom `role="spinbutton"` allocation stepper) carries no new source change since the last fully
independently reviewed reskin evidence. Independently re-read, in full, `SheetDialog.tsx` (portal
mount, inert-background sibling trap, visual-viewport sizing via `useVisualViewportBox`, root
scroll lock, focus-in-on-open/return-on-close, Tab/Shift+Tab cycling restricted to *reachable*
focusable descendants, keyboard-reveal `scrollIntoView`) and `AllocationStepper.tsx` (tap +/-
buttons, full Arrow/Home/End keyboard support, `role="spinbutton"` with correct
`aria-valuemin`/`aria-valuemax`/`aria-valuenow`/`aria-valuetext`) rather than trusting prior
summaries. Also read `apps/web/src/gm2/CorrectionDialog.tsx` in full — the actual "GM correction
sheet" the live browser audit's 14 modal scenarios exercise (per `scripts/playtest/ui-audit.mjs`'s
own header comment): a `SheetDialog` consumer with four bare-`<button>` stepper pairs (Blood
change, per-item uses), all nested inside `.stepper-controls`, matching the one documented
class-less-button exclusion `reskinContract.test.ts` encodes — a different shape from the two
class-less buttons the `sonnet-w` pass found and fixed outside that exclusion. Re-grepped every
`apps/web/src/**/*.tsx` for `<select`, `<details`, `<summary` —
confirmed the same six `<select>`s (`SceneDirector.tsx` ×2, `GmToolsPanel.tsx` ×4) and the one
`<details>`/`<summary>` (`ComposeStep2.tsx`, the "Why?" pool-explanation disclosure) as every
prior pass, and that `GmToolsPanel`/`SceneDirector` are reachable only from `GmDirectorScreen`,
consistent with the GM-only capability boundary. Read the relevant `styles.css` tap-target/
safe-area/viewport rules directly (`--tap: 3rem` (48px); `min-height`/`min-width: var(--tap)` on
every input/select/textarea/summary/gear-option/checkbox-row/stepper-control; `font-size: 1rem`
on every text input, below which iOS Safari zooms on focus; `env(safe-area-inset-*)` insets on the
app shell, sheet header, and sheet footer; `@supports (height: 100dvh)` guarding the
`var(--vv-height, 100dvh)` sheet-height fallback so an engine without `dvh` support falls back to
`auto` rather than an invalid value; `prefers-reduced-motion: reduce`/`no-preference` and
`forced-colors: active` media blocks) rather than trusting the CSS's own prior review citations.

**Gates reproduced this session** (fresh worktree, fresh `npm install` — no `node_modules`
existed before this session):

- `npm run check` — **692 tests passed | 11 todo** (71 files, 1 skipped), format/lint (zero
  warnings)/typecheck clean.
- `npm run build` — clean (`apps/functions` esbuild 216.6kb; `apps/web` vite build, 138 modules;
  the existing non-blocking >500kB chunk warning, unchanged).
- `git diff --check` — clean; the only working-tree change from the fresh `npm install`
  (immaterial `package-lock.json` `"peer": true` metadata churn, the same diff every prior review
  in this series discarded) was reverted with `git checkout -- package-lock.json`, not committed.
- `npm run test:emulator` not rerun standalone this session (superseded by the live audit below,
  which exercises the same Auth/Firestore/Functions emulators end to end against the real app);
  no `packages/testing`, `apps/functions`, rules, or engine file changed, so its last recorded
  108/108 result stands.

**Fresh live evidence, generated by this session (not just cited).** Built a from-scratch
emulator-mode production bundle (`VITE_FIREBASE_USE_EMULATOR=true`, fake `demo-digitable`
config — no real Firebase project, credential, or resource touched), started the local
Auth/Firestore/Database/Functions emulators (`demo-digitable`, `127.0.0.1`-bound ports 9099/
8080/9000/5001, confirmed all four responding before proceeding), served the build via
`vite preview` on `127.0.0.1:4174` (no LAN/network exposure), and ran:

```
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4174 \
  --label sonnet-af-independent --out <job-tmp>/ui-audit-out2 --port 9764 --no-shots
```

**First attempt result and diagnosis (recorded for transparency, not a defect):** the first
attempt in this session failed with `FAIL flow: [player] timed out waiting for: player reveal`
after only 60/150 states. Investigation (checking `ps aux` and this session's own emulator log)
found a concurrent, unrelated background process — another sandboxed session's
`firebase emulators:exec ... npm run test:emulator` — contending for the same default emulator
ports (8080/9099/9000/5001, fixed by the repository's shared `firebase.json`), and this session's
own Firestore emulator had received `SIGTERM` (exit code 143) mid-run, breaking the `admitMember`
call the player-join step depends on. This is exactly the same class of sandbox port contention
`docs/reviews/2026-09-25-sonnet-y-reskin-integration-independent-review.md` records ("the port
conflict noted in this review's first pass cleared once the concurrent sandbox process released
them") — not an application defect. Restarted the local emulator stack and `vite preview`, waited
for both to report healthy, and reran the identical command.

**Second attempt: clean pass.** `ok: true`, **150 states**, **1,422 controls audited** (the
script's selector covers every native `<select>`, the `<details>`/`<summary>` disclosure, the
custom `role="spinbutton"` allocation stepper, and every button/link/input), **0 control issues**,
**0 overflow states**, **0 hard axe violations**, **0 failures**, **14/14 modal/sheet scenarios**
(phone-small(320)/phone(375)/phone-landscape(812×375 and 667×375)/tablet(768)/desktop(1280)
widths, plus dynamic-viewport-keyboard emulation, real-Chrome pinch-zoom, emulated safe-area
insets, 150%/200% text scaling, internal scroll-to-control, and reduced-motion). Independently
inspected the raw `report.json` (not just its printed summary): every modal scenario's `checks`
object — `dialogInsideViewport`, `actionsVisibleWithoutScrolling`/`actionsReachable`,
`noPageOverflow`, `actionTargets44`, `reasonReachableAfterScroll`/`reasonReachable`,
`rootScrollLocked`, `backgroundInert`, `focusInsideDialog`, plus the keyboard-emulated sub-checks
(`dialogInsideViewport`, `focusedFieldVisible`, `actionsVisible`, `noPageOverflow`) — reads `true`
in every scenario except the one already-documented 320px+200%-text extreme (scenario 14,
`text-200-phone-small`: only `dialogInsideViewport`/`noPageOverflow` read `false`, logged by the
script itself as `INFO ... (recorded, not gating)`, matching every prior review's accepted
geometry limit, not a new finding). `console` capture shows zero console errors and zero failed
requests across all four surfaces (`gm`, `player`, `table`, `anon`). `reducedMotion` capture
confirms the sheet's rise/fade animation genuinely collapses under
`prefers-reduced-motion: reduce` (`sheetDuration` `0.18s` in the allowed case vs `1e-06s` in the
reduced case; `anyLongTransition: true` vs `false`). The one `axeBestPractice` entry
(`anon/route-claim-no-such-room@phone: page-has-heading-one`) is the same pre-existing,
non-hard-violation note on the intentional nonexistent-room route every prior review recorded.
Background emulator/preview processes were stopped after the run; nothing was committed from the
emulator-mode build (`dist/` is gitignored); `package-lock.json` churn from the fresh install was
discarded.

**GM/player/table state semantics.** Confirmed by direct source reading (not re-derivation from
the engine test suite, which is unchanged): `GmToolsPanel.tsx` and `SceneDirector.tsx` — the two
files containing all six native `<select>`s plus every GM-only command form (void roll, grant
item, unlock advance, reassign character, advance/edit scene, reveal a hidden Threat) — are
imported and rendered only from `GmDirectorScreen.tsx`, itself reachable only via the
`#/room/:roomId/gm` route; no player- or table-surface component imports either file. This matches
the existing platform-authorization boundary (GM capability checked server-side before any command
is accepted) and was not weakened by anything read this session.

**No other in-scope defect found; no code change made.** The pop-out system (`SheetDialog`, the
six native `<select>`s, the one `<details>` disclosure, the custom allocation stepper) is
unchanged since `930e3f1` and is confirmed — by fresh, from-this-session source reading and
browser evidence, not by citing prior runs — to satisfy every geometry, 44px+ tap-target,
focus-trap, scroll-lock, safe-area, and reduced-motion invariant this audit checks, at phone
(320/375/812×375/667×375)/tablet(768)/desktop(1280) widths, under dynamic-viewport-keyboard
emulation, pinch-zoom, safe-area insets, and 150%/200% text scaling. Functional semantics,
privacy/authorization invariants (platform authorization before template authorization, per-viewer
projection isolation, hidden-field redaction, GM-only tool reachability), and sourcebook/
provenance constraints are all unaffected — nothing in `packages/*`, `templates/*`,
`apps/functions`, `firestore.rules`, `database.rules.json`, or the engine/authorization boundary
was touched or needed to be. This is a documentation-only entry (this file plus the
`CLAUDE_HANDOFF.md` note it is linked from); no merge, deploy, resource creation, or promotion
occurred.

**Physical-device limitation (unchanged, explicitly noted, not reopened as a defect).** This
review, like all four prior passes, ran entirely in real-Chrome headless CDP emulation on this
machine — real iOS/Android hardware, real on-screen-keyboard resize behavior, and real Safari
visual-viewport quirks were not and could not be exercised here. That gap remains open for John
under `docs/PLAYTEST_TWO_DEVICE.md` and `CLAUDE_HANDOFF.md`'s physical-device evidence item; this
review does not close it and does not claim to.
