# Ink-black reskin and mobile pop-out evidence (sonnet-d)

Branch `sonnet-d/reskin-mobile-sheets`, from `factory/today-integration` at `59c4fe3`. Everything here was produced against a **local** Firebase emulator stack (`demo-digitable`, fake project) and local `vite preview` builds. Nothing was deployed and staging (`powerglove-1cd23`) was not contacted or changed.

- `before/` — the unmodified `59c4fe3` build (`apps/web/dist` built with the same emulator env vars).
- `after/` — this branch. Both directories hold the same 12 screen states at the four requested widths (`phone` 375×812, `tablet` 768×1024, `desktop` 1280×800, `table` 1920×1080; files wider than 1000 px are downscaled to 1000 px and recompressed to keep the repository small), the pop-out scenario screenshots (`gm-correction-*.jpg`), and the full machine-readable `report.json` from `scripts/playtest/ui-audit.mjs`.
- File names are `<surface>-<state>-<viewport>.jpg`, e.g. `player-compose-phone.jpg`, `gm-console-pending-desktop.jpg`, `table-after-roll-table.jpg`. The audit itself ran six viewports (it also covers `phone-small` 320×568 and `phone-landscape` 812×375); only the four requested widths are committed as images.

## How it was produced

```bash
# once: builds + emulators (java on PATH; stop any other emulator first)
export PATH=/opt/homebrew/opt/openjdk/bin:$PATH
npm run build --workspace @digitable/functions
VITE_FIREBASE_API_KEY=demo-key VITE_FIREBASE_AUTH_DOMAIN=demo-digitable.firebaseapp.com \
VITE_FIREBASE_PROJECT_ID=demo-digitable VITE_FIREBASE_APP_ID=1:000000000000:web:demo \
VITE_FIREBASE_USE_EMULATOR=true \
  npx vite build --outDir /private/tmp/dist-after --emptyOutDir      # from apps/web
npx firebase emulators:start --only auth,firestore,functions --project demo-digitable &
(cd apps/web && npx vite preview --outDir /private/tmp/dist-after --host 127.0.0.1 --port 4174)
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4174 --label after --out /private/tmp/audit-after
# the "before" run: same build recipe from a checkout of 59c4fe3, then
node scripts/playtest/ui-audit.mjs --base http://127.0.0.1:4173 --label before \
  --out /private/tmp/audit-before --tolerate-baseline
```

The script drives the real create → join → claim → table → declare → roll → allocate → resolve → pause → next-scene flow with three isolated Chrome contexts, so every screen state is a real backend projection, not a mock. It needs Google Chrome (`CHROME_PATH` overrides) and Node 22, and `axe-core` from `node_modules` (installed with `jest-axe`).

## Headline numbers (150 state × viewport captures per run)

| Check | Before (`59c4fe3`) | After (this branch) |
| --- | ---: | ---: |
| Interactive controls audited | 1,458 | 1,518 |
| Control findings (under 44 px, outside the viewport, or text-entry type under 16 px), counted per state × viewport | **210**: 138 on the six selects (13.3 px type, ~19 px tall), 54 on text/number inputs and the 26 px acknowledgement checkbox, 18 on the "Why?" summary (18 px tall) | **0** |
| States with horizontal page overflow | 0 | 0 |
| axe-core hard (WCAG 2.x A/AA/2.2) violations, real colour contrast | **4** (`.die-chip--discard` at 2.71:1) | **0** |
| axe best-practice notes | `page-has-heading-one` | `page-has-heading-one` (unchanged, see below) |
| Console errors on any device | 0 | 0 |
| Gating audit failures | 267 | **0** |

## The pop-out audit: every select, menu, disclosure, modal, drawer, option list, picker

A source inventory (`grep` for `<select`, `<details`, `<dialog`, `role="dialog|menu|listbox|tooltip"`, `popover`, `aria-haspopup`, `position: fixed|absolute`) finds exactly the following. There is **no** custom menu, popover, tooltip, toast, or drawer anywhere in `apps/web/src`.

