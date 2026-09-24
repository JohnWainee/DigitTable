# Final mobile pop-out audit: before/after evidence (sonnet-h)

Branch `sonnet-h/reskin-final-mobile-audit`, from `factory/today-integration` at `a350b2d`. Everything here was produced against a **local** Firebase emulator stack (`demo-digitable`, fake project) and local `vite preview` builds. Nothing was deployed; staging (`powerglove-1cd23`) was not contacted or changed. The audit record is `docs/reviews/2026-09-20-final-mobile-audit-review.md`.

- `before/` — the unmodified `a350b2d` source, audited with the **extended** `scripts/playtest/ui-audit.mjs` (the roster-name fix, the browser-default-button check, and the recovery-form states). `report.json` is the full machine-readable report; `failure-summary.txt` lists the gating failures.
- `after/` — this branch. Same audit, same stack.
- Screenshots: `player-compose-phone.jpg` (Iryna's compose step at 375×812) and `player-compose-phone-390.jpg` (390×844), `anon-join-recover-phone.jpg` (the recovery form), `after/anon-join-recover-rejected-phone.jpg` (its rejection state), and `injury-panel-hat-button-static.jpg` (see the caveat below).

## Headline numbers (audit states × seven viewports: 320×568, 375×812, 390×844, 812×375, 768×1024, 1280×800, 1920×1080; three isolated Chrome contexts driving the real create → join → claim → declare → roll → allocate → resolve flow)

| Check | Before (`a350b2d` + extended audit) | After |
| --- | ---: | ---: |
| States audited | 189 | 189 |
| Controls audited | 1,855 | 1,778 |
| Control issues (gating) | **21** — the Cigarettes "Mark and regain Blood" button is an unstyled browser-default button, in three states × seven viewports | **0** |
| Recovery-code input keyboard hints (`autocapitalize`, `autocorrect`, `spellcheck`) | missing (`null`, `null`, `null`) | `characters`, `off`, `false` |
| States with horizontal page overflow | 0 | 0 |
| axe-core hard (WCAG 2.x A/AA/2.2) violations | 0 | 0 |
| axe best-practice notes | `page-has-heading-one` on the intentional nonexistent-room route | unchanged |
| Gating failures | **22** | **0** |
| Console errors | 0 | 0 |

The unmodified, pre-extension audit could not run at all on this source: it timed out at `Rook's Correct button` (the shipped roster is the owner's sourcebook sheets; there is no "Rook"), so the pop-out audit and every state after it (42 of that run's 150) were not reached.

## What the "Mark and regain Blood" defect looked like

In a real browser (probe at 375 px, before): the button had **no class**, so no reskin rule reached it. It rendered as the browser's grey `outset` button in the system font, **61×89 px**, its text wrapped over four lines, inside a `<label>` beside a permanently disabled checkbox. The audit's earlier `min(width, height) ≥ 43.5` test passed it (61 is above 43.5), which is why the previous audit was green. After: a full-width `secondary-action` (48 px minimum) under the item's description, with no checkbox.

## Caveats (nothing here is hidden)

- **`injury-panel-hat-button-static.jpg` is a static render, not a live state.** The injury-choice step is reached only after a random unlucky roll, so the live audit cannot reach it deterministically. The image is the real `ChooseInjuryPanel2` component rendered to static HTML against the real built stylesheet. Headless Chrome enforces a window of about 500 px, so it shows style and height (before: default grey, 30 px; after: `secondary-action`, 67 px), **not** phone-width wrapping. The tap-size and reskin coverage for that button comes from the shared `.secondary-action` rule, which the live audit gates at 320/375 on other buttons, and from the new class-less-button contract test.
- Devices, viewports and engines: one Chrome, one machine. Headless Chrome with touch and safe-area emulation. No Safari, Firefox, Android or physical device, and no screen reader (see the audit record's "Limits").
- `net::ERR_CONNECTION_REFUSED` may appear in a device's failed-request list: the RTDB emulator is intentionally not started (presence is not implemented).
- The recovery-form rejection uses a made-up room code, so the server's rejection is the "room not found"/"code not recognised" copy, not a real seat.

## How it was produced

```bash
export PATH=/opt/homebrew/opt/openjdk/bin:$PATH
npm run build --workspace @digitable/functions
(cd apps/web && VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_AUTH_DOMAIN=demo-digitable.firebaseapp.com \
  VITE_FIREBASE_PROJECT_ID=demo-digitable VITE_FIREBASE_APP_ID=1:000000000000:web:demo \
  VITE_FIREBASE_USE_EMULATOR=true npx vite build --outDir /private/tmp/dist-x --emptyOutDir)
npx firebase emulators:start --only auth,firestore,functions --project demo-digitable &
(cd apps/web && npx vite preview --outDir /private/tmp/dist-x --host 127.0.0.1 --port 4174)
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4174 --label after --out /private/tmp/audit-after
```

`before/` was produced by building the unmodified `a350b2d` source the same way and running this branch's extended audit (`--tolerate-baseline`) against it.
