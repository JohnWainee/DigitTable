# Reskin / mobile pop-out audit of candidate `8839c75`, lane `sonnet-ex` (2026-10-05)

Evidence-only unit. **No `apps/`, `packages/`, `templates/`, rules, Functions, asset or secret change.** No reproducible
defect was found in what this lane measured, so there is no fix and no regression test to add. Not merged, not deployed;
no Firebase project or cloud resource was created. Staging is still the deployed `5e8907b` build, so nothing here is
validated against it. `8839c75` differs from the audited source `2280e92` only in docs.

## Method

Read `AGENTS.md`, `CLAUDE_HANDOFF.md`, the roadmap and the prior reskin/pop-out reviews, then read the actual code of every
pop-out surface: `SheetDialog.tsx` (the only modal; portal, inert background, scroll lock, focus trap, Escape, visual-viewport
box, compact mode), `useBackDismiss.ts`, `useVisualViewportBox.ts`, `ActionDock.tsx` (pin/unpin, clipping), the native
`<select>` rules (`styles.css` ~544-660; all five selects are native, so the OS owns the popup and it cannot clip), the
`<details>` "Why?" disclosure, and the allocation stepper rows. There are no custom menus, listboxes or popovers.

## Runs (remapped ports 62xxx; peers hold the defaults)

| Check | Result |
| --- | --- |
| `npm run check` (`check.log`) | format, lint (0 errors, the one pre-existing warning), typecheck, **862 passed**, 11 todo |
| `npm run build` (`build.log`) | passed (known chunk-size warning) |
| Firebase emulator suites (`emulator.log`) | rules/testing **18**, Functions **86**, web **4**: all passed, on a temporary remapped config and temporarily patched port constants, reverted with `git checkout` (nothing of that is committed; tree clean) |
| `ui-audit.mjs` (`ui-audit.log`, `reports/report.json`) | **288 states, 3,464 controls, 0 control / overflow / contrast / hard-axe failures**; 8,600 contrast boxes measured, 0 failures (324 inconclusive boxes and 5 truncated pages, as in earlier lanes); 256 text-scale states, 87 keyboard-focus, **561** dock-focus, 4 pinch, 8 validation, 23 sheet cases. Only the known best-practice note (`page-has-heading-one` on the nonexistent-room route). `fontFallback` is `null`: the fallback-font audit did not run. |
| `two-device-smoke.mjs --reload` (`smoke.log`) | ALL STEPS PASSED (GM / player / table, reload recovery, no horizontal overflow at 375/768/1024/1280/1920) |
| `sheet-viewport-probe.mjs` (`sheet-viewport.log`) | 8 PASS, 0 FAIL: one live correction sheet across 390 -> 844x390 -> 768x1024 -> 1280x800 -> 1920x1080 -> 320x568 -> 390 keeps state, containment, >=44px reachable actions and focus; Back closes only the sheet; Escape leaves no dead entry |
| Extra adversarial probe (`focus-restore-probe.mjs`, committed; its output was observed by the author in the terminal, not saved as a log) | Cancel, Back, Forward-after-Back and Apply with a real-focused trigger: sheet closes, console stays mounted, Forward does not resurrect the sheet, focus returns to the trigger. All passed. |

## Rig notes (not product defects)

- My first local smoke failed ("player recovery reveal") because I built the web bundle without the demo `VITE_FIREBASE_*`
  variables (`scripts/playtest/lan-up.sh` lines 35-39), so the app was in fixture mode; rebuilt with them and the smoke passed.
  The failing run is not committed.
- The first focus probe reported focus on `<body>` after closing the sheet. The probe opened the sheet with a programmatic
  `click()`, which does not focus the button, so `previouslyFocused` was `<body>`. With a real-focused trigger it returns focus
  correctly. Taps and mouse clicks in Safari also do not focus buttons, so there focus ends on `<body>` after close, exactly as
  it began; keyboard and assistive-technology users, who do focus the trigger, are restored. Not a defect.

## Not covered (unchanged residuals)

Real Mobile Safari was not re-run (source identical to the lane `sonnet-eu` run on `2280e92`: 4 tests, 0 failures); physical
iPhone/Android hardware, VoiceOver/TalkBack, Windows High Contrast, Firefox, the OS-owned native `<select>` popup, a real TV,
the fallback-font audit, and keyboard-up footer safe-area padding on a physical iPhone (carried from `sonnet-eu`).

## Independent review

`docs/reviews/2026-10-05-ex-reskin-audit-independent-review.md`.
