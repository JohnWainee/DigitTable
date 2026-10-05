# Reskin pop-out and mobile-control audit, lane `sonnet-et` (2026-10-05)

Base: `5ef9c2b`. **Source change: none.** No `apps/web/src`, engine, contracts, Firebase, authorization, projection, asset or secret change; no
cloud resource touched; staging not contacted. Not merged, not deployed. Outcome: no new verified defect, so this is evidence only.

## Method (isolated stack, peer lanes' emulators untouched)
- Emulators `auth,firestore,functions` on remapped ports 62099/62080/62001 (project `demo-digitable-et`, config in `/private/tmp/et-fb`, not committed);
  web bundle built with a throwaway Vite config that swaps only the three port numbers (removed afterwards; tree clean).
- `node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:64174 --label et --out /private/tmp/et-fb/audit --port 59777`
  -> 288 states, 3,464 controls, 0 control/overflow/contrast/hard-axe failures, 87 keyboard-focus, 561 dock-focus, 4 pinch, 8 validation, 23 sheet cases,
  `UI AUDIT PASSED` (`ui-audit.log`, `ui-audit-report.json`). Widths: 320/375/390/412 phone, landscape, 768 tablet, 1280 desktop, 1920 table; 150/200% text.
- `scripts/playtest/ios-simulator/run.sh --base http://127.0.0.1:64174 --out /private/tmp/et-fb/ios "iPhone 17e"` (real Mobile Safari, iOS 27.0 Simulator):
  join validation with keyboard, correction sheet with keyboard (portrait + landscape) and native scene `<select>` picker, signed-in dock incl. landscape with bars -> passed
  (`ios.log`, `ios/*.log`). Screenshots in `shots/` reviewed by eye: sheet title, reason field, Apply/Cancel all above the keyboard; landscape field visible; select
  popup is OS-owned and the in-page "Selected" echo shows the full label.
- `npm run check`: format, lint (0 errors, 1 pre-existing warning), typecheck, 854 passed / 11 todo, exit 0 (`check.log`).

## Static read (SheetDialog, `useVisualViewportBox`, sheet/select/details/safe-area/reduced-motion CSS)
Inputs/selects 16px and >= 3rem; `summary` >= 3rem; IME-safe Escape; inert background; reachable-only Tab trap; `dvh` behind `@supports`; `--vv-*` sizing;
no `touch-action` restriction; safe-area insets per side. Selects without an echo (`grant-/advance-/reassign-character`) list short roster names only.

## Not covered (unchanged residuals)
Physical iOS/Android, VoiceOver/TalkBack, Windows High Contrast, real browser-chrome collapse beyond the Simulator, OS-drawn select popups, Firefox, a real TV.
Theoretical only: `previouslyFocused.focus()` no-ops if the trigger unmounts while the sheet is open; the inert set is a mount-time snapshot (documented).
