# HE reskin pass: independent review

- **Date:** 2026-10-07
- **Branch:** `sonnet-he/reskin-orchestrated-20261007` (from `b599abd`, which already contains the 2026-09-18 ink-black reskin and `SheetDialog`)
- **Reviewed:** commit `1907b32`; remediation in the following commit
- **Reviewer:** one fresh read-only Claude agent with no access to the author's reasoning. Its attempted mutation tests never ran (BSD `sed`, no `timeout`), so the test-strength findings are by reading, not by mutation. Re-running mutations remains open.
- **Verdict:** no High findings; two Medium and four Low/Nit findings, all remediated or recorded below.

## What changed

- **Riot-print layer** (`styles.css`): hazard-stripe masthead (`body::before`, below the sheet backdrop, click-through), cyan/riot misregistered heading shadow, pink/cyan alternating panel tops and legends, faint scratch overlay on panels. Original CSS only; no new art.
- **`SelectField`**: the six GM `<select>`s keep the native OS picker (it can never clip off-screen) and gain a visible, wrapped echo of the full selected label, because the closed control ellipsises ("The Abandoned Métro Platf…").
- **Option rows**: "Mark and regain Blood" moved out of the checkbox `<label>` into a `.gear-row` sibling that wraps to its own full-width line. Before, it was squeezed into a narrow column inside the label.
- **Audit** (`ui-audit.mjs`): fixed the stale "Rook" roster lookup (the pre-existing audit aborted before the modal checks on the sourcebook roster); added echo and option-row checks to every state, and a keyboard-open focus sweep over every text field and select on the GM console and join form at 320/375/812 wide.
- Engine, authorization, projection and template code are untouched.

## Findings and resolution

| ID  | Sev    | Finding                                                                                                    | Resolution                                                                                                                                  |
| --- | ------ | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Medium | `aria-describedby` to the echo made screen readers read the value twice, or "Selected Choose one…" when hidden | Echo is `aria-hidden` visual help, `aria-describedby` removed; test asserts both                                                          |
| 2   | Medium | `:nth-of-type(even)` alternation counted by element type, not by position                                    | Switched to `:nth-child(even)`; contract test pins the selector                                                                             |
| 3   | Low    | Fixed masthead could cover focus rings at the top edge (WCAG 2.4.11)                                        | `html { scroll-padding-top: 1.25rem }`; keyboard sweep now requires focused fields to sit at least 8 px below the top                        |
| 4   | Low    | Contrast test pinned tokens, not the actual rules                                                          | Test asserts the declared `color`/`background` of the echo tag and legend; reviewer's computed values: 5.13, 5.05, 6.38, 13.9 : 1             |
| 5   | Low    | Overlay safety (`position: relative`) unasserted                                                           | Asserted                                                                                                                                    |
| 6   | Low    | Audit false-pass risks: tautological top check, viewport left shrunk, unchecked echo claim                | Top-edge floor, viewport restored after the sweep, echo found by id and checked for visibility, bounds and full label. `truncatedSelects` is recorded only (selects do not report overflow reliably) |
| 7   | Nit    | Checkbox might shrink at 200% text                                                                         | The checkbox rule already has `flex: none`; not reproduced                                                                                  |

## Verification (after remediation)

- `npm run check`: exit 0 (see handoff for counts); `npm run build`: exit 0.
- `ui-audit.mjs`: 150 states, 1,434 controls, zero control issues, zero overflow states, zero hard axe violations, zero failures. The one best-practice `page-has-heading-one` on the intentional nonexistent-room route is unchanged. The 320 px + 200 % text sheet geometry stays recorded as non-gating, as before.
- `two-device-smoke.mjs --reload`: all 17 GM/player/table steps passed.
- Emulator suites (from a throwaway port-remapped copy, because peer lanes hold the default ports): 18 + 86 + 4 tests passed.
- Evidence: `docs/evidence/sonnet-he-reskin/{before,after}` (curated screenshots and `report.json`), `e2e-playthrough/report.json`.

## Limits (not hidden)

- No physical phone and no real iOS Safari pass: headless Chrome cannot shrink only the visual viewport, so the keyboard sweep emulates Chrome Android behaviour (layout viewport shrinks). Native selects are OS pickers on phones and were therefore audited at the closed control, not the popup.
- No Firebase deploy, merge, or production resource was touched.
