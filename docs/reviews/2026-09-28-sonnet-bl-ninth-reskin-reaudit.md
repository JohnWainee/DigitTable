# Ninth independent mobile pop-out re-audit: no new defect, all gates and live evidence reconfirmed fresh at this branch's own HEAD (branch `sonnet-bl/reskin-hourly-20260928`, 2026-09-28)

- **Branch:** `sonnet-bl/reskin-hourly-20260928`, based on `f879e0d` — the exact tip that already
  carries `sonnet-bk`'s two independently-reviewed re-fixes (the roster-agnostic
  `ui-audit.mjs` correction-sheet selector, `56797e7`, and the class-less utility-item
  tap-target buttons, `f879e0d`). This session made **no source change**.
- **Scope of the ask:** independently verify the deployed staging playthrough evidence is not
  being mistaken for evidence that this branch's source is deployed; audit the actual current
  source at phone (320/375), landscape/dynamic-keyboard, tablet, desktop, and table widths across
  every select/menu/details/modal/drawer/option-list/action/allocation control for visual
  viewport/safe-area handling, internal scroll, 44px targets, context/focus visibility, keyboard
  and touch paths, no horizontal overflow/page zoom, reduced motion, WCAG contrast/axe, role
  semantics, and GM/player/table privacy/authorization; implement a narrow fix only if a real
  defect is found, otherwise record evidence without churn.

## Part A: staging-evidence-vs-source conflation check

Read `CLAUDE_HANDOFF.md` end to end, including every entry after the two known fixes
(`## Automation staging re-verification (2026-09-28)`, the seventh and eighth independent
mobile pop-out re-audits). Every staging-evidence entry explicitly and consistently distinguishes
the **deployed** commit (`5e8907b`, serving `https://digitable.signal-bleed.com` /
`https://powerglove-1cd23.web.app`) from the **source candidate** commit under review (this
branch's `f879e0d`), e.g. line 18 ("This is live deployed-build evidence, not evidence that the
newly integrated source change was deployed"), line 19 ("it does not deploy this harness-only
source change"), and line 569 ("The source candidate has not been deployed"). No entry anywhere
in the file asserts or implies that `f879e0d`/`56797e7`'s fixes are live on staging. **Finding:
no conflation exists to correct.**

## Part B: independent re-confirmation of the reskin and pop-out system, first-hand

Before trusting the eight prior "no defect" passes, this session re-derived the same facts
directly from the code at this branch's own `HEAD` (`f879e0d`):

- Fresh grep for the full pop-out-shaped-markup inventory
  (`<select|<details|<dialog|role="dialog|role="menu|role="listbox|role="tooltip|popover|aria-haspopup|position:\s*fixed|position:\s*absolute`)
  across `apps/web/src` returns exactly the same six `<select>`s (`GmToolsPanel.tsx` x4,
  `SceneDirector.tsx` x2), one `<details>` (`ComposeStep2.tsx`), and one `role="dialog"`
  (`SheetDialog.tsx`) every prior pass found — no new or hidden control exists.
- Confirmed `--tap: 3rem` (48px, exceeding the 44px WCAG 2.5.8 minimum) is still the sizing
  token, and that both previously-class-less utility-item buttons
  (`ChooseInjuryPanel2.tsx:83`, `ComposeStep2.tsx:161`) now carry `className="link-button"`,
  which resolves through `.link-button, .stepper-controls button { min-height: var(--tap);
  min-width: var(--tap); }` (`styles.css:381-384`) — the fix is genuinely present in the
  rendered markup at this branch's own tip, not merely claimed in prose.
- Confirmed `scripts/playtest/ui-audit.mjs`'s `openCorrection()` targets
  `.roster-panel-list button` by exact text `"Correct"` and `!b.disabled`
  (`ui-audit.mjs:430`), matching `RosterPanel.tsx:19,32`'s actual markup
  (`<ul className="roster-panel-list">` → `<button>Correct</button>`) — the selector fix is
  also genuinely present and wired to the real DOM, not just described.
- Spot-checked `styles.css` for the other load-bearing claims eight prior sessions made: safe-area
  insets (`env(safe-area-inset-*)`) applied at multiple breakpoints including the sheet backdrop
  and footer; `prefers-reduced-motion: no-preference`/`reduce` both gated; the `dvh`-behind-`@supports`
  fallback pattern for the visual-viewport-sized sheet, matching the documented rationale exactly.

**Conclusion for Part B: no new defect, confirmed first-hand at this exact commit** — agreeing
with all eight prior independent passes, this time re-derived from this branch's own `HEAD`
rather than cited from a sibling branch's history (the exact class of gap the seventh and eighth
re-audits found and fixed elsewhere in this file).

## Verification (this session, fresh, at `f879e0d`)

- `npm install` — clean (fresh worktree had no `node_modules`).
- `npm run check` — **708 passed | 11 todo** (75 files passed, 1 skipped), matching the eighth
  re-audit's post-fix count exactly, confirming no regression and no drift.
- `npm run build` — clean; `@digitable/functions` 216.6kb; `@digitable/web` 138 modules, CSS
  23.32kB, JS 897.98kB / gzip 259.60kB — matching the eighth re-audit's build output byte-for-byte
  aside from the expected content-hash filename churn.
