# Reskin pop-out and visual-viewport audit, lane `sonnet-dt` (2026-10-03)

Base: reviewed `47bc087` (dock zoom/short-viewport release). No source change in this pass: the audit found no
in-scope defect, so this directory records the evidence instead of churning code. No deploy, merge, or production
resource; no staging write.

## Stack

Isolated Firebase emulator stack on remapped ports (Auth 57099, Firestore 57080/57081, RTDB 57000, Functions 57001,
hub 57400) with `demo-digitable`; web bundle built with a throwaway, untracked Vite plugin that swaps only those
port numbers in `emulatorConfig.ts`, served by `vite preview` on 57274. Peer lanes hold 9099/8080/9000/5001; they
were not touched. The helper files (`firebase.remap.json`, `apps/web/vite.remap.config.ts`, `dist-remap`) are
git-excluded and not committed. Browser runs used their own Chrome debug ports (57333, 57350).

## Inventory re-audited from source (every pop-out pattern)

| Pattern | Where | Finding |
| --- | --- | --- |
| Native `<select>` (OS-owned popup, cannot clip) | `GmToolsPanel` x4, `SceneDirector` x2 | 16px type, >=44px, full width; full-text echo |
| `<details>` disclosure | Compose "Why?" | opens in flow, scrolled clear of the dock |
| Modal bottom sheet | GM `CorrectionDialog` via `SheetDialog` | visual-viewport sized, inert background, safe-area, compact mode |
| Allocation / target pickers | inline radios and the dock | inline lists, no anchored popover |
| Sticky `ActionDock` | Compose, Allocation, Injury, GM pending card | pinned, capped, `data-clipped`, `data-unpinned` under zoom/short viewport |
| `position: fixed/absolute` | CSS: `body::before` (inert, `pointer-events: none`), decorative tape/halftone/art overlays, `.sheet-backdrop` | no interactive overlay outside the sheet |

No docked panel contains a text-entry control (radios/checkboxes/steppers only), so the dock never competes with an
on-screen keyboard; text inputs live on landing, GM tools/scene director and the correction sheet, all covered by
the keyboard-focus audit.

## Gates

| Gate | Result |
| --- | --- |
| `npm run check` (format, lint, typecheck, tests) | 803 passed, 11 todo (80 files passed, 1 skipped) = base, clean |
| `npm run build` | passed (chunk-size warning only) |
| `ui-audit-selftest.mjs` | SELF-TEST PASSED (`selftest.log`) |
| `ui-audit.mjs` (real Chrome, remapped stack) | 288 states, 3,192 controls, 0 control issues, 0 overflow, 0 hard axe, 87 keyboard focus checks, 153 dock focus checks, 4 dock pinch scenarios, 8 validation scenarios, 23 sheet cases, 0 failures; only the known `page-has-heading-one` note on the missing-room route (`ui-audit.log`, `ui-audit-report.json`) |
| `two-device-smoke.mjs --reload` | ALL STEPS PASSED (`smoke.log`), incl. no overflow at 375/768/1024/1280/1920 |
| Emulator suites (APFS clone, ports remapped in the clone only) | 18 rules + 86 Functions + 4 web passed |

Control counts vary a little run to run with the random roll (3,192 here vs 3,400 in the previous record).

## Not covered (physical-device limits)

Headless Chrome cannot reproduce iOS Safari's keyboard (visual viewport shrinks while the layout viewport does not),
real two-finger pinch on WebKit, browser-chrome collapse/rubber-band, a physical thumb on the dock, VoiceOver/TalkBack
reading of the dock status and per-die legends, desktop trackpad pinch (emulated with `Emulation.setPageScaleFactor`).
Staging was not re-run: it predates the dock.
