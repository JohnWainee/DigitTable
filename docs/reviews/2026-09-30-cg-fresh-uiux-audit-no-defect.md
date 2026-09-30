# Fresh UI/UX and mobile pop-out audit (2026-09-30) — no source change

- **Branch:** `worktree-reskin-cg-fresh-uiux-20260930`, from `c718289`. **Source changed: none** (docs only).
- **Scope:** fresh audit of the ink-black reskin candidate with the mobile pop-out defect class as the focus: the one modal (`SheetDialog` / `CorrectionDialog`), the six native `<select>`s (`SceneDirector`, `GmToolsPanel`), the one `<details>` ("Why?"), `AllocationStepper`, and all action/allocation pickers.

## Method

- Re-read `SheetDialog.tsx`, `useVisualViewportBox.ts`, `index.html` and the `select`, `details`/`summary` and `.sheet*` rules in `styles.css`. A grep of `apps/web/src` found no select/details/dialog/popover/menu/listbox markup beyond that inventory.
- Built the candidate against local `demo-digitable` Auth/Firestore/Functions emulators (repo copied to `/private/tmp/dt-fresh`, because `~/Documents` blocks esbuild/Firebase startup) and ran the real-Chrome harness, then looked at the phone screenshots (player compose with "Why?" open, GM console, correction sheet with keyboard).

## Findings

No real remaining defect, so nothing was changed.

- Native selects leave the option popup to the OS, so it cannot clip. The closed control is 16px type with a tap-target minimum and an ellipsis, so no zoom and no overflow.
- The sheet is portalled, makes the background inert and locks root scroll. It is sized from the visual viewport with `--vv-*` and `@supports` dvh fallbacks. Its header and footer stay pinned with only the body scrolling, it respects safe areas, and `touch-action` does not block pinch-zoom.
- The "Why?" disclosure is inline, not a floating pop-out.
- Visual pass: legible high-contrast zine styling, yellow/cyan focus rings, no clipping on the screenshots viewed.

## Evidence (all local, run 2026-09-30)

- `ui-audit.mjs` (reports at `/private/tmp/dt-fresh-audit/report.json`): **150 states, 1,530 controls, 0 control issues, 0 overflow states, 0 hard axe violations, 14 modal scenarios (phone-small, phone, landscape, tablet, desktop, keyboard, safe-area, 200% text, zoom, reduced motion), 0 failures.** Only best-practice note: `page-has-heading-one` on the intentional nonexistent-room route.
- `two-device-smoke.mjs --reload` (`/private/tmp/dt-fresh-smoke`): **all 17 steps passed**, including no horizontal overflow at 375/768/1024/1280/1920.
- `npm run check`: Prettier, ESLint and TypeScript clean, **704 passed | 11 todo**.

## Not run / gaps

- The before/after screenshots, new regression test, `npm run build` gate and emulator suite required for a source change were not produced, because there is no source change. The two-device run used a live-mode production build, and the last full emulator result (108/108) on this source remains the one recorded in the handoff.
- No second-reviewer agent was run: the change set is docs only, so there was nothing to review beyond this note.
- **Physical-device gaps remain:** iOS Safari visual-viewport keyboard (headless Chrome cannot shrink only the visual viewport), real iOS autocapitalisation and autocorrect, Android Chrome, Safari/Firefox, screen readers, Windows High Contrast. Nothing was deployed.
