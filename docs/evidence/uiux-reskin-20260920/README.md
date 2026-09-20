# UI/UX reskin and mobile pop-out hardening: independent before/after evidence (2026-09-20)

Branch `codex/uiux-reskin-20260920`, from `factory/today-integration` at `a350b2d`. Produced by a separate session from the one that authored `docs/evidence/sonnet-h-reskin-audit/` and re-run from scratch: the audit numbers below are this session's own, not copied from that record. Everything ran against a **local** Firebase emulator stack (`demo-digitable`, fake project: Auth, Firestore, Functions) and local `vite preview` builds. Nothing was deployed; staging (`powerglove-1cd23`) and production were not contacted. Record: `docs/reviews/2026-09-20-uiux-reskin-hardening-review.md`.

- `before/` — the unmodified `a350b2d` `apps/web` source (built from `git archive`), audited with **this branch's** `scripts/playtest/ui-audit.mjs` (`--tolerate-baseline`, so failures are recorded, not fatal).
- `after/` — this branch's head, same audit, same stack, same flow (real create → join → claim → declare → roll → allocate → resolve, three isolated Chrome contexts plus a signed-out one). The final rerun audited 1,722 controls.
- `report.json` is the full machine-readable report of each run; `audit-console.txt` is its console output (every `FAIL` line).
- Screenshots are a curated subset of the 209 the audit writes, same file names in both folders: the player compose step (Cigarettes item row) at 320/375/390/768/1280; the GM console with its native `<select>`s; the GM correction bottom sheet at 320/390/768/1280 and with the emulated keyboard at 390; the recovery form and create form at 390; the **table** surface (`*-table` is the 1920-class display viewport used by the audit, plus tablet and phone renders of the table screen).

## Headline numbers

189 states = 27 audit states × seven viewports (320×568, 375×812, 390×844, 812×375 landscape, 768×1024, 1280×800, 1920×1080), each checked for horizontal overflow, every interactive control's size/placement/type size, and axe-core (WCAG 2.0/2.1/2.2 A/AA + best-practice, including colour contrast, which jsdom cannot compute).

| Check | Before (`a350b2d`) | After |
| --- | ---: | ---: |
| States audited | 189 | 189 |
| Controls audited | 1,743 | 1,708 |
| Control issues (gating) | **21** (Cigarettes "Mark and regain Blood" is an unstyled browser-default button: compose, compose-why-open, paused × 7 viewports) | **0** |
| Typed-secret keyboard hints (`autocapitalize`/`autocorrect`/`spellcheck`) missing | **6 fields** (create passphrase, join room code + passphrase, table room code + table code, recovery code) | **0** |
| Focus after a form is replaced by the shown-once secrets card (create, join) | **`<body>`** (2 of 2 stranded) | heading of the card (2 of 2) |
| Horizontal-overflow states | 0 | 0 |
| axe-core hard violations | 0 | 0 |
| axe best-practice notes | `page-has-heading-one` on the intentional nonexistent-room route | unchanged |
| Modal (correction sheet) scenarios failing | 0 gating; the recorded, non-gating 320 px + 200 % text case | unchanged |
| **Gating failures** | **29** | **0** |

Modal scenarios that pass in both (they were already sound): containment at 320/375/390/812×375/667×375/768/1280, actions visible without scrolling, ≥44 px action targets, the emulated on-screen keyboard (layout viewport shrunk by 45 %), pinch-zoom still works with the sheet open, emulated safe-area insets (notch, home indicator), 150 % and 200 % text, reduced motion on/off, inert background, root scroll lock, focus into the dialog and back to the trigger.

### New in this pass: every roster row's sheet, not just the first

The sheet's height follows the character. The audit used to open only the first roster row (Iryna, 1,346 px of body content at 320 px); the tallest is the second (Nicole, 1,493 px). `report.json` → `rosterSheets` now records all six rows at 320×568 and 390×844: inside the viewport, actions visible without scrolling, ≥44 px targets, last field reachable after scrolling the body, no page overflow — 12 of 12 pass.

## Screenshots to look at

- `after/player-compose-phone-390.jpg` vs `before/player-compose-phone-390.jpg`: the Cigarettes row (description, then a full-width styled action; no dead checkbox).
- `after/gm-correction-sheet-phone-small.jpg`, `…-phone-390.jpg`, `after/gm-correction-keyboard-phone-390.jpg`: the pop-out.
- `after/gm-console-scene-loaded-phone-390.jpg`: the native selects at phone width.
- `after/table-idle-table.jpg`, `after/table-idle-tablet.jpg`, `after/table-idle-phone.jpg`: the read-only table surface (no controls).

## How it was produced

```bash
export PATH=/opt/homebrew/opt/openjdk/bin:$PATH
npm run build --workspace @digitable/functions
export VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_AUTH_DOMAIN=demo-digitable.firebaseapp.com \
  VITE_FIREBASE_PROJECT_ID=demo-digitable VITE_FIREBASE_APP_ID=1:000000000000:web:demo VITE_FIREBASE_USE_EMULATOR=true
(cd apps/web && npx vite build --outDir /private/tmp/dist-ux-after --emptyOutDir)
# before: `git archive a350b2d apps/web` into a scratch dir, node_modules symlinked, same build command
npx firebase emulators:start --only auth,firestore,functions --project demo-digitable &
(cd apps/web && npx vite preview --outDir /private/tmp/dist-ux-after --host 127.0.0.1 --port 4174) &
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4174 --label after --out /private/tmp/ux-audit-after --port 9351
# before: preview on :4175, `--label before --port 9352 --tolerate-baseline`
```

## What this evidence is not (limits, stated plainly)

- **Headless Google Chrome on one macOS machine, not a physical device.** Touch, mobile emulation, the emulated keyboard and emulated safe-area insets are Chrome DevTools Protocol overrides. Real thumb reach, the collapsing URL bar, momentum scrolling, the iOS notch/home indicator in real Safari, and OS-drawn native `<select>` pickers (which the browser owns and headless Chrome does not render) are unmeasured.
- **iOS Safari's visual-viewport-only keyboard cannot be produced in headless Chrome.** The audit's "keyboard" case shrinks the layout viewport (Chrome Android `resizes-content`). `useVisualViewportBox` (the iOS case) is covered in jsdom and, for its use of `--vv-*`, by pinch-zoom scenarios in a real engine; it has never run on a physical iPhone. Whether iOS honours `autocapitalize`/`autocorrect` on these inputs was not observed.
- **No screen reader was run** (VoiceOver iOS/macOS, TalkBack, NVDA, JAWS). Accessible names, descriptions, live regions and focus order rest on axe-core, jest-axe and Testing Library role queries. Focus movement was asserted (`document.activeElement`) but never listened to.
- One browser engine: no Safari, Firefox, Android Chrome, or Windows High Contrast run.
- Audit-script scope limits: the "unstyled browser-default button" check recognises only Chrome's default `outset` button border; the injury-choice step is reached only after an unlucky random roll and is covered by a jsdom test and a static render (`docs/evidence/sonnet-h-reskin-audit/`), not by the live flow.
- Staging Hosting (<https://digitable.signal-bleed.com>) still serves the pre-fix build; none of this is visible there until an explicitly authorised redeploy.
