# Independent review: mobile entry and audit coverage

- **Candidate:** `sonnet-cz/reskin-uiux-polish-20261002` from `origin/main` at `b599abd`
- **Authoring session:** isolated Sonnet session `47add76a`
- **Reviewer:** separate Codex pass, 2026-10-02
- **Scope:** mobile code/secret entry, recovery-code normalization, and the real-browser audit's recovery and correction-sheet coverage.

## Verdict

**Approve.** No blocking finding was identified.

## What was checked

- Recovery-code normalization removes only whitespace and folds case before a callable request. Recovery codes are generated upper-case from a whitespace-free alphabet, while server-side comparison remains exact; no credential, room, or member identifier is exposed or weakened.
- Code, passphrase, table-code, and GM machine-identifier inputs opt out of keyboard autocorrect/spellcheck. Secret fields also opt out of auto-capitalization; human-entered room/recovery/table codes request character capitalization. These are input-hint changes only and do not alter command, authorization, or projection state.
- The browser audit no longer assumes a retired display name to open the correction sheet. A contract test binds it to the live roster and rejects hard-coded roster names/ids in either browser harness.
- The audit now visits signed-out recovery entry, rejection, and a successful one-time redemption after all work requiring the old device binding. The route reset before redemption prevents React's same-hash component state from silently retaining recover mode.
- Regression tests cover lower-case/padded recovery entry, input attributes, roster-agnostic selector behavior, and audit ordering. The full browser audit verified all affected controls across the stated viewport matrix.

## Evidence reviewed

- `npm run check` — 703 passing, 11 existing todos.
- `npm run build` — passed; existing Vite chunk-size warning only.
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — 18 rules, 86 Functions, 4 web tests passed from a clean `demo-digitable` emulator run.
- `node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4176 --label cz-final --out /private/tmp/digitable-cz-final-audit` — 168 states, 1,548 controls, zero control or overflow findings, zero hard WCAG axe violations. The pre-existing non-gating `page-has-heading-one` best-practice note remains on the intentional missing-room screen.

## Residual manual evidence

Headless Chrome cannot validate iOS Safari's visual-viewport keyboard behavior, real mobile browsers, screen readers, or Windows High Contrast. The physical-device and assistive-technology rehearsal in `docs/PLAYTEST_TWO_DEVICE.md` remains required before deployment or merge.
