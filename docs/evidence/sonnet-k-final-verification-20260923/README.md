# Reskin final verification: independent re-run of the mobile/a11y audit (2026-09-23)

Branch `sonnet-k/reskin-final-verification-20260923`, HEAD `eedab53`. This is a fresh, independent re-run of `scripts/playtest/ui-audit.mjs` against this exact candidate, produced to independently verify (not merely re-cite) `docs/evidence/uiux-reskin-20260920/`. No source code changed in this session — the last source-changing commit on this branch is `c180820`; everything after it (through `eedab53`) is documentation. Ran against a **local** Firebase emulator stack (`demo-digitable`, fake project: Auth, Firestore, Functions) and a local `vite preview` build. Nothing was deployed; staging (`powerglove-1cd23`) and production were not contacted. Independent review: `docs/reviews/2026-09-23-sonnet-k-reskin-final-verification-review.md`.

- `report.json` — the full machine-readable report from the run whose numbers are current below (regenerated a second time in this same session, after the independent review; see "Two runs" below).
- Screenshots are the same curated set the audit always writes: every state × viewport, the GM correction bottom sheet, all six roster-row sheets, the create/join/recovery forms with keyboard hints, the read-only table surface.

## Headline numbers (current `report.json` on disk)

| Check | This run | Prior independently-reviewed run (`docs/evidence/uiux-reskin-20260920/`) |
| --- | ---: | ---: |
| States audited | 189 | 189 |
| Controls audited | 1,652 | 1,722 |
| Control issues (gating) | **0** | **0** |
| Horizontal-overflow states | 0 | 0 |
| axe-core hard violations | 0 | 0 |
| axe best-practice notes | `page-has-heading-one` on the intentional nonexistent-room route (unchanged, non-gating) | same |
| Roster-sheet checks (6 rows × 2 viewports) | 12/12 pass | 12/12 pass |
| Modal (correction sheet) scenarios | 15/15, all non-gating | same |
| **Gating failures** | **0** | **0** |

### Two runs, same verdict (control-count variance explained)

This audit was run **twice** in this session against the identical `eedab53` source: once before the independent review (1,820 controls audited) and once again afterward, while re-verifying, which is the `report.json` now on disk (1,652 controls). Both runs reported **zero** control issues, overflow states, axe hard violations, and gating failures. The count differs between runs — and differs again from the `uiux-reskin-20260920` baseline (1,722) — because the audit drives one real, randomized playthrough per run: which optional elements are on screen at each captured state (for example whether an injury-choice control appears) depends on live dice outcomes from `RandomSource`, not on any source change. `docs/reviews/2026-09-23-sonnet-k-reskin-final-verification-review.md` independently read the 1,820-control run's `report.json` directly; this file's numbers were then refreshed to match the final on-disk run. The reviewed conclusion (no findings, zero gating failures) is unaffected — both runs agree on it.

### Independent visual/design-brief check (this session, informal)

Beyond the automated checks, this session opened several of the audit's own screenshots (`gm-console-next-scene-phone-390.jpg`, `table-next-scene-desktop.jpg`, and the player compose/allocation states) to independently eyeball the ink-black/high-energy-punk/distressed-zine brief rather than relying only on the numeric contrast tests below. All observed states show a near-black ground with grain/halftone texture, bold condensed uppercase display type with hard drop shadows, and neon red/cyan/acid-yellow accent colors on original placeholder art (the Métro platform scene, character portraits) — legible white/paper body text throughout, including at the 1920×1080 "table" display width. No screen read as generically corporate or as illegible against the dark background. This is a subjective spot-check, not a substitute for `apps/web/test/styles/reskinContract.test.ts`'s numeric WCAG 2.2 contrast assertions (7:1/4.5:1/3:1 pinned against the real hex tokens, covering both light-on-dark body text and dark-on-bright button/chip fills), which is what actually gates the palette in CI.

## How it was produced

```bash
export PATH=/opt/homebrew/opt/openjdk/bin:$PATH
npm run build --workspace @digitable/functions
export VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_AUTH_DOMAIN=demo-digitable.firebaseapp.com \
  VITE_FIREBASE_PROJECT_ID=demo-digitable VITE_FIREBASE_APP_ID=1:000000000000:web:demo VITE_FIREBASE_USE_EMULATOR=true
(cd apps/web && npx vite build --outDir <scratch-dist> --emptyOutDir)
npx firebase emulators:start --only auth,firestore,functions,database --project demo-digitable &
(cd apps/web && npx vite preview --outDir <scratch-dist> --host 127.0.0.1 --port <port>) &
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:<port> --label sonnet-k-final \
  --out docs/evidence/sonnet-k-final-verification-20260923 --port <chrome-debug-port>
# Run twice in this session (before and after the independent review, see above); each run needs
# distinct ports from any other concurrently-running worktree lane's emulator/preview/CDP ports.
```

## What this evidence is not (limits, stated plainly — unchanged from every prior pass)

- **Headless Google Chrome on one macOS machine, not a physical device.** Touch, mobile emulation, the emulated keyboard, and emulated safe-area insets are Chrome DevTools Protocol overrides.
- **iOS Safari's visual-viewport-only keyboard cannot be produced in headless Chrome.** `useVisualViewportBox` is covered in jsdom and, for its use of `--vv-*`, by the pinch-zoom scenarios in a real engine; it has never run on a physical iPhone.
- **No screen reader was run** (VoiceOver iOS/macOS, TalkBack, NVDA, JAWS). Accessible names, descriptions, live regions, and focus order rest on axe-core, jest-axe, and Testing Library role queries.
- One browser engine only: no Safari, Firefox, Android Chrome, or Windows High Contrast run.
- Staging Hosting (<https://digitable.signal-bleed.com>) still serves the pre-fix build; none of this is visible there until an explicitly authorised redeploy.

The physical two-device rehearsal (including a lost-identity recovery attempt from a fresh/private browser) and merge/redeploy decision remain John's, per `CLAUDE_HANDOFF.md`'s "Next action".
