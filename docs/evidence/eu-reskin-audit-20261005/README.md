# Reskin / mobile pop-out re-audit of candidate `2280e92`, lane `sonnet-eu` (2026-10-04)

Evidence-only unit. **No `apps/`, `packages/`, `templates/`, rules, Functions, asset or secret change**; no defect was found in
what this lane measured, so there is nothing to fix and no regression test to add. Not merged, not deployed; no Firebase
project or cloud resource was created. The deployed staging build is still `5e8907b` (documented 2026-10-04 rerun); the
candidate source is NOT staged and the staging run below validates the *deployed* build only (it says nothing about the Back-dismiss or option-row source).

Candidate: `2280e92` (sonnet-et sheet Back-dismiss on top of the reviewed unmerged option-row/cascade chain). Stale
DeepSeek/Qwen lanes were not integrated.

## Runs (isolated ports 61xxx emulators + 61173 preview, 9461-9463 Chrome; peers hold the default ports)

| Check | Result |
| --- | --- |
| `npm run check` (`check.log`) | format, lint (0 errors, 1 pre-existing warning), typecheck, **862 passed**, 11 todo, 1 file skipped |
| `npm run build` (`build.log`) | passed (known chunk-size warning) |
| Firebase emulator suites (`emulator.log`) | rules/testing 18, Functions 86, web 4: **all passed** (default ports were held by a peer, so run on a remapped config with the three hard-coded port constants temporarily sed-patched, then reverted with `git checkout`; nothing of that is committed) |
| `ui-audit.mjs` (`ui-audit-before.log`, `reports/ui-audit-report.json`) | 288 states, 3,320 controls, 0 control/overflow/contrast/hard-axe failures; 8,462 contrast boxes measured, 0 failures among measurable boxes (330 boxes were inconclusive and 5 pages truncated, as in earlier lanes); 87 keyboard-focus, 363 dock-focus, 4 pinch, 8 validation, 23 sheet cases; only the known non-blocking best-practice note (`page-has-heading-one` on the nonexistent-room route). Source is unchanged by this lane, so before == after. Controls (3,320) and dock-focus checks (363) are still below the earlier lanes' 3,400 / 473; the cause remains uninvestigated. `fontFallback` was `null`: the fallback-font audit did not run, so the "no defect" statement is limited to what was measured. |
| `two-device-smoke.mjs --reload` local (`smoke.log`) | ALL 17 STEPS PASSED incl. no horizontal overflow at 375/768/1024/1280/1920 |
| `two-device-smoke.mjs --reload` on staging `https://digitable.signal-bleed.com` (`smoke-staging.log`) | ALL 17 STEPS PASSED (deployed build; read-only apart from one throwaway room) |
| Real Mobile Safari, iPhone 17 Pro, iOS 26.5 Simulator (`ios/`) | 4 tests executed, 0 failures: Back closes only the sheet, correction sheet + keyboard + picker, join validation with keyboard, signed-in dock |

## Screenshots

`shots/`: GM console, player compose and resolved at phone 390 / tablet / desktop, the table at desktop, and the GM correction sheet at
phone. `ios/`: real-Safari captures (after Back, GM pending, join errors with the keyboard up). The complete 650-image run (101 MB) was
not committed; regenerate with the command in the audit script header.

## Not covered (unchanged residuals)

Physical iPhone/Android hardware, VoiceOver/TalkBack, Windows High Contrast, Firefox, the OS-owned native `<select>` popup, a real
TV, Chrome's history-manipulation intervention. The staging smoke is not evidence for the unmerged source.

## Process note

During the run something outside this lane rewrote `apps/web/src/session/emulatorConfig.ts` (ports -> 57xxx) and a `firebase.eu.json`
in this worktree (cause unidentified: possibly a duplicate same-task session or a peer's rig). The source edit was reverted by hand
(`git checkout`); the final `npm run check` and the independent reviewer both saw a clean tree.

## Independent review

`docs/reviews/2026-10-04-eu-reskin-audit-independent-review.md`.
