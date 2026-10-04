# Fresh reskin / pop-out audit, lane `sonnet-eb` (2026-10-04)

Base: `77ef1ad` (`sonnet-dz/reskin-uiux-20261004`). **No source change**: the audit found no in-scope defect, so this
directory records evidence instead of churning code. No deploy, merge, production resource, secret or staging write.
Before and after are therefore the same build; only "before" captures are kept (a 386-image, 53 MB set was pruned to the
13 representative captures in `screenshots/`: landing, compose, allocation, GM console pending/correction-keyboard,
table idle/full party, at phone 375, tablet 768, desktop 1280 and table 1920 widths).

Deployed baseline (not re-run): commit `9ee8aa5` / `/private/tmp/digitable-staging-playthrough-20261004/report.json`,
17/17 steps. Staging predates the dock and table-legibility changes, and was not touched.

## Stack

Fresh `npm ci`; isolated emulator stack on remapped ports 47xxx (auth 47099, Firestore 47080/47081, RTDB 47000,
Functions 47001, hub 47400, `demo-digitable`), web bundle built with a throwaway Vite plugin that swaps only the three
client port numbers, `vite preview` on 47274, Chrome debug ports 47350/47351. Peer emulators on 9099/8080/9000/5001,
59099/55001 etc. were never touched. Helper files were kept outside the repo or git-excluded and removed afterwards
(prettier and eslint otherwise scan them).

## Audit (own read of screenshots + automated)

Viewed phone/tablet/desktop/table captures of landing, player compose/allocation, GM console (scene director, pending,
roster, tools), correction sheet with emulated keyboard, and the six-member table display. Surfaces: native `<select>`s
(OS popup with in-page "Selected" echo), the Compose "Why?" disclosure, the single modal `SheetDialog`, the sticky
`ActionDock`, allocation/target radio pickers (inline lists). No anchored popover, menu, listbox or datalist exists, so
none can clip; the one modal is visual-viewport sized with internal scroll. Visual language is coherent: near-black ink
surfaces, hard-offset print shadows, riot-red/acid/cyan/pink accents drawn from the art pack, procedural grain.

| Gate | Result |
| --- | --- |
| `ui-audit.mjs` (real Chrome; 8 viewports, GM/player/table) | 288 states, 3,416 controls, 0 control issues, 0 overflow, 0 hard axe violations, 87 keyboard-focus + 405 dock-focus checks, 4 pinch scenarios, 8 validation scenarios, 23 sheet cases, 0 failures. One best-practice note: `page-has-heading-one` on the intentional no-such-room route. |
| `ui-audit-selftest.mjs` | passed |
| `two-device-smoke.mjs --reload` | ALL STEPS PASSED (incl. no overflow at 375/768/1024/1280/1920) |
| `npm run check` | exit 0: 805 passed, 11 todo (80 files, 1 skipped) |
| Emulator suites (APFS clone, ports remapped in the clone only) | 18 rules + 86 Functions + 4 web passed |

## Known remaining items (carried, not new)

- Six-member party on a 1920x1080 table is about 38px taller than the screen (`dz-table-legibility-20261004`).
- Director accent is the same red as errors (errors keep text prefix, `aria-invalid`, `role=alert`).
- Not coverable here: physical iOS/Android, iOS Safari keyboard (visual viewport shrinks, layout viewport does not),
  real WebKit pinch, browser-chrome collapse, VoiceOver/TalkBack, a real TV at viewing distance.
