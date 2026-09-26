# Independent review: fresh-identity recovery audit regression coverage (2026-09-26)

## Scope

Review the uncommitted `scripts/playtest/ui-audit.mjs` addition that extends the
emulator-backed, multi-browser UI audit with the seat-recovery flow. This is
test-harness coverage only: no application, Functions, rules, contracts,
engine, template, or asset source changes are in scope.

## First pass findings

| Finding | Severity | Disposition |
| --- | --- | --- |
| The rejection path used an unknown room and a forged code, proving only room-not-found behavior. | P1 | Fixed: it now submits a forged code for the real room. |
| The successful recovery path did not assert a replacement code or reject the spent code. | P1 | Fixed: it asserts the replacement differs, clears identity again, and proves the original code is rejected. |

## Re-review

Approved after remediation. The harness creates a disposable player seat in
the isolated `anon` browser context, reads its display-once code, clears that
context's origin storage, and reloads before recovery. GM, player, and table
remain in their own CDP browser contexts. The corrected flow checks real-room
forged-code rejection, verifies a distinct replacement code after recovery,
and verifies the spent original code is denied from a second fresh identity.
Recovery states are captured through the same viewport, target-size, overflow,
axe, console, and network gates as the rest of the audit.

No privacy or accessibility regression was found. The harness does not log or
persist a recovery code outside its disposable browser run and JSON report.

## Verification

- `npm run check` — passed: format, lint, typecheck, **703** active tests,
  **11** todo.
- `npm run build` — passed; only the established non-blocking Vite chunk-size
  warning.
- `node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4174 --label sonnet-as-recovery-rotation --out /private/tmp/digitable-sonnet-as-recovery-ui-audit-rotation --port 9804 --no-shots` — passed: **174** states, **1,566** controls, zero control issues, overflow states, hard axe violations, console/request failures, or gating failures. The documented 320px/200%-text geometry notes remain informational only.
- `git diff --check` — clean.

The shared emulator stack had stale throttle state from unrelated prior runs:
the direct suite attempt passed **18/18** rules and **4/4** web tests but
rate-limited four Functions tests before their assertions. It is not treated
as valid clean emulator evidence. This change does not touch the affected
surfaces; the last valid full **108/108** emulator result remains applicable.

## Disposition

Approve the narrow regression-coverage change. Do not merge, deploy, create
resources, or treat browser emulation as a replacement for the outstanding
physical iOS/Android rehearsal.
