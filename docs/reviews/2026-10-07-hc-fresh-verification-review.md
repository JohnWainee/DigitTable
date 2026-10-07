# hc fresh verification of `cb6bec5` — independent review (2026-10-07)

Scope: verification only, **no source change**. Candidate `cb6bec5` (fy closed-sheet 320 px / 200% text fix on the reskin lineage). Local Firebase emulators and local `vite preview` only; nothing deployed, no production resources.

## Results (author)

- `npm run check`: format, lint, typecheck, **717 passed**, 11 todo.
- `npm run build`: passed (existing chunk-size warning only).
- Emulator suites (`firebase emulators:exec`, private port range 4xxxx because peer lanes hold the defaults): **18 rules + 86 Functions + 4 web** passed.
- `two-device-smoke.mjs --reload` against local emulators: **17/17**, no overflow at 375/768/1024/1280/1920, 0 console errors.
- `ui-audit.mjs`: **150 states, 1,494 controls**, 0 control issues, 0 overflow states, 0 axe hard violations, 0 failures (only the intentional `page-has-heading-one` on the nonexistent-room route).
- Evidence: `docs/evidence/hc-fresh-verification/`.

## Independent review (separate read-only subagent): no blocking findings

- Smoke and audit reports support the claims; closed-sheet 320/150, 320/200, 375/200 scenarios present with preconditions true and 0 px overflow; the 320/200 informational exemption is gone. The reviewer could not re-verify check/build/emulator numbers (not in the rig dir) — those are author-run.
- Low: `min(rem, vw)` padding caps tighten padding at 320 px only; tap targets, forced-colors unaffected.
- Low / unconfirmed: the closed-sheet audit block does not reset `documentElement.style.fontSize`; no failures resulted. Backlog.
- Nit: the contract test asserts CSS text, not layout; the audit is the real gate.
- AGENTS.md boundaries: no engine/contracts/template/Firebase/licensed-content change.

## Caveat

The audit ran in a worktree where another session had an **uncommitted** edit to `scripts/playtest/ui-audit.mjs` (`--root-px`, `--extra-viewports`, offender naming; defaults unchanged). That edit is not in this commit.