| Control | Where | Behaviour after the reskin | Audit evidence |
| --- | --- | --- | --- |
| 6 native `<select>` (`#scene-select`, `#edit-target`, `#grant-character`, `#advance-character`, `#advance-select`, `#reassign-character`) | `SceneDirector`, `GmToolsPanel` | Deliberately kept native. The option list is drawn by the browser: an OS picker on touch devices, an edge-aware popup on desktop, so page CSS can neither clip nor mis-place it. We own the closed control: full width (`max-width: 100%`, the earlier 375 px GM overflow stays fixed), 48 px tall, 16 px type (no iOS focus-zoom), long option text ellipsised instead of widening the page, dark option list via `color-scheme: dark` | Control audit at 6 viewports: **0** findings after vs **138** before (all six selects flagged: 13.3 px type, ~19 px height). Headless Chrome cannot screenshot a native popup, so the popup itself is not pictured |
| `<details>` "Why?" | `ComposeStep2` | In-flow disclosure, never a floating popover; 48 px summary; content wraps inside the card | `player-compose-why-open-*.jpg`, axe at phone |
| Correction sheet (modal) | `CorrectionDialog` → new shared `SheetDialog` | Bottom sheet below 641 px, centred card above; sized from the visual viewport with safe-area padding; pinned title and action row; only the body scrolls; root scroll locked; background `inert`; focus trapped and restored | Scenarios below |
| Stat picker, item/ability/bonus/threat lists (radio and check rows) | `ComposeStep2`, `PendingActionsPanel` | Rows are ≥48 px full-width labels with a drawn 26 px box; disabled options use a dashed box plus the existing "— no uses left" text (not colour alone) | `player-compose-*.jpg`, `gm-console-pending-*.jpg` |
| Per-die allocation radio groups | `AllocationPanel2` | Same rows; assigned die keep their group label; Confirm stays disabled (dashed) until every die has a target | `player-allocation-*.jpg` |
| Injury-category radios | `ChooseInjuryPanel2` | Same rows. **Not reached** in the audit run (the deterministic roll needed no injury choice); covered by the same `.gear-option` rules, the existing jest-axe tests, and the CSS contract test | none captured |
| Blood / item-use steppers | `CorrectionDialog` | 48 px buttons and a 48 px value cell; the row wraps at very large text | sheet scenarios |

### Sheet scenarios (real Chrome; all gating unless marked)

| Scenario | Before | After |
| --- | --- | --- |
| Dialog fully inside the viewport, at 320×568, 375×812, 812×375, 667×375, 768×1024, 1280×800 | fails at **all six** (taller than the screen, title and actions off-screen) | passes at all six |
| Action buttons visible without scrolling (≥44 px) | fails at all six | passes |
| Root scroll locked / background inert while open | fails / fails | passes / passes |
| Emulated on-screen keyboard (viewport shrunk 45% with the reason field focused): sheet inside, field visible, actions visible | fails at all five phone/tablet sizes | passes |
| Pinch-zoom emulated (`Emulation.setPageScaleFactor` 1.6): sheet stays inside the **visual** viewport | fails | passes |
| Real two-finger pinch gesture with the sheet open zooms the page (WCAG 1.4.4) | passes | passes (an interim build failed this: `touch-action: none` on the backdrop; found by the independent review, fixed, now covered by a browser check and a CSS contract test) |
| Safe-area insets (notch left/right 47 px, home indicator 21 px) at 667×375 where they actually constrain the sheet, at 812×375, and portrait (top 47, bottom 34) | not measurable (no sheet structure) | passes all three |
| 150% text at 320×568 and 200% text at 375×812 (root font enlarged): inside viewport, no overflow, action row reachable, last field reachable | fails (the dialog is taller than the screen) | passes |
| 200% text at 320×568 | fails | `dialogInsideViewport` and `noPageOverflow` are **recorded, not gating** for this one scenario (the sheet's `bodyKeepsRoom`, `actionsReachable` and `reasonReachable` still gate and pass): the (unchanged) rem-padded panels behind the sheet leave under 70 px for a check-box row and overflow the page at that combination, which widens the mobile layout viewport; the sheet's own body reflows. Listed as a limitation |
| `prefers-reduced-motion`: entrance animation exists when allowed (`sheet-rise`), is `none` when `reduce` | n/a | passes both |
| Focus returns to the trigger, `inert` and scroll lock released on close | passes | passes |

## Limits (nothing here is hidden)

- **iOS Safari's visual-viewport-only keyboard** (the visual viewport shrinks while the layout viewport does not) cannot be produced by headless Chrome (`Emulation.setVisibleSizeOverride` no longer exists). The hook that handles it is covered in jsdom (`apps/web/test/shared/SheetDialog.test.tsx`), and its consumption of the `--vv-*` variables is covered in a real engine by the pinch-zoom scenarios, but a physical iPhone pass is still owed.
- One Chrome, one machine: no Safari, Firefox, Android, screen reader, or Windows High Contrast run. Headless Chrome emulates touch and safe areas but is not a device.
- The fixture pages are dark by design; there is no light theme to check.
- `page-has-heading-one` (axe best practice, the player dashboard and the signed-out message screens have no `<h1>`) is the pre-existing staging-review finding F7. It is not a WCAG failure and was left for John, as recorded in `docs/reviews/2026-09-18-staging-independent-playtest-review.md`.
- `net::ERR_CONNECTION_REFUSED` appears in each device's failed-request list, identically before and after: the RTDB emulator is intentionally not started for this stack (presence is not implemented). No console errors occurred.