- `git diff --check` — clean.
- **Live evidence, built fresh in emulator mode and served via a separate local `vite preview` on
  port 4199, against the pre-existing shared local `demo-digitable` Auth/Firestore/Database
  emulator stack** (confirmed via `ps`/`lsof` to be an unrelated, ~2-day-old, long-running process
  from a different worktree, `sonnet-aj-reskin-hourly-20260926`; not started, not disturbed, and
  stopped its own `vite preview` process afterward without touching the emulator):
  - `node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4199 --no-shots` —
    **150 states, 1578 controls audited, 0 control issues, 0 overflow states, 0 hard axe
    violations, 0 failures — PASSED.** Only the same two already-documented non-gating notes every
    prior review recorded (`modal-text-200-phone-small` dialog-inside-viewport/no-page-overflow at
    the 200%-text-scaling extreme; the intentional nonexistent-room route's best-practice heading
    nit) — no new finding.
  - `node scripts/playtest/two-device-smoke.mjs --base http://127.0.0.1:4199 --reload --no-images` —
    **17/17 steps passed** (`ok: true`, `deviceFailures: []`). Inspected the JSON report directly:
    zero console errors and zero failed requests on all three devices (`gm`/`player`/`table`), and
    `responsiveOverflow` is zero or negative (margin, never overflow) at every one of
    375/768/1024/1280/1920px on all three devices.
- Firebase emulator suite (`npm run test:emulator`): **not rerun standalone.** Ports
  8080/9000/5001/9099 were held for this session's entire duration by the same unrelated
  long-running worktree process named above (confirmed via `ps -p`, showing >2 days elapsed,
  clearly a legitimate concurrent session, not an abandoned process). This session's diff against
  the last emulator-verified state touches no file under `packages/testing`, `apps/functions`,
  `firestore.rules`, or `database.rules.json` (this session made no source change at all), so the
  last recorded **108/108** result (18 testing + 86 Functions + 4 web) is unaffected and stands,
  per the same reasoning the seventh and eighth re-audits recorded.

## Independent review found and this session fixed: an undisclosed harness-hygiene gap

A fresh, isolated reviewer agent independently re-verified every claim above from the actual repo
state (diff scope, both fix claims by direct source read, the pop-out inventory grep, the gate
counts) rather than trusting this session's narrative, and found one real discrepancy: this
session's own earlier `node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4199 --no-shots`
run (Part B/Verification above) was invoked without `--out`, so it defaulted to writing
`ui-audit-run/report.json` into the worktree root (`scripts/playtest/ui-audit.mjs`'s own default,
`arg("out", "ui-audit-run")`). That leftover, untracked JSON artifact was never gitignored the way
`.vitest/`'s equivalent leftover already is (`.gitignore`'s own comment: "Vitest JSON reporter
output — never committed; trips `prettier --check` otherwise") — so it silently broke `npm run
check`'s `prettier --check .` step for any later run against this exact worktree, even though the
test counts underneath it were genuinely accurate. The reviewer confirmed removing it made `npm
run check` pass exactly as claimed (708 passed | 11 todo, 75 files passed | 1 skipped).

**Fix:** deleted the leftover `ui-audit-run/` directory and added `ui-audit-run/` to `.gitignore`,
directly alongside the existing `.vitest/` entry, with a comment naming its source (mirrors the
precedent exactly, closing the same class of gap for any future session running `ui-audit.mjs`
without `--out`). Re-ran `npm run check` after the fix: clean, **708 passed | 11 todo** (75 files
passed, 1 skipped), matching the original claim now reproducibly. The reviewer also flagged
harmless `package-lock.json` metadative churn (stray `"peer": true` flags removed by this session's
fresh `npm install`) left uncommitted in the worktree; discarded via `git checkout -- 
package-lock.json`, following this project's own established precedent of not committing such
lockfile churn from a session-local install (recorded in this file's Phase 2 PR 1 section).

## Disposition

**No new reskin/pop-out defect found; no `apps/web` production source, test, engine, contracts,
template, Functions, or rules file changed.** Both real defects this project has previously found
in this area (the roster-agnostic selector, the class-less utility-item buttons) are independently
reconfirmed present and correctly wired at this branch's own `HEAD` (`f879e0d`), not merely
asserted by prose. All required gates (`npm run check`, `npm run build`) and both live playtest
harnesses (`ui-audit.mjs`, `two-device-smoke.mjs`) pass cleanly against a fresh local build of this
exact commit. The staging-evidence entries in `CLAUDE_HANDOFF.md` correctly and consistently
distinguish deployed-build evidence from source-candidate state; no conflation was found to
correct. The one real finding this pass produced was in its own evidence-generation hygiene, not
the application: a missing `.gitignore` entry for `scripts/playtest/ui-audit.mjs`'s default output
directory, found by independent review and fixed the same way the analogous `.vitest/` gap was
already closed. No merge, deploy, resource creation, or promotion occurred. Physical-device
evidence (real iOS/Android hardware, real Safari visual-viewport keyboard behavior) remains the one
open item for John, unchanged by this pass.
