# Independent review — mobile text-entry hints (`sonnet-fi`, 2026-10-06)

Reviewer: a fresh-context subagent (not the author), read-only, given the uncommitted diff and `AGENTS.md`. It ran the new vitest file (6/6), `tsc -p apps/web --noEmit` (clean) and eslint on the touched files (clean); it did not run the Swift rig.

**Verdict: approve with fixes (documentation/evidence only). No P1.**

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | No behaviour change: only `autoCapitalize`/`autoCorrect`/`spellCheck`/`autoComplete` are spread; no handler, validation, payload, projection or engine change; `packages/` and `apps/functions` untouched; submit-time `toUpperCase()` unchanged. | Confirmed. |
| 2 | Every `<input type="text">` in `apps/web/src` judged: passphrases, room/table/recovery codes and GM item/member ids locked; names and reasons correctly left as prose; nothing missed. | Confirmed. |
| P2 | No "after" evidence in the tree; handoff and review record missing. | Fixed: evidence, handoff and this record added before commit. |
| P2 | `keyboardIsShifted` (`keys["Q"].exists`) is a heuristic tied to iOS keeping capitals after the first letter in `characters` mode (observed, not guaranteed). | Accepted; documented in the Swift comment and README as observed behaviour. |
| P3 | Test header overstated what was measured ("Cowboy-hat", "rejected entry", passphrase wording). | Fixed: header and `textEntry.ts` comment now state the measured values only. |
| P3 | `textEntry.ts` claimed Android keyboards; unverified. | Fixed: softened to iOS Safari measured, others unverified. |
| P3 | Tautological presets test; brittle hard-coded UI strings; fixed `sleep(1)`; `teh` autocorrect only truly exercised on the join passphrase. | Accepted; the real contract is the per-screen attribute tests, and the README states which cases showed capitalisation vs correction. |
| P3 | Pasted lowercase recovery code still rejected; `.toUpperCase()` on submit would change the sent value. | Out of scope; recorded as a follow-up for John. |

Second pass: the author re-ran format/lint/typecheck/tests after the comment fixes (see handoff). No further reviewer round was needed because the fixes were wording only.
