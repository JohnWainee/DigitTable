# Independent review: reskin verification on candidate 888e5e1 (2026-10-03)

- **Scope:** `sonnet-do/reskin-orchestrated-20261003` at `888e5e1`. The author (Sonnet 5.5) ran the full evidence matrix and found **no source defect**; evidence in `docs/evidence/do-reskin-verification-20261003/`. One fresh read-only reviewer subagent, not the author, tried to falsify "no defect" in its own remapped emulator stack (ports 48xxx) and a copy of the repo for mutations.
- **Verdict:** approve as no-defect for the pop-out and layout surface. No High or Medium finding. Author's counts verified (288/3,448/0; 468/5,291/0; smokes 17/17; emulators 18+86+4).

## What the reviewer re-ran

`npm run check` (796 passed, 11 todo) and `npm run build`; `ui-audit-selftest.mjs` (28 ok); `ui-audit.mjs --modal-only` (23 sheet cases, 0 failures); an independent patched audit over 13 viewports (adds 280x653, 600x960, 667x375, 320x200 i.e. 400% zoom, 2560x1440) with 60-character session and 40-character names, clipped-text and `elementFromPoint` covered-control checks, and forced-colors / prefers-contrast / light-scheme re-runs: 468 states, 5,291 controls, 0 control, overflow, axe, clipped-text or covered-control failures. Real-browser mutations that failed the audit as they should: `--tap` 3rem to 2.5rem (1,048 failures), sheet max-height/overflow removed, sheet footer safe-area removed, dock sticky to static, select echo removed. 24 vitest mutations: 18 caught; the uncaught ones were the live-region roles (Low 1, fixed below), a select ellipsis (a browser-audit matter) and two invalid probes.

Pop-out inventory (matches the author's): 7 native selects (three with `SelectedOptionEcho`), one `<details>`, one `SheetDialog` user, `ActionDock` x4, radio groups x3; no tooltips, toasts, `<dialog>`, popover, listbox or clipboard feedback exists and a contract test forbids adding them.

## Findings and disposition

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| 1 | Low | `role="status"`/`aria-live` on `LiveRegion` and `ConnectionStatusStrip` had no regression test (deleting them left every test green) | **Fixed**: `apps/web/test/accessibility/statusSemantics.test.tsx` (6 tests; all 6 fail with the attributes removed) |
| 2 | Low | Disabled `.primary-action` / `.secondary-action` label is 12px (`styles.css:458-463`) | Not changed: target stays >= 44px, `--mute` on `--ink-3` is 5.35:1, and the dock status states why the button is off. Design note for John |
| 3 | Low | Contrast unit tests omit pairs riot/ink-3 (4.47:1) and riot-deep/ink-2 (3.06:1) | Not changed: no text uses those pairs today (`--riot` text is only on ink-0/ink-2 at 4.99-5.65:1). Add them to `reskinContract.test.ts` if such text is introduced |

Also noted, not changed: character-name selects in `GmToolsPanel` have no echo (fixed roster fixtures; the harness truncation check passes at 280px); the Choose-injury dock is reached by the browser audit only when the random roll injures; text drawn directly over the grain/halftone/glow is not checked by axe (the existing streak test covers the streak only).

## Evidence honesty

Staging serves a 19 Sep 2026 bundle (`index-D8nuHDtl.js`), different from the candidate, so the staging 17/17 is a deployed-build observation only. The extra-viewport audit was an uncommitted scratch copy of `ui-audit.mjs` (only five added entries in `VIEWPORTS`); the reviewer reproduced it independently on a different matrix with identical totals. Not verifiable here: real iOS Safari / Android Chrome, VoiceOver/TalkBack, the OS `<select>` popup, a true on-screen keyboard.
