# fq reskin final independent review

- **Date:** 2026-10-06
- **Reviewed commit:** `9c6d254` (`worktree-digitable-sonnet-fq-reskin-uiux-20261006`), compared with the initial reviewed commit `b95d16c`
- **Reviewer:** Codex, fresh automation pass, independent of the original Sonnet implementation session
- **Verdict:** approve for integration consideration; no blocking correctness, privacy, accessibility, or responsive-layout finding.

## Scope checked

The post-review delta was traced directly. It changes only the presentation-layer
`useBackDismiss` hook, its regression tests, two small CSS cleanups, the browser audit
assertions, and evidence/handoff text. It does not change engine, template, contracts,
Functions, Firestore/RTDB rules, projections, authorization, or content provenance.

The review specifically checked the history token rather than object identity, the
deferred-pop race when a new sheet opens during an old sheet's close, topmost dismissal
when multiple sheets are mounted, StrictMode remount handling, and the audit's short
visual-viewport assertions. The implementation keeps each sheet's Back handling local to
the same-document history entry and does not read or mutate session state.

The accepted low-severity limitation remains: a reload or `replaceState` while a sheet is
open can leave one harmless same-URL history entry, so the next Back may appear inert.
It does not navigate away, reveal data, or affect the current sheet's controls.

## Independent verification

All commands below ran in an isolated APFS worktree at `9c6d254` on 2026-10-06.

| Check | Result |
| --- | --- |
| `git diff --check b95d16c..9c6d254` | clean |
| `npm run check` | passed: format, lint, typecheck, **714 passed / 11 todo** across 75 files (74 passed, 1 skipped) |
| `npm run build` | passed; existing Vite >500 kB chunk warning only |
| `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` | passed: **18** rules/testing, **86** Functions, **4** web tests |
| `ui-audit.mjs` on a local Auth/Firestore/Functions emulator build | passed: **150** states, **1,494** controls, **17** modal scenarios, zero control issues, overflow states, axe hard violations, console errors, or failed requests |
| `two-device-smoke.mjs --reload` on that same local build | **17/17** GM/player/table steps passed; zero responsive overflow checks failed across 375/768/1024/1280/1920 px |

The browser audit records one pre-existing, non-gating `page-has-heading-one` best-practice
note for the intentional nonexistent-room route and logs the known 320 px / 200% text
modal geometry observation without treating it as a failure. Neither is introduced by
this post-review delta.

## Remaining evidence limits

This candidate was not deployed. The 17/17 staging smoke in the lane documents the
already deployed build, not this candidate. A physical iOS Safari / Android keyboard,
assistive-technology, and Windows High Contrast pass remains required before claiming a
public-release accessibility sign-off.
