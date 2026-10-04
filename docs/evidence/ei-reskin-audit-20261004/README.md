# Reskin / pop-out audit, lane `sonnet-ei` (2026-10-04): no source change

Base: `a0e8f36` (the `sonnet-eg` candidate). **No source, test or tooling change.** Evidence and docs only. Not merged, not deployed.
Staging was touched read-only (three GETs of the landing page, `staging-readonly.log`); no room was created there.

## What was audited and why nothing changed

Pop-out inventory (re-read from source, matches `sonnet-dt`/`sonnet-ef`): native `<select>` with full-text echo, the single
`SheetDialog` (visual-viewport hook, internal scroll, safe-area, compact mode), the sticky `ActionDock`, `<details>` disclosures and
allocation/gear lists; no anchored popover, menu, datalist, tooltip or toast. The only open item the previous lane left was the
iPhone SE (3rd gen) Simulator failure ("no element has keyboard focus" typing into the create form's third field), recorded as
"rig vs page undetermined". This lane determined it:

- Reproduced on a dedicated `ei-iPhoneSE3` device (iOS 26.5): `ios-se3/app-page-failure.txt`. The first two fields type fine; after the
  tap on "Your display name" (hittable, frame y 292, above the keyboard top 451) the keyboard is gone
  (`keyboardTop=667`) and the page has scrolled back (`ios-se3/*tap-pre/post*.png`).
- **Control:** a bare static page with no app CSS or JS (`ios-se3/control-page.html.txt`: three 49px inputs with similar, not measured-equal,
  spacing, and the app's exact viewport meta including `interactive-widget=resizes-content`) on its own loopback port fails with the **same
  signature** (`ios-se3/control-page-failure.txt`: third field, hittable and above the keyboard, keyboard gone after the tap, XCTest "no keyboard
  focus"). A first control run used the meta without `interactive-widget`; it failed identically, and the reviewer asked for the exact meta.
  Source grep over `apps/web/src` for `blur(|onBlur|scrollIntoView|scrollTo(|.focus(|visualViewport|autoFocus`: only validation first-error
  focus, the sheet, the dock and a `<details>` scroll; none on the create form's focus path. A remount of the focused input is not excluded by
  grep, but the control reproduces the failure without any app code.
  Conclusion, bounded: **not attributable to app code on this rig** (iPhone SE 3rd gen Simulator only; no other 667pt device, no physical
  hardware, no XCUITest-free manual tap). No source change is justified; the item stays open for a physical SE-class phone.

## Gates (this worktree, isolated stack on 53xxx; emulator suite on 57xxx; no peer process touched)

| Gate | Result |
| --- | --- |
| prettier / lint / typecheck / tests (`check.log`) | prettier clean on the tree apart from a peer's transient untracked file (removed by it); lint (one existing warning, `auditHarnessContract.test.ts:395`), typecheck exit 0; **829 passed**, 11 todo (80 files, 1 skipped) |
| `npm run build` (functions + web) | exit 0 |
| `ui-audit.mjs` full, default fonts (`ui-audit.log`) | exit 1 ("UI AUDIT FOUND PROBLEMS"); 288 states: **0** control issues, **0** overflow, **0** hard axe, **0** contrast failures, 275 dock-focus checks, 23 sheet cases; 5 contrast pages scored on truncated slices; 6 findings, the corner `sonnet-eg` documented (13-14 letter ability names in a 157px gear-option label broken at 150-200% text on 320-375px) |
| `two-device-smoke.mjs --reload` (`smoke.log`) | ALL STEPS PASSED, no overflow at 375/768/1024/1280/1920 |
| Emulator suites, APFS clone with ports remapped to 57xxx (`emulator-suite.log`) | 18 rules + 86 Functions + 4 web passed, exit 0 |
| Real Mobile Safari, iPhone 17 Pro iOS 26.5 (`ios-17pro/`, `ios-17pro-sheet-rerun/`) | join-form validation passed, signed-in dock passed; the correction-sheet test failed once at "scene loaded" (30s wait) once (the 30s wait for the scene to load), and **passed on a rerun alone** (73s). Likely load, since the full audit shared the emulators at the time, but unconfirmed: one failure, one pass |
| Staging, read-only (`staging-readonly.log`) | 200 on the three URLs; the served shell carries `viewport-fit=cover, interactive-widget=resizes-content` |
| Independent duplicate run (peer session in this worktree, 56xxx stack, reported by message, logs not copied) | `npm run check` 829 passed; smoke passed; full `ui-audit` 288 states, same 6 findings, same single known axe best-practice on the nonexistent-room route |

## Not covered (still open)

Physical iOS/Android hardware, screen readers, Windows High Contrast, a real TV, real browser-chrome collapse; the `wide` fallback
residuals and the 292px-landscape 200%-text dock limit from earlier lanes; no new deployed build exists (John's call).
