# Reskin UI/UX audit of PR #41 candidate `fc2217d` (2026-10-02)

- **Branch:** `sonnet-cy/reskin-uiux-20261002`, from `fc2217d`.
- **Scope:** independent re-audit of every select, disclosure, modal sheet, option list, allocation/action picker and secret/recovery entry at 320/375 portrait, landscape (812×375, 667×375, 926×428), tablet, desktop and table sizes, including visual viewport/keyboard, safe areas, 200% text, pinch zoom, focus, internal scroll and overflow; plus authorization/privacy/projection invariants and asset provenance.

## Verdict: no product defect found; no product code changed

The pop-out system (`SheetDialog`, six native `<select>`s, one `<details>`, `AllocationStepper`) and `styles.css` are unchanged from the sources earlier passes reviewed. The claimed `98bb2db` and `ebac344` fixes are present in this base (verified in source, not from handoff prose).

## Coverage gap found and closed (harness only)

`scripts/playtest/ui-audit.mjs` had **no state for the recovery-entry screen** ("Lost your browser? Recover your seat"), although an earlier handoff line said the audit covered the recovery form. It also swept 200% text only on the two portrait phones. Added:

- states `recover-form`, `recover-filled`, `recover-rejected`, and a final `recover-success` (redeems the player's real recovery code typed in lower case, so the `trim().toUpperCase()` normalisation is exercised end to end; last because redemption rebinds the seat);
- the 200% text sweep now also runs at `phone-landscape` (812×375) and `tablet`.

Pin: `reskinContract.test.ts` "keeps recovery entry and landscape/tablet 200% text inside the real-browser audit" (mutation-verified: renaming a state, or dropping the tablet viewport, fails it).

## Evidence (all local, loopback, `demo-digitable` emulators; nothing deployed)

- Full audit: **174 states, 116 large-text sweeps, 1,530 controls, 0 control issues, 0 overflow, 0 hard axe violations, 0 failures**; 15 modal records (incl. landscape keyboard, pinch, safe area, 150/200% text, reduced motion) all checks true; zero console/request errors on gm/player/table/anon. One non-gating best-practice note: `page-has-heading-one` on the intentional nonexistent-room route. `docs/evidence/cy-uiux-recovery-audit-20261002/ui-audit-report.json` plus screenshots (recovery states at phone-small/phone/tablet/table, sheet at landscape/phone-small, 200% text).
- `two-device-smoke.mjs --reload`: **17/17**, no console/request errors, no overflow at 375/768/1024/1280/1920.
- `npm run check` (708 + this pin; see handoff), `npm run build`, emulator suite **108/108** (18 + 86 + 4).
- A first live audit attempt aborted at 42 states because the Firestore emulator received SIGTERM (exit 143) mid-run; it was discarded as environmental and rerun on a fresh stack.

## Independent review

Fresh read-only agent: **approve with nits, no P0**. Dispositions:
- P1 (hypothesis): the rebound seat's old UID could make the still-open player/table devices log permission-denied console errors and fail `console/*`. **Disproved by runs**: both audits containing the final redemption ended with zero console errors on every device. No change.
- P2 static pin could pass on a comment or ignore ordering/lower-casing → fixed (matches `captureState(anon, "<state>"`, compares against `console-next-scene`, pins `toLowerCase()`, whitespace-tolerant viewport pin).
- P2 screenshots of `recover-success` show a throwaway emulator code → not committed to evidence. `report.json` holds no codes (checked).
- P2 control-issue messages could echo a typed value → only the fake `WRONG-CODE-0000` is ever typed in a captured state; left alone.

## Not verified (unchanged, outstanding)

Physical iOS/Android hardware, real iOS Safari visual-viewport keyboard (headless Chrome shrinks the layout viewport), Firefox/other browsers, screen readers and other assistive technology, Windows High Contrast, real browser text-size settings, touch feel. No deployment or merge; staging still serves a pre-candidate build.
