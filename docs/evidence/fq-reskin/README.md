# fq reskin and pop-out evidence (2026-10-06)

Branch `worktree-digitable-sonnet-fq-reskin-uiux-20261006`, from `b599abd` (the deployed roster build). Everything here ran against a **local** Firebase emulator stack (`demo-digitable`) and local `vite preview` builds, except the one staging smoke noted below. Nothing was deployed.

- `before/` — the unmodified `b599abd` build. `after/` — this branch (`b95d16c` plus review fixes, if any). Same states, same four widths: `phone` 375×812, `tablet` 768×1024, `desktop` 1280×800, `table` 1920×1080 (downscaled to ≤1000 px). The audit itself also ran `phone-small` 320×568 and `phone-landscape` 812×375.
- `reports/ui-audit-before.json` / `ui-audit-after.json` — machine-readable output of `scripts/playtest/ui-audit.mjs`. `ui-audit-after.json` is the full run on the final hook: every state/viewport check passed, and its single failing scenario check was a wrong assertion in the audit itself (`history.length` stays flat when a push truncates leftover forward entries), fixed in the script; `ui-audit-after-modal-final.json` is the `--modal-only` re-run with the corrected script and passes every pop-out scenario.
- Extra pop-out frames: `gm-correction-short-visible-140.jpg` (320×140 visible), `gm-correction-short-visible-160-landscape.jpg` (667×160), `gm-correction-keyboard-phone-landscape.jpg` (812×206, emulated keyboard).
- Smoke reports are **not** committed: they contain the throwaway room codes of the rooms they created.

## How it was produced

```bash
# APFS clone outside ~/Documents (esbuild hangs in worktrees there), then:
npm ci
npm run build --workspace @digitable/functions
VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_AUTH_DOMAIN=demo-digitable.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=demo-digitable VITE_FIREBASE_APP_ID=1:000000000000:web:demo \
VITE_FIREBASE_USE_EMULATOR=true npx vite build --outDir /private/tmp/dist-after   # from apps/web
PATH=/opt/homebrew/opt/openjdk/bin:$PATH npx firebase emulators:start --only auth,firestore,functions --project demo-digitable &
npx vite preview --outDir /private/tmp/dist-after --port 4174        # from apps/web
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4174 --label after --out /private/tmp/audit-after
node scripts/playtest/two-device-smoke.mjs --base http://127.0.0.1:4175 --out /private/tmp/fq-local-smoke --reload
```

## Results

| Check | Before (`b599abd`) | After |
| --- | ---: | ---: |
| State × viewport captures | 150 | 150 |
| Control findings (<44 px, outside viewport, text entry <16 px) | 0 | 0 |
| States with horizontal overflow | 0 | 0 |
| axe hard violations (real colour contrast) | 0 | 0 |
| axe best-practice notes | `page-has-heading-one` on the nonexistent-room route | same (intentional, unchanged) |
| Audit failures | 0 | 0 |
| New pop-out scenarios (Back closes only the sheet; 320×140 and 667×160 visible) | not present | pass |

Two defects were found by the new scenarios and fixed before the final run, which is why the scenarios exist:

1. The first container-query threshold (11 rem) un-pinned the sheet at 812×206 (the container query measures the backdrop's **content box**, i.e. after its padding), pushing Apply/Cancel below the fold in the landscape-keyboard case. Threshold lowered to 10 rem and re-measured at 812×206 (pinned, actions visible), 812×180 and 320×140 (one scrolling page, actions reachable).
2. The first `useBackDismiss` compared `history.state` by object identity. That passes in jsdom and fails in every real browser (the state is a structured clone), so the sheet's history entry was never removed on Cancel. Fixed with a token inside the state; a jsdom test now stubs `history.state` to return clones.

Staging: `two-device-smoke.mjs --base https://powerglove-1cd23.web.app --reload` passed all 17 steps against the **currently deployed** build and live staging backend. That deployed build does not contain this branch; a staging run of this branch needs the staging web API key, which this session was not permitted to read. See `CLAUDE_HANDOFF.md`.

## Limits

Headless Chrome only: no real iOS Safari/Android keyboard pass (the visual-viewport-only keyboard case is covered in jsdom and by `--vv-*` use under pinch-zoom), no VoiceOver/TalkBack/NVDA, no Windows High Contrast run (forced-colors is asserted in CSS only), no physical device.
