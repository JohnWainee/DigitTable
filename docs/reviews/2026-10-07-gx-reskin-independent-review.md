# gx reskin independent review

- **Date:** 2026-10-07
- **Reviewed:** uncommitted gx working tree on `ccb9f2d` (branch `sonnet-gx/reskin-orchestrated-20261007`)
- **Reviewer:** a fresh general-purpose agent session, independent of the implementing session. Static review plus `npx vitest run apps/web` (35 files / 293 tests passed); it did not run the browser audit.
- **Verdict:** APPROVE. No blockers.

## Findings and resolution

| Finding | Severity | Resolution |
| --- | --- | --- |
| No behaviour, privacy, projection or authorization change; the only TSX change is an `aria-hidden` echo of a title already shown as an `<option>` | confirmed | none needed |
| Sheet footer excluded from the tall-primary rule (child combinators only); 320×312 keyboard case untouched | confirmed | pinned by a stronger contract test (selector list must contain no `sheet` and only `>` combinators) |
| `expect(rule.join()).toBeDefined()` vacuous; sheet-exclusion regex too narrow; crop-mark title over-claimed | non-blocking | removed / replaced / retitled |
| `.step, .invite-panel` shadow overrode the invite panel's loud riot/acid shadow | non-blocking | restored with a dedicated `.invite-panel` rule |
| `--sun` token unused | non-blocking | removed with its test |
| Audit inventory could silently find zero selects/disclosures | non-blocking | audit now fails if `gm-console` finds no select or `player-compose` no disclosure |
| `::after` crop marks lack the `::before` multi-column guard; marks can brush the primary button shadow at 320 px | non-blocking, cosmetic | accepted: `break-inside: avoid` holds in the audited layouts (150 states, no overflow); revisit if a step ever fragments |
| Fieldset top border 2→3 px (1 px per fieldset inside the sheet) | non-blocking | accepted; sheet geometry scenarios still pass |
| Audit `echoed` is per-parent and `truncated` is a heuristic; `dialogs` collected but unasserted; gm-console details not opened | non-blocking | accepted and documented; the existing modal audit remains the sheet's gate |

## Verification after the fixes

`npm run check` 720 passed / 11 todo; full `ui-audit.mjs` rerun on the final build: 150 states, 1,470 controls, 12 pop-out sweeps, zero failures; `two-device-smoke.mjs --reload` 17/17; emulator suite 18 / 86 / 4 passed (run before the small post-review edits, which touch only CSS, one test, and the audit script).

Evidence limits are unchanged: no physical-device, assistive-technology, Windows High Contrast or staging evidence.
