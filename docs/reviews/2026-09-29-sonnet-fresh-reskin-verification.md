# Fourteenth reskin verification: fresh-worktree evidence pass, no product defect (branch `sonnet-by/reskin-fresh-20260929`, 2026-09-29)

- **Candidate:** `ade1027` (no source change on this branch). Evidence only: no `apps/web`, engine, contracts, template, Functions,
  rules, projection, authorization or harness change; nothing deployed or merged. "Before" and "after" are the same tree, so the
  screenshots in `docs/evidence/fresh-20260929/screens/` are the candidate at phone / tablet / desktop / table widths.
- **Fresh install:** `npm ci` in a new worktree (no reused `node_modules`, no reused `dist`), so no earlier build artefact was trusted.

## Independently derived evidence

| Check | Result |
| --- | --- |
| Palette contrast, computed from the `:root` tokens (WCAG relative luminance) | paper 13.7-17.3:1, dim 7.2-9.1:1, mute 5.4-6.8:1, acid 12.7-16.1:1, cyan 10.6-13.4:1, volt 13.6-17.2:1, pink 5.1-6.4:1 on ink-0..3; `--riot` text 5.65 / 5.38 / 4.99 on ink-0/1/2 but **4.47 on ink-3**. `--riot` text is only used on ink-0/ink-2 backgrounds (connection status, threat-token fallback), so no live failure; the token comment ("each >= 4.6:1 against ink-2") is true for ink-2 only. Note for anyone placing riot text on ink-3. `--rule` is 1.85-2.33:1 (2.06 on ink-2) and, in the rules I read (fieldset, card, pill, stepper shadow, sheet header/footer dividers), decorative; I did not check every `border` declaration, and control borders I saw use paper/mute (5.3:1+). axe ignores background images, and the grain/halftone overlays were not measured: the riot-on-ink-0 pairs (5.65:1) pass by token arithmetic only, with the overlays lifting the background by a few luminance units at most (reviewer's estimate) |
| `npm run check` (format, lint, typecheck, tests) | pass: **724 passed, 11 todo** (76 files passed, 1 skipped) |
| Production build, emulator mode (`demo-digitable`), served with `vite preview` | built. First attempt omitted `VITE_FIREBASE_API_KEY/AUTH_DOMAIN/APP_ID`, so the app fell back to the in-memory fixture ("LOCAL FIXTURE - NOT A LIVE ROOM" banner) and the player join failed with "Code or passphrase not recognised". That was my build error, not a product defect; rebuilt with the full variables from `docs/TWO_DEVICE_RUNBOOK.md` |
| `two-device-smoke.mjs --reload --no-images` against the local emulators | **17/17 pass** |
| `ui-audit.mjs` full sweep with screenshots (six viewports, 150/200% inline text, modal loop incl. keyboard, pinch zoom, safe areas, reduced motion, axe WCAG 2.x A/AA + best practice) | **225 states, 2,367 controls, 0 control issues, 0 overflow, 0 hard axe violations, 0 failures**; only the known non-gating `page-has-heading-one` on the no-such-room route |
| `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` (default ports, demo project) | **18 + 86 + 4 = 108/108** (three separate suites summed; not one logged total) |
| Hardened staging smoke, `node scripts/playtest/two-device-smoke.mjs --base https://digitable.signal-bleed.com --reload` | **17/17 pass**, `ok: true`, 0 console errors, 0 failed requests, no overflow at 375/768/1024/1280/1920 (report finished 2026-09-29T23:14:08Z). Proves the deployed build (`5e8907b`), **not** this source (`ade1027`) |

Screenshots reviewed by eye: the GM correction sheet with the keyboard open at 375x812 (field, both actions and context visible, bottom-flush) and at
320x568 / 200% text; the player allocation screen at phone width; the GM console at tablet width. The hierarchy reads as intended:
near-black ink surfaces, acid-yellow primary actions, cyan secondary, riot-red print shadows, stamped mono labels.

## Pop-out inventory (re-derived)

`role="dialog"`: one (`SheetDialog`, used by the GM correction sheet); native `<select>`s: six (OS owns the option popup; the closed control is
44px+ and 16px type per the sweep); `<details>`: one ("Why?"); custom radios/checkboxes and the allocation stepper. No popover/menu/listbox.

## Known accepted limit (unchanged, recorded again)

At 320x568 with 200% text and the keyboard open, the capped action row scrolls internally: the field and Cancel are visible and Apply is
reachable by scrolling that row (see `screens/gm-correction-keyboard-text-320x568-200.jpg`). Earlier passes accepted this; I could not
justify a source change from it.

## Determination

**No reproducible in-scope product defect; no source change.** Physical-device evidence remains open: iOS Safari visual-viewport
keyboard behaviour (headless Chrome shrinks the layout viewport instead), Android URL-bar collapse, OS large text with the keyboard
open, Windows High Contrast, and John's two-device rehearsal including fresh-browser seat recovery.

## Follow-up note (no source change)

Do not place `--riot` text on `--ink-3` (4.47:1, below AA). The `:root` comment claiming each accent is >= 4.6:1 holds against ink-2 only.

## Independent second-pass review

Fresh reviewer agent: **approve with corrections, all applied above.** It recomputed the token contrast, found only two `--riot` text
uses (`.connection-status--signed-out`, `.threat-token-fallback`, both on ink-0), confirmed the evidence reports match the claims, and
read the viewport meta (no zoom lock), sheet sizing/tight-fit hooks and reduced-motion gating without finding a defect. `npx vitest run apps/web`: 285 passed.
