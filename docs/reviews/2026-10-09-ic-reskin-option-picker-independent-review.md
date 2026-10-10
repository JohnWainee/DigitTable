# Option-picker pop-out and role-accent independent review

- **Date:** 2026-10-09
- **Branch:** `sonnet/ic-reskin-orchestrated-20261009` (from `origin/main` `b599abd`; no prior unmerged reskin branch was cherry-picked or merged)
- **Range reviewed:** `b599abd..519e379`; author's resolution in the follow-up commit on the same branch
- **Reviewer:** one fresh Claude agent with no access to the author's reasoning, read-only on the worktree. It ran `npx vitest run apps/web` (272 passed). It did **not** run the browser audit or mutation tests; the author ran those (below).
- **Verdict:** no blocking findings; four findings (1 Medium, 3 Low), all resolved. The fixes were verified by the full gates and a mutation check, **not re-reviewed** by the reviewer.

## Scope

Presentation-only change to `apps/web`. The six native `<select>` controls (GM `SceneDirector`, `GmToolsPanel`) become a shared `OptionPicker` whose option list opens in the existing `SheetDialog` (bottom sheet on phones, centred card when wide), so the list is inside the visual viewport, scrolls internally, has 48 px wrapping rows, repeats the field name and current choice, and inherits the sheet's inert background, focus trap, Escape, safe-area and scroll lock. A per-screen `--role` accent (player cyan, GM pink, table acid, landing riot) differentiates surfaces by a top band and panel shadows (decorative; role remains named in headings). The audit script gained `auditPickers()` and a fix for a stale "Rook" character lookup that no longer matches the sourcebook roster. No engine, contract, authorization, projection or data change; no new asset (the textures remain the procedural CSS recorded in `assets/generated/eat-the-reich/README.md`, so no new provenance entry is needed).

Pop-out inventory after the change: 6 option pickers (sheet), the correction sheet (sheet), the in-flow "Why?" `<details>` disclosure. There is still no menu, tooltip, toast or anchored popover anywhere in `apps/web/src`.

## Findings and resolution

| ID | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | Medium | The three `GmToolsPanel` pickers had no tests; dropping `setAdvanceId(next?.advances[0]?.id ?? "")` left the suite green | New `test/gm2/GmToolsPanel.test.tsx` (defaults, advance re-pointing, same-character re-choose keeps the advance, unlock and reassign submissions). Mutation check: removing the `setAdvanceId` reset now fails two named tests; the file was restored from a copy afterwards |
| 2 | Low | The edit-target picker lost the select's blank "Choose one…" entry, so a chosen target could not be cleared | `OptionPicker` `emptyLabel` prop adds a leading `""` option; `SceneDirector` passes it; unit test added |
| 3 | Low | `.picker-trigger-value` truncated long values at 320 px / large text | The value now wraps (`overflow-wrap: anywhere`); the control grows instead of clipping |
| 4 | Low | Stale `<select>` wording in a test comment | Comment updated |

Reviewer-verified as fine: state flow identical to the select (no `onChange` for an unchanged choice), focus return after un-inert, no picker nested in another sheet (nested sheets would close together on Escape; no call site does this), axe in both closed and open states, the audit cannot pass vacuously (minimum trigger count, option-row and viewport assertions, a real value-change check), and the `— claimed` lookup does not match `— unclaimed`.

## Author's gates (final code)

All local; the emulator suite ran on a port-remapped copy because a peer lane held the default emulator ports (see `CLAUDE_HANDOFF.md`).

- `npm run check`: exit 0, 705 passed, 11 todo.
- `npm run build`: exit 0 (existing Vite large-chunk warning only).
- Emulator suite (remapped copy): 18 + 86 + 4 passed.
- `ui-audit.mjs` (after): 150 states, 1,422 controls, 0 control issues, 0 overflow states, 0 hard axe violations, 0 failures; the pickers pass at 320×568, 375×812, 812×375, 360×300 (keyboard-short), 768×1024 and 1280×800 (36 records) with the dialog, current choice, rows and Cancel inside the viewport, rows ≥ 44 px and ≥ 16 px type, scroll lock, inert background and focus return.
- `two-device-smoke.mjs --reload` (local emulators): all 17 steps passed.

## Limits

- Headless Chrome cannot shrink only the visual viewport; the short-height case is a layout-viewport resize (`360×300`). The iOS-Safari visual-viewport case stays covered by jsdom tests only; a physical-device pass remains open.
- The reviewer did not re-review the fixes.
