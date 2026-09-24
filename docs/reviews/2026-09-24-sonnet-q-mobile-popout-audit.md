# Mobile pop-out audit and audit-tool port (sonnet-q/reskin-integration-20260924)

- **Date:** 2026-09-24
- **Branch:** `sonnet-q/reskin-integration-20260924`, from `factory/today-integration` at `841099a`
- **Scope:** independently audit the current candidate for a real, remaining, user-visible mobile
  pop-out or responsive/accessibility/reskin gap (selects, menus, disclosures, dialogs, sheets,
  option/action/allocation controls, keyboard/visual-viewport/safe-area behaviour) across GM,
  player, table and setup/join flows, per `AGENTS.md`'s review-before-changing and scope-discipline
  rules — without duplicating work already done by sibling branches or inventing a defect.

## Prior work checked first

Before auditing, this session inspected two sibling branches named in the task:

- `sonnet-p/reskin-hourly-20260924` (head `9750973`): a fresh follow-up mobile pop-out audit
  against live staging, no defect found, no source change.
- `worktree-sonnet-n-reskin-hourly-20260924` (head `832f37a`): fixed a real blind spot in
  `scripts/playtest/ui-audit.mjs` — `openCorrection()` located the roster row to open the app's one
  modal (the GM correction sheet) by matching the character name "Rook" via regex. "Rook" was the
  Phase 1A placeholder character, removed when the sourcebook roster shipped (`5e8907b`,
  2026-09-19). Since then the lookup silently timed out, skipping the script's *entire*
  modal/pop-out audit while the rest of the sweep kept reporting an overall pass. The fix opens the
  first roster row's Correct button instead (the sheet's audited geometry/focus/safe-area behaviour
  does not depend on which character it is for).

Both branches share a common ancestor with this one at `b599abd`, but this branch's own history
(`a350b2d` → `841099a`, dated 2026-09-19/22) diverged **before** `832f37a` landed (dated
2026-09-23). `git log --oneline HEAD..sonnet-p/reskin-hourly-20260924` confirmed this branch does
not have that fix; `grep -n "Rook" scripts/playtest/ui-audit.mjs` confirmed the stale selector was
still present here. Running this branch's own audit tooling as-is would have silently reproduced
the same blind spot and produced a false "0 failures" on the one thing this task most needed to
check.

## Source change: ported the audit-tool fix

Applied the identical one-line selector change from `832f37a` to
`scripts/playtest/ui-audit.mjs`'s `openCorrection()` (matching roster-row selection instead of a
hardcoded, now-removed character name). No `apps/web`, `packages/*`, `templates/*`, or
`apps/functions` source was touched — this is test/tooling code only, and porting an
already-independently-verified fix rather than re-deriving it from scratch.

### Independent review of this change

A fresh subagent, given no prior context, reviewed the ported diff independently:

- Confirmed `waitFor()` has no silent-success path: an empty roster still fails loudly after a
  20s timeout, exactly as the old selector did on timeout — the new selector only fixes the
  specific cause (a name that no longer exists), not the failure-reporting behaviour.
- Read `RosterPanel.tsx` and confirmed every roster `<li>` renders exactly one "Correct" button, so
  `li:first-child button` deterministically resolves and is never ambiguous.
- Read `CorrectionDialog.tsx`/`SheetDialog.tsx` and confirmed the dialog wrapper structure
  (backdrop, `role="dialog"`, header/body/footer, focus trap, safe-area handling, scroll lock) is
  fixed regardless of which character opened it. One nit noted and accepted: inner content length
  does vary by character (conditional item/injury fieldsets), so the comment's phrasing
  ("doesn't depend on which character it's for") is a slight simplification — true of every
  audited check (all content-length-agnostic by construction), not literally true of DOM content.
  Not a defect; the identical comment was already accepted on the two sibling branches.
- `grep -rniI "rook" scripts/playtest/*.mjs` found no other instance of the same bug in
  `two-device-smoke.mjs` or `lan-up.sh`.

**Verdict: PASS**, no blocking finding.

## Independent source re-inventory of pop-out surfaces

