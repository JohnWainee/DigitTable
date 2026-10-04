# Control / pop-out audit, lane `sonnet-ej` (2026-10-04): no source change

Base: `802ef4b`. **No source, test or tooling change survives.** Evidence and docs only. Not merged, not deployed. Staging was touched
read-only (three GETs, `staging-readonly.log`); no room was created there. The un-deployed candidate is not "deployed".

## Scope

Every select, disclosure, modal/sheet, option list and allocation/action picker, at phone (320, 375, 390, 412, 812x375 landscape),
tablet (768), desktop (1280) and table (1920x1080) widths, plus 150% and 200% text on the phones. The inventory re-read from source
matches the earlier lanes: native `<select>` with a full-text echo (`SceneDirector`, `GmToolsPanel`), the single `SheetDialog`
(`CorrectionDialog`; visual-viewport hook, internal scroll, safe-area, compact mode, focus trap, `inert` background), `<details>` "Why?",
the radio/checkbox option rows and `AllocationStepper`, the sticky `ActionDock`. No anchored popover, menu, datalist, tooltip or toast.

## Result of the full audit on the unchanged tree (`ui-audit.log`, `ui-audit-report.json`)

Private stack: Firebase emulators on 63xxx/64xxx and a Vite preview on 54173 (a peer lane, `sonnet-ds`, holds the 55001/59099/58080 set;
none of its processes was touched). 288 states, 3,256 controls: 0 control-size/inside-viewport/16px-type failures, 0 overflow, 0 hard axe
violations, 0 pixel-contrast failures among 8,456 boxes measured (but 5 contrast pages were scored on truncated slices, so not fully measured, and 314 boxes were reported insufficient-to-judge, none a failure), sheet, keyboard, pinch-zoom, safe-area, 200%-text and reduced-motion cases pass.
The single remaining category is the six findings earlier lanes recorded: a 10-14 letter ability/item name in an option row broken
across lines (`Phantasmagoria` at 375px/200% and 320px/150-200%, `Panzerfaust`, `submachine`, `Fragmentation` at 320px/200%).

## The one defect looked at, and why nothing changed

Root cause is arithmetic, not a stray rule. At 200% text on a 375px phone the option row's text column is ~209px (screen 16 + step 16 +
fieldset 13.6 + row 10.4 + borders + a 26.4px box and its 13.6px gap, both sides): "Phantasmagoria" needs ~220px, and 320px/200% leaves
~154px. Tried and rejected, with evidence in `hyphen-experiment/`:

- `hyphens: auto` (with and without `hyphenate-limit-chars`, `overflow-wrap` variants): the Chrome used here ships no hyphenation
  dictionary (`hyphen-experiment/hy.png`, variants A-F: every variant is cut mid-word, identically), so the change is unverifiable here and
  would differ per browser. A compose-state-only audit run (`--only-states compose`) with plain `hyphens: auto` also flagged ordinary short words ("rifle", "regain"), so it was not kept.
- Soft hyphens in text: would alter accessible names and every text-matching test for a handful of fixture words.
- Tightening gutters: recovers at most ~35px, enough for two of the six cases only, and would move the default-size layout of every screen.
- Considered, not tried (so not ruled out by evidence): stacking the checkbox above the label at >=150% text (~40px, ~250px column at 375px:
  would fix Phantasmagoria at 375/200%, not 320px) and dropping fieldset side padding on narrow screens (~31px); combined they might reach
  ~225px at 320px, marginal, and either changes every option row's layout. Deferred as a design decision. Note `overflow-wrap: anywhere`
  (styles.css `.gear-option`) is what permits the mid-word break; the alternative to it is horizontal overflow, which is worse.
- Shrinking option text with the container: breaks "text scales with the user's setting".

The six findings are therefore a physical limit of this nesting at the extreme text sizes, not something one CSS rule fixes honestly.
No source change is justified; the decision is recorded for John (see "Decisions" in the review).

## Gates (this worktree)

| Gate | Result |
| --- | --- |
| `npm run check` (`check.log`) | prettier, lint (one existing warning, `auditHarnessContract.test.ts:395`), typecheck, **829 passed**, 11 todo (80 files, 1 skipped) |
| `npm run build` (`build.log`) | exit 0 |
| `two-device-smoke.mjs --reload` (`smoke-report.json`) | ALL STEPS PASSED, no overflow at 375/768/1024/1280/1920 |
| `ui-audit.mjs` (`ui-audit.log`) | exit 1 on the 6 known word-break findings only |
| `ui-audit-selftest.mjs` | SELF-TEST PASSED when run with the experimental detector change, which was then reverted (observed in the session; no log kept, so treat as unlogged) |
| Emulator suites, config remapped to 64xxx (`emulator-suite.log`) | 18 rules + 86 Functions + 4 web passed, exit 0 |
| Staging read-only (`staging-readonly.log`) | 200 on `/`, `/join` and the `web.app` URL (status codes only; the viewport-meta grep returned nothing and is not claimed) |

`shots/` holds before screenshots (the full set of 288 states was ~100MB and is not committed): the long GM page at phone width, the GM
console at tablet and desktop, the compose step at table width, and the three word-break cases.

## Not covered (still open)

Physical iOS/Android hardware, real keyboards and browser-chrome collapse, a native select popup (owned by the OS, not capturable in headless
Chrome), screen readers, Windows High Contrast, a real TV; real-Safari lanes from `sonnet-ed`/`sonnet-ei` were not rerun.
The GM console is one 5,600px scroll at 375px with no section navigation (`shots/gm-console-edit-target-phone.jpg`): a possible future
improvement, a layout change well beyond this lane's control-audit scope.
