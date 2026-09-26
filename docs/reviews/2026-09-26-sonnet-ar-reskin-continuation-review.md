# Tenth independent review: seventh mobile pop-out re-audit, plus first audit of the seat-recovery UI (2026-09-26)

**Scope.** Starting from `factory/today-integration`'s state at `e4324be` (the ninth independent
review's smoke-evidence-handling fix, already committed and integrated), this session was asked to
independently re-audit every select, menu, disclosure, modal, drawer, option list, and
allocation/action picker across phone (320/375px, including dynamic visual viewport and on-screen
keyboard), tablet, desktop, and table widths — the same defect area nine prior independent passes
have already covered
([`2026-09-18-sonnet-d-reskin-independent-review.md`](2026-09-18-sonnet-d-reskin-independent-review.md),
[`2026-09-24-sonnet-w-utility-item-tap-target-review.md`](2026-09-24-sonnet-w-utility-item-tap-target-review.md),
[`2026-09-25-sonnet-w-ui-audit-roster-selector-review.md`](2026-09-25-sonnet-w-ui-audit-roster-selector-review.md),
[`2026-09-25-sonnet-y-reskin-integration-independent-review.md`](2026-09-25-sonnet-y-reskin-integration-independent-review.md),
[`2026-09-25-sonnet-ad-mobile-popout-independent-review.md`](2026-09-25-sonnet-ad-mobile-popout-independent-review.md),
[`2026-09-25-sonnet-af-mobile-popout-independent-review.md`](2026-09-25-sonnet-af-mobile-popout-independent-review.md),
[`2026-09-26-sonnet-am-smoke-evidence-and-reskin-review.md`](2026-09-26-sonnet-am-smoke-evidence-and-reskin-review.md)) —
and to specifically audit the seat-recovery UI (`JoinScreen.tsx`'s "recover" mode, added by
`4083123` and not previously exercised as its own interactive surface by any prior pop-out review),
plus verify projection privacy, authorization semantics, and asset provenance were not disturbed.

## Part A: source-diff verification

`git diff 930e3f1..e4324be -- apps/web/src/styles.css apps/web/src/shared apps/web/index.html` is
empty — independently reproduced, not cited. The pop-out system (`SheetDialog`, the six native
`<select>`s across `SceneDirector.tsx`/`GmToolsPanel.tsx`, the one `<details>` disclosure in
`ComposeStep2.tsx`, the `AllocationStepper` spinbutton) has had no source change since the last
fully independently reviewed reskin evidence. `git diff 930e3f1..e4324be --stat -- apps/web/src`
shows the only files touched since that baseline are `JoinScreen.tsx`, `ChooseInjuryPanel2.tsx`,
`ComposeStep2.tsx` (both already covered by the tap-target fix and its six subsequent re-audits),
`PlayerDashboardScreen.tsx`, and four `session/*` files (`FirebaseSessionClient.ts`,
`RoomEngineStore.ts`, `ownership.ts`, `roomClient.ts`) implementing seat recovery (board task A06)
and credential-storage hardening. Read each of `SheetDialog.tsx`, `AllocationStepper.tsx`, the
`GmToolsPanel.tsx`/`SceneDirector.tsx` selects, and the `ComposeStep2.tsx` disclosure in full this
session (not just cited): portal mount with sibling `inert`, visual-viewport sizing, root scroll
lock, focus trap restricted to reachable descendants (`isReachable`'s `<details>`/`fieldset`/radio
handling), keyboard reveal on focus, and the spinbutton's full Arrow/Home/End operation are all
unchanged and correct. Every native `<select>` has a preceding `<label htmlFor>`; none is new markup
since baseline.

## Part B: fresh gates, this session

- `npm install` (fresh worktree) — clean.
- `npm run check` — **703 tests passed | 11 todo** (73 files, 1 skipped), format/lint (zero
  warnings)/typecheck clean — exactly matching the recorded baseline.
- `npm run build` — clean (existing non-blocking >500 kB chunk warning only).
- `git diff --check` — clean; the fresh-install `package-lock.json` `"peer": true` metadata churn
  (the same immaterial diff every prior review in this series discarded) was reverted, not
  committed.
- `npm run test:emulator` — **not run**: the default emulator ports (8080/9099/9000/5001) were held
  the entire session by a separate, long-running local `firebase emulators:start` process
  (`--project demo-digitable`, confirmed via `ps` to be a concurrent worktree's own workload, not a
  stale process). Per this session's instructions, this did not start a competing instance on the
  same fixed ports. No file in `packages/testing`, `apps/functions`, `apps/web`'s repository/rules
  code, or the Firestore/RTDB rules changed this session, so the last recorded **108/108** result is
  unaffected and stands.

## Part C: fresh live evidence generated this session

