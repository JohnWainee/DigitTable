# Phase 1A implementation review and resolution

- **Reviewed branch:** `codex/phase-1a-scaffold-engine` at `42f21e8`
- **Against:** `main` at `b9ae9f2`
- **Date:** 2026-09-12
- **Resolution status:** Independently verified at `5c197f8`; merged in PR #4 as `6de3ad6`

## Review result

The scaffold, package boundaries, deterministic generator, authorization checks, size fixtures,
and original placeholder content were sound, and all 105 tests passed. The review found six
blocking correctness/privacy gaps.

| Finding | Severity | Resolution |
|---|---|---|
| I1 — `runCommand` stamped command IDs but did not suppress duplicate execution | High | Added a hidden-data-free actor-private accepted-command receipt to the pure harness. A caller that finds the receipt transactionally supplies it; the harness returns the unchanged current authority, the original stable receipt result, and no new envelopes, without authorization, decision, reduction, or another random draw. Added a retry regression test with a random source that throws if touched. |
| I2 — shared dice-face count disclosed the exact hidden GM modifier | High | Shared `ActionRolled` copies now redact both the modifier and faces whenever a hidden adjustment was applied. Non-GM projections likewise expose `playerFaces: null`; the GM retains the committed faces. Added event-copy, projection, and property assertions. |
| I3 — current-schema parsing/migration discarded active rolls | High | Added complete structural parsing for roll state, including optional opposition, allocation, and result fields. Added an active-roll JSON round-trip regression test. |
| I4 — duplicate allocation IDs were charged multiple times but only applied once | Medium | Reject duplicate option IDs before cost/effect calculation and cover the rejection in `decide` tests. |
| I5 — repeated gear IDs inflated the player pool | Medium | Deduplicate requested gear IDs before summing carried/action-relevant bonuses and cover repeated IDs in pool tests. |
| I6 — event and view schema functions performed unchecked casts | Medium | Replaced casts with nested structural validation of every event variant and the complete viewer shape. Added malformed known-event and nested-view rejection tests. |

## Verification

An independent second pass on 2026-09-12 verified all six dispositions against commit
`5c197f8` with no blocking findings. `git diff --check` was clean, no dependency changes were
introduced by the remediation, and the full quality gate passed before PR #4 was merged.

After the fixes:

- `npm run format` — clean
- `npm run lint` — clean, zero warnings
- `npm run typecheck` — clean across all four workspaces
- `npx vitest run` — 111/111 tests pass across 19 files

No React/Vite client, Firebase dependency, renderer, licensed content, or generic rules DSL was
introduced. A second independent pass should verify these dispositions before merge.
