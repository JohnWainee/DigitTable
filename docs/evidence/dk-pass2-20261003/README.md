# Dock and pop-out audit, pass 2 (2026-10-03)

Isolated emulator stack on remapped ports (Auth 19099, Firestore 18080, RTDB 19000, Functions 15001; web preview 4274; a peer lane holds the defaults). No deploy, no production resource.

| Gate | Result |
| --- | --- |
| `npm run check` | pass: 796 passed, 11 todo |
| `npm run build` | pass (chunk-size warning only) |
| `ui-audit.mjs` (final code) | 288 states, 3,320 controls, 0 control issues, 0 overflow, 0 hard axe findings, 297 dock focus checks, 23 sheet cases (now including 320px at 200% text, gating), 0 failures. `ui-audit-summary.json` |
| `ui-audit-selftest.mjs` | pass, including 320x568@32px, 375x667@24px and GM-card dock cases; each fails with its fix removed |
| `two-device-smoke.mjs --reload` | 17/17 (`smoke.log`) |
| Emulator suites (APFS clone, ports 28080/29000/29099/25001) | 18 rules + 86 Functions + 4 web passed (`emulator-suite-summary.log`), run on `ac2406e`; later commits changed only CSS and tests |

`shots/`: viewport captures of the dock (player Compose/Allocation, GM pending card) at phone 320/375/390/412, landscape, tablet narrow/tablet, desktop and table widths, and the Correction sheet at 150% and 200% text.

Not covered: physical iPhone/Android (iOS toolbar collapse, rubber-band, thumb reach, WebKit overscroll), VoiceOver/TalkBack, true iOS-Safari keyboard (visual viewport shrinking alone cannot be produced in headless Chrome).
