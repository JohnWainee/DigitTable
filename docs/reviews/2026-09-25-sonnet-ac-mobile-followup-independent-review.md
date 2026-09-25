# Mobile reskin follow-up (issue #14) — fourth independent pass, integrated candidate (`d5f9bce`)

- **Date:** 2026-09-25
- **Branch:** `sonnet-ac/reskin-mobile-followup-20260925` (fresh, isolated worktree; independent
  read, not a continuation of any prior session's reasoning)
- **Base reviewed:** `d5f9bce` (`merge: integrate reviewed mobile reskin audit fixes`), the head of
  this branch — the same tap-target/audit-selector candidate three prior independent passes already
  approved (`docs/reviews/2026-09-24-sonnet-w-utility-item-tap-target-review.md`,
  `docs/reviews/2026-09-25-sonnet-w-ui-audit-roster-selector-review.md`,
  `docs/reviews/2026-09-25-sonnet-y-reskin-integration-independent-review.md`), now folded into
  `factory/today-integration`.
- **Scope:** re-assess, with fresh eyes and fresh evidence, every mobile select/menu/disclosure/
  modal/drawer/option-list/allocation/action-picker interaction at 320×568 and 375×812 with visual
  viewport shrinkage, dynamic browser chrome, on-screen keyboard, safe-area insets, 200% zoom,
  keyboard, touch, and reduced motion; confirm desktop popovers degrade to internally-scrolling
  bottom sheets/full-width behavior rather than clipping. Genuine remaining defects only — no
  cosmetic churn.
- **Verdict: no genuine defect found. No source change made.**

## Method

Read the pop-out/control implementation directly rather than trusting prior write-ups:
`apps/web/src/shared/SheetDialog.tsx` (the one modal pattern — portal, inert background, focus trap,
Escape, root scroll lock, visual-viewport sizing), `apps/web/src/shared/useVisualViewportBox.ts` (the
`--vv-*` CSS variable bridge for iOS-Safari-style visual/layout viewport divergence), the `.sheet*`
rules and every `min-height: var(--tap)`/safe-area/`dvh`-fallback rule in `apps/web/src/styles.css`,
`AllocationStepper.tsx` (the custom spinbutton allocation/push-dice control), and every native
`<select>`/`<details>`/button call site (`GmToolsPanel.tsx`, `SceneDirector.tsx`,
`ChooseInjuryPanel2.tsx`, `ComposeStep2.tsx`) — the last two being exactly the files the prior
tap-target fix touched. Grepped the whole of `apps/web/src` for non-semantic clickable
`<div>`/`<span>`/`<li>` elements (a common touch-target blind spot the static contract test cannot
see): none exist — every interactive control is a real `<button>`, `<select>`, `<input>`, `<summary>`,
or the one `role="spinbutton"` div, so `apps/web/test/styles/reskinContract.test.ts`'s className-based
audit has no gap to fall through. Confirmed both previously-fixed buttons
(`ChooseInjuryPanel2.tsx`'s "Destroy Cowboy hat...", `ComposeStep2.tsx`'s "Mark and regain Blood")
still carry `className="link-button"`.

No source defect surfaced from this reading. `apps/web/src/styles.css`'s `.sheet-backdrop`/`.sheet`
rules already size from `--vv-height`/`--vv-width` (falling back to `100dvh`/`100vh` behind an
`@supports` guard so an invalid `var()` never collapses to `height: auto`), already reclaim vertical
room under `@media (max-height: 34rem)` for a landscape phone or an open keyboard, already clamp
`.sheet-footer` to 40% of the visual viewport height so large text can never squeeze the body away,
and deliberately leave `touch-action: auto` on the backdrop so a sheet never disables page pinch-zoom
(commented rationale against WCAG 1.4.4, cross-checked against the live pinch-gesture scenario below).

## Fresh verification gates (this session, this branch, not cited from a prior session)

- `npm run check` — format, lint (zero warnings), typecheck, **692 tests passed | 11 todo** (71 files
  passed, 1 skipped) — matches the branch's recorded baseline exactly.
- `npm run build` — clean (`apps/functions` esbuild 216.6kb; `apps/web` vite build; the pre-existing,
  non-blocking >500 kB chunk-size warning only).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — first attempt hit a transient
  port collision from a concurrent sandboxed worktree (`Could not start Authentication Emulator, port
  taken`); the ports were free moments later (confirmed via `lsof`) and the rerun **passed 108/108**
  (18 `packages/testing`, 86 `apps/functions`, 4 `apps/web`), matching the recorded baseline.

## Fresh real-browser evidence (headless Chrome via CDP — explicitly not physical-device evidence)

Built a scratch, git-ignored live-mode bundle (`VITE_FIREBASE_USE_EMULATOR=true` against a fake
`demo-digitable` project, matching `scripts/playtest/lan-up.sh`'s recipe but bound to `127.0.0.1`
only — no LAN exposure, no real Firebase project, nothing deployed), started the Auth/Firestore/
Functions emulators and `vite preview` both on `127.0.0.1`, and ran
`node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4174 --label sonnet-ac-independent
--out <job-tmp>/ui-audit-out --port 9762` (screenshots **on**, not `--no-shots`, for fresh before/after
evidence).

Result (`report.json`, copied to
[`docs/evidence/sonnet-ac-independent-20260925/ui-audit/report.json`](../evidence/sonnet-ac-independent-20260925/ui-audit/report.json)):
`ok: true`, **150 states**, **1,590 controls audited**, **0 control issues**, **0 overflow states**,
**0 hard axe violations**, **0 failures**. All 14 modal/sheet scenarios passed, explicitly including
the two viewports named in this pass's scope:

- **phone-small (320×568)** and **phone (375×812)**: dialog fully inside the viewport, both action
  buttons visible without scrolling, no page overflow, both action targets ≥ 43.5px (the 44px
  practical minimum), the last control reachable after scrolling the sheet body, root scroll locked,
  the background made `inert`, and focus kept inside the dialog — all `true`.
- **On-screen keyboard** (layout-viewport shrink to 45% height with the reason field focused, the
  Chrome-Android `interactive-widget=resizes-content` model): dialog still inside the viewport, the
  focused field still visible, both actions still visible, no overflow — at every mobile width
  including 320×568 and 375×812.
- **Visual-viewport zoom** (`Emulation.setPageScaleFactor: 1.6`) and a **synthesized two-finger pinch
  gesture** at 375×812: the dialog and its actions stay inside the *visual* viewport once zoomed, and
  the pinch gesture still zooms the page with the sheet open (proving the sheet does not disable page
  zoom, per WCAG 1.4.4).
- **Safe-area insets** (notch/home-indicator emulation, portrait and landscape): the sheet clears the
  inset on every edge tested and the footer clears the home indicator with margin.
- **200% text scaling**: gating at 375×812 (passes) and at 320×568 for the sheet's own geometry
  (`bodyKeepsRoom`, `actionsReachable`, `reasonReachable` all pass); the two informational-only,
  already-documented exceptions at 320×568+200% (`dialogInsideViewport`, `noPageOverflow`) are the
  *page behind the sheet* overflowing at that combination, not the sheet — recorded, not gating, and
  unchanged from every prior pass.
- **Reduced motion**: `prefers-reduced-motion: no-preference` produces the sheet's entrance animation
  (`sheet-rise`/`sheet-fade`, 0.18s); `reduce` collapses both to `1e-06s` and `none` — motion exists
  exactly when allowed and is absent exactly when not.
- **Console/network**: zero console errors and zero failed requests across all four roles (GM, player,
  table, anonymous) across the full 150-state sweep.

One pre-existing, non-gating axe best-practice note recurs (`page-has-heading-one` on the intentional
nonexistent-room route) — already documented in three prior reviews, unchanged, not a regression.

A representative screenshot set (the 14 modal/sheet scenario captures plus one landing screenshot per
viewport) and the full `report.json` are committed under
[`docs/evidence/sonnet-ac-independent-20260925/ui-audit/`](../evidence/sonnet-ac-independent-20260925/ui-audit/);
the full 150-state/168-screenshot capture (26 MB) was not committed to keep the diff reviewable, but
was generated and inspected in full during this session.

Local emulator and `vite preview` processes were stopped after the run; `apps/web/dist` (git-ignored)
was rebuilt with `npm run build` afterward to leave no emulator-mode artifact behind.

## Desktop popover → bottom sheet transition

`SheetDialog` is the only pop-out pattern in the app (confirmed: no other `role="dialog"`, custom
`role="menu"`/`role="listbox"`, or floating popover markup exists in `apps/web/src`; every other
option list is a native `<select>`, which the OS/browser already renders as its own accessible
picker on every platform). Its CSS switch from an edge-attached bottom sheet to a centred,
internally-scrolling card happens at a single breakpoint (`@media (min-width: 40.0625rem)`), governed
by the same `max-height: min(100%, 44rem)` and `.sheet-body { overflow-y: auto }` rules regardless of
which side of that breakpoint applies — so a desktop-width dialog whose content doesn't fit still
scrolls internally rather than clipping or requiring the page to scroll. This was verified live in
the `desktop` (1280×800) and `tablet` (768×1024) modal-scenario checks above, both passing
`dialogInsideViewport`/`actionsVisibleWithoutScrolling`/`noPageOverflow`.

## What this pass does not cover

Per `docs/PLAYTEST_TWO_DEVICE.md` and every prior review in this chain: headless Chrome cannot
reproduce the iOS-Safari case where the *visual* viewport shrinks under an on-screen keyboard while
the *layout* viewport does not (`Emulation.setVisibleSizeOverride` no longer exists in CDP). That
mechanism is covered in `apps/web/test/shared/SheetDialog.test.tsx` (jsdom, mocked `visualViewport`)
and, as far as the sheet's actual *use* of the `--vv-*` variables goes, by this session's own
pinch-zoom scenario (a real visual-viewport-vs-layout-viewport divergence Chrome *can* produce). No
physical iOS/Android device, VoiceOver, or TalkBack pass was performed in this session — all evidence
above is headless-Chrome-via-CDP automation plus static code reading, not physical-device or
screen-reader evidence. That gap is pre-existing and already tracked as open for John in
`CLAUDE_HANDOFF.md`.

## Disposition

No genuine remaining defect found in the scope requested. The candidate at `d5f9bce` is unchanged by
this pass — no narrowest-fix was needed because none was warranted. This is the fourth independent
review of this exact tap-target/audit-selector fix and the reskin's pop-out system as a whole; all
four (the three cited above plus this one) agree, and this pass adds fresh, from-this-session evidence
generated with screenshots on (rather than `--no-shots`) specifically at the two viewports this
follow-up was scoped to. This review does not merge, deploy, or promote anything; `factory/today-
integration` already carries this candidate per the prior reviews' recommendation, and merge/deploy
decisions remain John's.