**Anon/stateless-route sweep (fixture-mode build).** A from-scratch `vite build` with no
`VITE_FIREBASE_*` env vars (fixture/in-memory mode — no Firebase project, credential, emulator, or
network reachable) served via `vite preview` on `localhost:4183`, audited with
`node scripts/playtest/ui-audit.mjs --base http://localhost:4183 --no-shots`: **60 states**, **318
controls audited**, **0 control issues**, **0 overflow states**, **0 hard axe violations**, only the
same pre-existing, non-gating best-practice note every prior pass recorded (the intentional
nonexistent-room route's missing `<h1>`). The script's own multi-actor flow (GM creates → player
joins) timed out waiting for the player's reveal card; this is **not an application defect**: each
of the script's `gm`/`player`/`table`/`anon` roles is a separate CDP `Target.createBrowserContext`
(an isolated storage partition, i.e. a separate tab), and fixture mode's `RoomEngineStore` is an
in-memory singleton scoped to one page's JS runtime — `RoomEngineStore.ts`'s own doc comment states
"fixture rooms are this tab's memory only." The script is documented and designed to drive "the REAL
app (live mode against the local Firebase emulators)" for exactly this reason; running it against a
fixture build for a *cross-tab* flow is a misuse of the harness, not a product bug. Confirmed by
inspecting the report: zero console errors and zero failed requests were recorded up to the timeout,
and the player device's own `.session-form` submission is otherwise unremarkable. (The single-tab
portions of the sweep — every anon/signed-out route, including both `#/join` route states — are
unaffected by this limitation and are valid evidence.)

**Seat-recovery UI (new since the last full pop-out review; not previously audited as its own
surface).** Because seat recovery can be exercised entirely within one tab (create a room, note its
GM recovery code, then use the same page's `#/join` "recover" toggle against the same in-memory
store), this was driven directly over CDP at 320/375/768/1280px:

- All three recovery-form inputs and both buttons (`Recover my seat`, `Back to join by code`) are
  full-width and exactly **48px tall** at every width (the `--tap` budget), with **0px horizontal
  overflow** at every width tested (desktop's `-15px` is the same normal scrollbar reservation every
  prior review recorded, not an issue).
- A wrong recovery code renders the rejection message in a `role="alert"` paragraph without
  shrinking or displacing the submit button (still 343×48 after rejection at 375px).
- The correct code redeems the seat, invalidates it, and reveals a new one-time code in a
  `.reveal-card` (`0px` overflow, 307×48 continue button) — the same reused, already-audited
  `.reveal-card`/`.reveal-code` styling the join-accept flow uses, with no new CSS.
- **Authorization semantics verified live, not assumed:** after recovering the GM's own seat, the
  "I wrote it down — continue" button navigated to `#/room/<roomId>/gm` — `resumeRoute()`'s
  capability-to-route mapping resolved correctly from the server-returned `capability`, matching
  `docs/ARCHITECTURE.md`'s per-viewer routing. No console exception was thrown during redemption or
  navigation.
- **Privacy verified in source:** `ownershipFromRecoverySeat`/`writeOwnershipRecord` always persist
  `recoveryCode: null` — the one-time code is never written to `localStorage`, matching the reskin's
  existing `ownershipFromAcceptedWithNames` behavior and the architecture's "recovery credentials are
  display-once secrets" invariant.

No screenshots were captured for this evidence-only pass (no code changed, so there is nothing to
show before/after); the exact commands above are reproducible from this worktree.

## Part D: other invariants

- **WCAG contrast / reduced motion / safe areas:** `styles.css` (contrast tokens, `--tap: 3rem`,
  `env(safe-area-inset-*)` on the sheet and shell chrome, both `prefers-reduced-motion` blocks) is
  byte-for-byte unchanged since `930e3f1`, and axe's color-contrast rule (part of the WCAG 2.x AA
  ruleset the script runs) recorded zero hard violations across this session's 60-state sweep plus
  the recovery-UI spot check.
- **Original-asset provenance:** no new asset, character, location, or copy resembling licensed
  *Eat the Reich* text was introduced; the only new UI copy ("Recover your seat", "Lost your
  browser?", field labels) is original interface chrome, not game content.
- **Projection privacy / platform authorization:** no engine, contracts, template, Functions, or
  Firestore/RTDB rules file changed since the baseline this review started from — the invariants
  those enforce (per-viewer projection isolation, platform-before-template authorization,
  `RandomSource`-only entropy) are unaffected by this session's read-only source review and
  single-tab UI verification.

## Disposition

**No new defect found; no code change made.** This is the seventh independent pass over the mobile
pop-out defect area and the first to specifically exercise the seat-recovery UI as its own
interactive surface; it agrees with all six prior pop-out passes, and finds the new recovery UI
meets the same tap-target, overflow, privacy, and authorization-routing invariants as the rest of
the reskin. Physical-device evidence (real iOS/Android hardware, real Safari visual-viewport
keyboard behavior) remains the one open item for John, unchanged by this pass. No merge, deploy,
resource creation, or promotion occurred; no `apps/web` production source, engine, contracts,
template, Functions, or rules file changed.
