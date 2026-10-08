# HP reskin independent review

- **Date:** 2026-10-08
- **Branch:** `sonnet/hp-reskin-orchestrated-20261008`
- **Range:** `b599abd..04a079f`
- **Reviewer:** Codex, independently of the Sonnet implementation pass
- **Verdict:** **Approve** — no blocking correctness, accessibility, privacy, authorization, or scope findings.

## Scope and method

Reviewed the ink-punk presentation pass and its regression coverage: compact mobile correction
sheet behavior, browser/OS Back dismissal, sticky player action docks, item-row semantics,
GM pending-action hierarchy, stylesheet contracts, and the real-browser audit additions. The
review also checked `git diff --check`, the complete changed-file diff, the evidence manifest,
and that the change does not touch engine/contracts/template rules, projections, authorization,
Firebase configuration, or licensed content.

## Findings

No blockers or required changes were found.

The implementation preserves the existing dialog focus/inert/scroll-lock lifecycle while adding
a same-URL history entry only for the open sheet. Its tests exercise Back, Cancel, Escape, an
immediate reopen, and React StrictMode. The compact container-query path makes the full sheet
scrollable when visible height is constrained, and the audit verifies the relevant geometry in a
real browser. The action dock has a short-height fallback and scroll padding so it cannot obscure
focused controls. The former nested button/label relationship is removed and protected by a
source-level regression test.

## Independent verification

- `npm run check` — passed: format, lint, typecheck, **701 passed / 11 todo** (72 files passed,
  1 skipped).
- `npm run build` — passed for Functions and web; the existing Vite large-chunk warning remains
  non-blocking.
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — passed: **18** testing,
  **86** Functions, **4** web tests.
- `node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:24174 --label independent-review
  --out /private/tmp/digitable-hp-independent-ui-audit --port 29450` — passed: **150 states**,
  **1,566 controls**, zero control issues, overflow states, axe hard violations, and failures.
  The intentional nonexistent-room `page-has-heading-one` best-practice note and the documented
  non-gating 320 px / 200% text geometry observations remain.
- `node scripts/playtest/two-device-smoke.mjs --base http://127.0.0.1:24174 --out
  /private/tmp/digitable-hp-independent-smoke --port 29460 --reload` — passed all **17**
  GM/player/table steps, including responsive overflow, projection propagation, resolution,
  pause/resume, and reload recovery.

## Remaining release evidence

This branch remains unmerged and undeployed. Browser automation cannot prove iOS Safari's
visual-viewport-only keyboard behavior, physical iPhone/Android behavior, VoiceOver/NVDA, or
Windows High Contrast. Those are release-evidence follow-ups, not a reason to misrepresent this
local candidate as staged.
