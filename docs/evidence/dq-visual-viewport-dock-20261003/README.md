# Dock under a zoomed or short visual viewport (2026-10-03, lane `sonnet-dq`)

Base: reviewed `888e5e1`. Isolated emulator stack on remapped ports (Auth 49099, Firestore 48080, RTDB 49000, Functions 45001, hub 44400; web preview 44274; peers hold the defaults and the 3xxxx range). No deploy, no production resource; staging was only read (`--routes-only`).

## Defect found by the audit

`position: sticky; bottom: 0` follows the *layout* viewport, which is not what a pinch-zoomed person sees. Measured in headless Chrome (390x844, real `styles.css`, scrolled to mid-page):

| page scale | visible height | dock vs visible area |
| --- | --- | --- |
| 1x | 844 | pinned at the bottom edge (correct) |
| 1.5x | 563 | dock 281px below the visible area |
| 2x | 422 | dock 422px below the visible area (action unreachable until panned) |
| 3x | 281 | dock 563px below; 44% of the magnified view once panned to |

Low-vision users who zoom were the people the bar helped least.

## Change (presentation only)

`ActionDock` sets `data-unpinned` while `visualViewport.scale > 1.05` or `min(visualViewport.height, innerHeight) < 20rem`; CSS releases the bar into the page flow (static, no cap, no shadow, no scroll-padding). It re-pins at 1x. The `20rem` rule extends the existing layout-viewport media query to the *visual* viewport (iOS keyboard shrinks only that). No authority, authorization, projection, privacy, Firebase or asset change.

## Inventory audited (every pop-out)

| Pattern | Where | Result |
| --- | --- | --- |
| Native `<select>` (OS popup, never clipped) | GmToolsPanel x4, SceneDirector x2 | 16px type, >=44px, full width; echo on the three that can ellipsise a distinguishing label; audit gates all |
| `<details>`/`<summary>` | Compose "Why?" | opens in flow, scrolls clear of the dock (pass 2) |
| Modal bottom sheet | GM Correction (`SheetDialog`) | visual-viewport sized, inert background, safe-area, 23 audit cases |
| Allocation / action pickers | inline radios and the dock | inline lists, not popovers; contract test forbids anchored popovers |
| Sticky dock | Compose, Allocation, Injury, GM card | **this lane: zoom / short visual viewport** |

## Gates

| Gate | Result |
| --- | --- |
| `npm run check` | 803 passed, 11 todo (796 base + 7), lint clean |
| `ui-audit.mjs` | 288 states, 3,400 controls, 0 control issues, 0 overflow, 0 hard axe; 387 dock focus checks; 23 sheet cases; **4 new dock-pinch scenarios (1x sticky, 2x/3x released, back to 1x sticky), 0 failures**. Only the known `page-has-heading-one` note on the missing-room route. `ui-audit-summary.json` |
| `ui-audit-selftest.mjs` | pass, incl. new real-stylesheet `data-unpinned` case |
| `two-device-smoke.mjs --reload` | 17/17 (`smoke.log`) |
| Emulator suites (APFS clone, remapped ports) | 18 rules + 86 Functions + 4 web (`emulator-suite-summary.log`) |
| Staging (`https://digitable.signal-bleed.com`) | `--routes-only` passes at four viewports; deployed CSS predates the dock (no `.action-dock`), so staging shows none of this lane |

`shots/`: viewport captures of the dock at phone, tablet, desktop and table widths (player Compose, Allocation x2, GM pending card).

## Not covered (physical-device gaps)

Real iPhone/Android: iOS Safari keyboard (visual viewport shrinks alone; headless Chrome cannot produce it, so the `<20rem` visual-height branch is proven by unit test and CSS contract, not by a real engine), real two-finger pinch on WebKit, dock under browser-chrome collapse and a thumb, VoiceOver/TalkBack, desktop trackpad pinch. Pinch is exercised with CDP `Emulation.setPageScaleFactor`.
