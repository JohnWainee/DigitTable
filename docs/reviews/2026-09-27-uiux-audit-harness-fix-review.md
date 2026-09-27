# UI/UX audit harness fix — independent review — 2026-09-27

## Scope

Independent verification of a fresh full-surface UI/UX audit against the live deployed
staging build (<https://digitable.signal-bleed.com>, base commit `b599abd`), covering
selects, menus, disclosures, modals, drawers, and allocation/action pickers across
phone/tablet/desktop/table layouts, dynamic viewport/on-screen-keyboard behavior,
safe-area insets, internal scrolling, 44px tap targets, page zoom/overflow, keyboard
navigation, reduced motion, GM/player/table projection semantics, and axe/WCAG checks.

## What was checked before touching anything

- A prior report dated 15:23 UTC 2026-09-27 (`/private/tmp/digitable-staging-playthrough-20260927-1527/report.json`)
  recorded `"ok": false` with zero steps executed (`"steps": []`) and no error detail — an
  early harness crash, not a reproduced application failure. Two full reruns already on
  disk at 07:25 and 06:27 UTC the same day (`digitable-staging-playthrough-20260927-root-follow-up`,
  `-codex-follow-up-final`) each passed all 17 GM/player/table steps with zero console
  errors and zero failed requests. A fresh independent run in this session
  (`node scripts/playtest/two-device-smoke.mjs --base https://digitable.signal-bleed.com --reload`)
  also passed 17/17, confirming the 15:23 result was a transient harness-launch failure,
  not a real, reproducible regression.
- A leftover untracked `two-device-run/` directory found in this worktree (from an earlier
  session, before `npm install` had been run here) showed a `FAIL` against
  `http://localhost:4173` with `ERR_CONNECTION_REFUSED` — the script's default `--base`
  with no local preview server running, not an application defect. Removed as noise.

## Finding: a real defect, in the QA harness, not the application

`scripts/playtest/ui-audit.mjs`'s `openCorrection` helper (used to open the GM's
roll-correction modal for the modal-geometry/focus-trap/safe-area audit across six
viewport cases) located the GM roster's "Correct" button by matching a roster-panel
`<li>` whose *rendered text* started with `"rook"` — the placeholder character's display
name before commit `5e8907b` ("feat: ship sourcebook character roster", 2026-09-19)
replaced the roster with the six real sourcebook characters (Iryna, Nicole, Cosgrave,
Chuck, Astrid, Flint). `templates/eat-the-reich/src/roster.ts` still uses the internal id
`"rook"` for stable-ID/save-compatibility reasons (documented in `state.ts`), but the
character's displayed `name` is `"Iryna"` — the old selector tested `li.textContent`, the
rendered name, not the internal id, so it could never match after the roster shipped.
This silently broke the entire correction-modal audit (dialog-inside-viewport, sticky
action-button visibility, focus containment, safe-area, overflow across
phone-small/phone/phone-landscape/tablet/desktop) for 8 days — the harness surfaced it as
a 20-second timeout (`"Rook's Correct button"`) rather than an application bug, and
because the failure aborted the flow, no evidence existed that the correction modal had
actually been re-verified against the live sourcebook-roster build.

## Fix

`openCorrection`'s selector now takes the first `.roster-panel-list li`'s button
directly, with no dependency on any character's display name. `apps/web/src/gm2/RosterPanel.tsx`
renders an identical `<li>` shape (name, status text, then a `Correct` button) for every
character, so this is structurally equivalent to the original intent, just decoupled from
a name that no longer exists. Confined entirely to `scripts/playtest/ui-audit.mjs` — a
dev/QA script, not application source; no risk to shipped behavior, authorization,
projection isolation, or any `AGENTS.md` boundary.

## Verification

- `npm run format` / `npm run lint` / `npm run typecheck` (via `npm run check`) — clean;
  **690/690** tests passed, 11 todo, 71 files passed/1 skipped (unaffected — this file is
  not part of any Vitest project).
- `npm run build` — Functions (esbuild) and web (`vite build`) both passed; the existing
  non-blocking large-chunk warning is unchanged.
- `node scripts/playtest/ui-audit.mjs --base https://digitable.signal-bleed.com --no-shots`
  — before the fix: 108 states audited, then a hard failure on the roster-name timeout.
  After the fix: **150 states, 1,542 controls audited, 0 control issues, 0 overflow
  states, 0 axe hard violations** (one pre-existing, non-gating axe best-practice note on
  the intentional nonexistent-room route, unchanged from prior baselines; a non-gating
  200%-text-zoom geometry note on one modal case, consistent with the documented 320px +
  200% text limitation already accepted as non-gating).
- `node scripts/playtest/two-device-smoke.mjs --base https://digitable.signal-bleed.com --reload`
  — 17/17 steps passed, zero console errors, zero failed requests.
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — **not run this
  pass**: ports 9099/8080/9000 were held by a concurrent worktree's emulator instance on
  this shared machine. This change touches no Functions/rules/engine/contracts code, so
  it carries no risk to that layer; the last recorded full emulator pass remains the
  relevant baseline and is unaffected.
- `git diff --stat` — one file changed (`scripts/playtest/ui-audit.mjs`), 2 lines; an
  incidental `package-lock.json` diff from this worktree's first `npm install` (npm
  removing stale `"peer": true` metadata on optional platform packages, no version or
  dependency-set change) was reverted as out of scope.

## Independent review

One round, by a fresh reviewer subagent given the diff, the root-cause claim, and the
repository's `AGENTS.md`: **approved, no changes requested.** The reviewer independently
confirmed the root cause (rendered name vs. internal id), grepped the repository for
other display-name-coupled staleness (`\brook\b`) and found none beyond the intentional
internal id and historical docs referring to the pre-`5e8907b` placeholder, verified the
fix is structurally equivalent to the original intent, confirmed the change touches only
the dev/QA script, and confirmed the roster is a fixed 6-entry set that is never emptied
(characters are claimed/downed/retired, never removed), so "first roster list item" is
deterministic across every state the modal audit exercises.

## Outcome

No defect in the shipped application was found across the requested surfaces at any
audited layout. The only real defect found — a stale, roster-name-coupled selector in the
UI audit harness that had been silently skipping the correction-modal audit since the
sourcebook roster shipped — is fixed, independently reviewed, and re-verified against live
staging with full coverage restored.
