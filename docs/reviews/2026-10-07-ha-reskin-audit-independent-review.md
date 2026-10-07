# Independent review: ha reskin audit (2026-10-07)

Reviewer: fresh-context subagent (read-only; did not author the change). Scope: Back-dismiss cherry-pick, narrow-width checkbox-row CSS, `ui-audit.mjs` changes.

**Verdict: no blocking findings.**

- Cherry-pick of `218bfea` (`useBackDismiss.ts`, its test, `sheet-history-probe.mjs`) is byte-identical; the `SheetDialog.tsx` hunk is the import, one call, one doc line. StrictMode, Back, Cancel/Apply/Escape and single-sheet lifecycles traced correct.
- CSS changes only `gap` and `padding-inline`; `min-height: var(--tap)` untouched, so the 44px target cannot shrink. All uses of `.gear-option` / `.form-field--checkbox` receive harmless tightening.
- Invariants: only `apps/web/src` and `scripts/playtest` touched; no Firebase, engine, contracts, template, secret, asset or dependency change.

Non-blocking notes and dispositions:

1. `max-width: 24rem` in a media query resolves against the browser default size (384px at 100% text, wider as text is scaled), so it also tightens 375px phones. Cosmetic (0.35rem). **Fixed:** the CSS comment now says so.
2. `openCorrection` matched any roster button. **Fixed:** it now matches a button whose text is "Correct".
3. Gating claims rest on the audit run. **Re-run after fixes:** `--modal-only` audit passes with 320px/200% checks gating.

No CSS unit test exists; the real-browser 320px/200% audit scenario is the regression gate.
