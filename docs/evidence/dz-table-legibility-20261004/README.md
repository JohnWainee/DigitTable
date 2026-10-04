# Table display legibility, lane `sonnet-dz` (2026-10-04)

Base: `9ee8aa5`. Presentation only (`apps/web/src/styles.css`, one contract test, docs). No authority,
authorization, projection, engine, Firebase or asset change. Not merged, not deployed.

## Gap

The shared table display (`/room/:id/table`, a wall/TV surface) scales `.table-screen` to 1.15rem (>= 80rem
wide) and 1.4rem (>= 110rem), but its secondary text is sized in **root rem**, so it never follows: `Paused`
and `Round n` (`.form-hint`, 14px), the OBJECTIVE/THREATS labels (`h3`, 13.6px), party Blood/Injuries
(`.party-member-stats`, 12px) and the link state (`.connection-status`, 12px) stayed 12-14px next to 22px body
text. Blood, injuries and the pause state are exactly what a table reads from across a room.

## Change (>= 80rem only; phone and tablet are untouched by construction)

- Those four rules plus the party name are now `em`-relative to `.table-screen` (1em/0.9em/0.9em/1.1em): about
  16.6px at 1280-1759px wide and 20px at >= 1760px.
- The larger party chips stacked one per column, so `.party-strip` spans both columns (six chips wrap 3 x 2).
- At >= 110rem (1920 TV) the route map is capped at 38rem and the banner art at 18rem so the idle table still
  fits a 1080px-tall display (it grew to 1150px before the cap).

| Capture (page height) | before | after |
| --- | --- | --- |
| table 1920x1080, idle / after-roll | 1080 | 1080 |
| table 1920x1080, six-member party | 1175 | 1118 |
| desktop 1280x800, six-member party | 1359 | 1145 |

`before-*` / `after-*` captures in this directory (table, desktop, plus the unchanged tablet and phone GM views).
A six-member party at 1920x1080 is still 38px taller than the screen (it was 95px); not fully solved.

## Gates

| Gate | Result |
| --- | --- |
| `npm run check` | see handoff entry (803 base -> 805 passed, 11 todo) |
| New contract tests | fail on the pre-fix stylesheet (verified), pass after |
| `ui-audit.mjs` (real Chrome, remapped stack 61xxx) | 288 states, 3,336 controls, 0 control / overflow / hard axe failures (`ui-audit.log`) |
| `two-device-smoke.mjs --reload` | ALL STEPS PASSED (`smoke.log`) |
| Emulator suites (APFS clone, ports remapped in the clone) | 18 + 86 + 4 passed on the rerun (`emulator-suite.log`). The first run had one failure, `createRoom > regenerates the room code when the first candidate is already taken` (85/86, under load, nothing in `apps/functions` touched); the immediate rerun passed 86/86 (`emulator-suite-first-run-flake.log`). |

## Pop-out audit

Re-ran the existing 23 sheet cases, 4 dock-pinch scenarios and dock focus checks (all pass). Re-inspected every
pattern the previous audits inventoried; the source has no new popover, menu, listbox or datalist. No defect.

## Not covered

Physical iOS/Android, VoiceOver/TalkBack, a real TV at viewing distance, real two-finger pinch on WebKit,
iOS keyboard visual-viewport behaviour. Staging was not re-run (it predates the dock and this change).
Table text sizes are arithmetic from the CSS plus screenshots, not a computed-style probe.