Read the current source directly (not just cited prior findings) to confirm nothing new was
introduced since the last full reskin review (`docs/reviews/2026-09-18-sonnet-d-reskin-independent-review.md`)
or the sourcebook roster ship (`5e8907b`, which added two new inline buttons — "Mark and regain
Blood" in `ComposeStep2.tsx`, "Destroy Cowboy hat to ignore this result" in
`ChooseInjuryPanel2.tsx` — both plain `<button type="button">`s in normal document flow, covered by
the universal `button { min-height: var(--tap) }` rule in `styles.css`, not a new pop-out pattern):

- One modal: `SheetDialog.tsx` (portal, inert background, reference-counted scroll lock, focus
  trap, visual-viewport sizing), used only by `CorrectionDialog.tsx`.
- One disclosure: a native `<details>`/`<summary>` "Why?" pool explanation in `ComposeStep2.tsx`.
- Six native `<select>` elements, all in `SceneDirector.tsx`/`GmToolsPanel.tsx`, all
  `<label htmlFor>`-paired, browser-owned popups.
- No other pop-out pattern (no custom dropdown/combobox/menu/drawer).

## Live evidence (this session, against live staging `https://digitable.signal-bleed.com`)

- `npm ci` (worktree had no `node_modules`).
- `npm run check` — format, lint, typecheck clean; **690 passed | 11 todo** (71 files, 1 skipped).
- `npm run build` — clean (Functions esbuild 216.6kb; web build 138 modules; the existing
  non-blocking >500kB chunk-size warning only).
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **108/108** passed
  (18 `packages/testing`, 86 `apps/functions`, 4 `apps/web`).
- `node scripts/playtest/ui-audit.mjs --base https://digitable.signal-bleed.com` (post-fix) —
  **150 states, 1,422 controls audited, 0 control issues, 0 overflow states, 0 hard axe
  violations, 0 failures.** All 14 modal scenarios (phone/phone-small/landscape/tablet/desktop
  geometry, emulated on-screen keyboard, real pinch-zoom gesture, safe-area at three viewports,
  150%/200% text zoom) passed. The only non-gating notes, unchanged from every prior run: the
  320px+200%-text geometry limit on the correction sheet (accepted per
  `docs/reviews/2026-09-18-sonnet-d-reskin-independent-review.md` R3/N4) and the
  `page-has-heading-one` best-practice item on the nonexistent-room route (open for John since
  2026-09-18, F7).
- `node scripts/playtest/two-device-smoke.mjs --base https://digitable.signal-bleed.com --reload` —
  **17/17 steps passed**: create, isolated player/table admission, claim, opposed action,
  pause/resume, scene advance, reload recovery, and no horizontal overflow at
  375/768/1024/1280/1920px on all three roles. Zero console errors and zero failed requests on
  every device (`report.json`'s `consoleByDevice`). The one `-15px` "overflow" reading (table role
  at 1920px) is negative — no actual overflow — and matches the already-documented
  `scrollbar-gutter: stable` cosmetic non-issue (N9 in the reskin review).

Control-count variance (1,422 here vs. 1,470 on `sonnet-p`'s run) reflects normal state-dependent
variation in a live shared staging deployment (room/character state at audit time), not a
regression; both runs report 0 issues and 0 failures.

## Conclusion

No new user-visible mobile pop-out or responsive/accessibility/reskin defect was found. The one
source change made — porting the audit-tool selector fix — was necessary to make this session's own
audit tooling trustworthy on this branch; it is not cosmetic churn, and is independently reviewed
above. No `apps/web`, `packages/*`, `templates/*`, or `apps/functions` change was made or needed.

## Residual, physical-device-only limits (unchanged, still open for John)

- No physical iOS/Android device pass (real on-screen keyboard shrinking the *visual* viewport
  only, VoiceOver/TalkBack, Windows High Contrast) — headless Chrome cannot produce the iOS visual-
  viewport-only keyboard case (`Emulation.setVisibleSizeOverride` no longer exists); this is a
  documented, accepted limit of every audit run to date, not new.
- `page-has-heading-one` on the nonexistent-room route (F7) remains open for John; the reskin
  neither introduced nor fixed it.

## Resource note

Multiple sessions continue to re-run this same class of audit on an hourly cadence and reach the
same "no defect" conclusion against the actual deployed build. This session's contribution beyond
that record is the audit-tool port this specific branch was missing (without it, a "no defect"
result here would not have been trustworthy) plus a fresh, independently reviewed confirmation.
Whoever schedules the next audit should weigh this accumulated evidence against the cost of
continuing.
