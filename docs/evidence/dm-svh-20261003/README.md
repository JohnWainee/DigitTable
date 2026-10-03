# Page height under dynamic browser chrome (2026-10-03)

Base `888e5e1`. Presentation only: `apps/web/src/styles.css` (`body`) and one contract-test block. No deploy, no production resource. Isolated emulator stack on remapped ports (Auth 29099, Firestore 28080, RTDB 29000, Functions 25001; web previews 24274 after / 24275 before); other sessions' stacks were not touched.

## Audit (all remaining pop-out and viewport patterns)

| Pattern | Finding |
| --- | --- |
| Native `<select>` (SceneDirector, GmToolsPanel) | OS-owned popup. Long-text selects echo the choice (`SelectedOptionEcho`); the three character selects hold short names. No change. |
| `<details>` (Compose "Why?") | Scrolls clear of the dock (pass 2). No change. |
| `SheetDialog` | Visual-viewport sized, safe-area aware, compact mode, IME-Escape guard. No change. |
| Action dock | Dock forms contain only radios and checkboxes, so the dock never coexists with a text keyboard. No change. |
| Text-input screens (join, create, GM tools) | 16px control font, no fixed bars; the layout viewport resizes (`interactive-widget=resizes-content`). No change. |
| **`body { min-height: 100vh }`** | **Defect.** On a phone 100vh is the viewport with the toolbars collapsed, taller than what is visible at load, so a one-screen page (landing, join) scrolls by the toolbar height with a blank band. The only unguarded viewport unit left in the stylesheet. |

## Change

`body` keeps `min-height: 100vh` as the fallback and gains `@supports (height: 100svh) { body { min-height: 100svh } }`. `svh` (toolbars showing) is used rather than `dvh` because it never over-scrolls and does not change while the toolbars animate, so there is no reflow during scroll. Tests: `reskinContract.test.ts` "page height under dynamic browser chrome" (vh base then svh override behind `@supports`; no bare vh outside the known sheet/dock uses). Mutation-checked: reverting the svh rule fails the first test.

## Gates

| Gate | Result |
| --- | --- |
| `npm run check` | format, lint (one pre-existing warning), typecheck pass; 798 passed, 11 todo. Run with another session's untracked scaffolding files excluded from prettier/eslint. |
| `npm run build` | pass (chunk-size warning only) |
| `ui-audit.mjs` (after) | 288 states, 3,192 controls, 0 control issues, 0 overflow, 0 hard axe findings, 153 dock focus checks, 23 sheet cases, 0 failures (`ui-audit-after.log`) |
| `ui-audit-selftest.mjs` | pass |
| `two-device-smoke.mjs --reload` | 17/17 (`smoke.log`) |
| Emulator suites (clone with remapped ports) | 18 rules + 86 Functions + 4 web passed (`emulator-suite-summary.log`) |

## Captures

`shots/landing-{phone,tablet,desktop,table}-{before,after}.png` (390x844, 820x1180, 1280x800, 1920x1080) and `audit/` samples. They look the same **by design**: headless Chrome has fixed toolbars, so `100vh` equals `100svh` and the defect cannot be reproduced there; the rule is pinned by the contract test. `audit/` holds a small sample of the audit's own captures.

Not covered: physical iPhone/Android (toolbar collapse, rubber-band), VoiceOver/TalkBack, real iOS keyboard.
