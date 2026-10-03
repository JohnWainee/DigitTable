# Reskin verification on candidate 888e5e1 (2026-10-03, `sonnet-do/reskin-orchestrated-20261003`)

**Outcome: no source defect found; no source change.** Before and after are the same commit (`888e5e1`), so the screenshots are a single set, not a diff.

Everything below ran on an isolated Firebase emulator stack on remapped ports (Auth 47099, Firestore 47080/47081, RTDB 47000, Functions 47001, hub 47400; web preview 4290; Chrome debug ports 9391-9394) because a peer lane holds the default ports. The Vite bundle was built with a throwaway out-of-repo config that only swaps the emulator port numbers. No deploy, no production resource, no peer process touched.

## Local candidate evidence (888e5e1)

| Gate | Result |
| --- | --- |
| `npm run check` | pass on the unchanged candidate: 80 files passed (1 skipped), **796 passed, 11 todo**; after adding the status-semantics test (below) 81 files, **802 passed, 11 todo** |
| `npm run build` | pass (existing chunk-size warning only) |
| `ui-audit.mjs --base http://127.0.0.1:4290 --label before-candidate-888e5e1` | **288 states, 3,448 controls, 0 control issues, 0 overflow states, 0 hard axe violations, 87 keyboard focus checks, 441 dock focus checks, 8 validation scenarios, 23 sheet cases, 0 failures**; one best-practice note (`page-has-heading-one` on the intentional missing-room route). `ui-audit-summary.json` |
| Same audit with five extra real-device viewports (360x640, 393x852, 430x932, 1024x768, 1366x768; an uncommitted scratch copy of the script, deleted) | **468 states, 5,291 controls, 0 failures**, same single best-practice note. `ui-audit-extra-viewports-summary.json` |
| `ui-audit-selftest.mjs` | pass (real-stylesheet dock cases at 320/360/540/600/700/800 px, 200% text, GM card) |
| `two-device-smoke.mjs --base http://127.0.0.1:4290 --reload` | **17/17** (`smoke-local-report.json`) |
| `firebase emulators:exec --config <remapped> --only auth,firestore,database,functions --project demo-digitable "npm run test:emulator --workspaces --if-present"` | **18 rules + 86 Functions + 4 web passed** (`emulator-suite-summary.log`) |

## Deployed-build observation (staging, not the candidate)

`two-device-smoke.mjs --base https://digitable.signal-bleed.com --reload`: **17/17**, no deploy. This exercises the build currently on Hosting (commit `5e8907b`, which predates the whole reskin), so it says nothing about the zine styling or the dock; it only confirms the deployed backend and flow still work. `smoke-staging-report.json`.

## Pop-out inventory audited

The only fixed/sticky layers in `apps/web/src/styles.css` are `.sheet-backdrop` (the one modal, `SheetDialog`), `.action-dock` (sticky) and the decorative `body::before` texture (`pointer-events: none`). Option lists are native `<select>` (OS-owned popup, with `SelectedOptionEcho`; SceneDirector x2, GmToolsPanel x4), the Compose "Why?" `<details>`, radio groups (Compose, Allocation, Choose-injury) and the dock. A contract test forbids anchored popover/menu/listbox patterns, so no desktop-anchored popup exists to overflow a phone.

`shots/`: full-page captures at phone 375, tablet 768, desktop 1280 and table 1920 for the main states (landing, GM scene-loaded and pending, player Compose, Allocation, resolved, table after roll) and the Correction sheet at 200% text. `shots-extra-viewports/`: the dock states at the five extra viewports (a full-page capture draws the sticky dock in page flow).

## Not covered (needs John)

Physical iPhone/Android (iOS toolbar collapse, rubber-banding, thumb reach, true iOS keyboard visual-viewport shrink, which headless Chrome cannot produce), VoiceOver/TalkBack, and a real two-device LAN rehearsal (`docs/PLAYTEST_TWO_DEVICE.md`).
