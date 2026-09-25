# Utility-item action-button tap-target fix — independent review

- **Date:** 2026-09-24
- **Branch:** `sonnet-w/reskin-audit-20260925`
- **Commit reviewed:** `5663d7f` (parent `b599abd`)
- **Reviewer:** a fresh independent Sonnet review agent, no access to the author's reasoning
- **Verdict:** **approve**, no blocker

## Review scope

A narrow follow-up to the mobile pop-out audit recorded in
`CLAUDE_HANDOFF.md`'s "Independent audit: reskin mobile pop-out defect"
section. The audit found that the sourcebook roster feature (`5e8907b`) had
added two `<button>` elements — "Destroy Cowboy hat to ignore this result"
(`apps/web/src/player2/ChooseInjuryPanel2.tsx`) and "Mark and regain Blood"
(`apps/web/src/player2/ComposeStep2.tsx`) — with no `className` at all, so
neither got the reskin's `--tap` (48px) sizing or `touch-action:
manipulation`, regressing below the 44px WCAG 2.5.8 target on phones. Commit
`5663d7f` gives both buttons `className="link-button"` (an existing,
previously-unused-in-markup, already tap-sized inline-action style) and adds
a new static test to `apps/web/test/styles/reskinContract.test.ts` that
flags any class-less `<button>` outside the one documented
`.stepper-controls` exception.

The reviewer was asked to check semantics/behaviour preservation, privacy
and role/authorization surface, whether the fix and its new test are
correct, and to reproduce the author's gates independently.

## Findings

No blocking finding. The fix is exactly as narrow as described: only
`className` attributes were added to the two buttons, and the CSS/test
changes are additive. No file under `packages/*`, `templates/*`,
`apps/functions`, security rules, `styles.css`, `SheetDialog`, or any other
pop-out control was touched. No privacy, authorization, or command-dispatch
surface is affected — the buttons' `onClick` handlers are unchanged.

**Non-blocking, future robustness note:** the new static test's detection of
a "class-less" `<button>` is driven by a regex that looks for a
`className=` attribute anywhere in the opening tag. It does not
specifically handle a `<button className="">` or `<button
className={someEmptyExpression}>` — an explicitly-empty `className` would
still match `/className=/` and so would not be flagged as uncovered, even
though it carries no styling token at all. No control in the current
codebase does this (every real `className` in `apps/web/src` is either
absent or a non-empty class list), so nothing is missed today. Recorded here
as a known gap for the next person editing that test, not as a defect
requiring a fix now.

## Reproduced gates (independently run by the reviewer)

- `npm run check` — format, lint (zero warnings), typecheck, **691 tests
  passed | 11 todo** (71 files passed, 1 skipped) — matches the author's
  reported result.
- `npm run build` — clean (`apps/functions` esbuild bundle; `apps/web` vite
  build; the pre-existing non-blocking >500 kB chunk warning is unchanged).
- Mutation check: reverting either `className="link-button"` addition (one
  at a time) makes the new "never adds a `<button>` with no className at all
  outside `.stepper-controls`" test fail at the exact file/line touched,
  and restoring the addition makes it pass again — confirming the new test
  is load-bearing, not vacuous.

## Disposition

Approved for the independent-review gate `AGENTS.md` requires before a
non-trivial change is considered complete. This does **not** stand in for
the still-open, separately tracked requirement: a fresh real-browser
`scripts/playtest/ui-audit.mjs` run (or equivalent staging pass) has not
been produced for these two buttons, or for the "Recover your seat" form
added by `4083123`, because the last `ui-audit.mjs` evidence predates both.
See `CLAUDE_HANDOFF.md` for that open item; it remains mandatory before any
Hosting redeploy.
