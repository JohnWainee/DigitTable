# hc pixel-contrast fix: independent review

- **Date:** 2026-10-07. **Base:** `b73f3cd`. **Change:** `apps/web/src/styles.css`, `apps/web/test/styles/reskinContract.test.ts`, `scripts/playtest/ui-audit.mjs`, evidence, docs. No engine, contracts, template, authorization, projection or Firebase file (reviewer confirmed from the diff).
- **Author:** Sonnet hc contrast session. **Reviewer:** a separate fresh read-only subagent (diff and file reads; it ran nothing).
- **Verdict:** approve with changes; all resolved.

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Pixel pass defaulted to `phone,desktop`; claim of 5 viewports needed explicit flag | Default is now all five; the committed run used it. |
| 2 | 6000 px cap silently dropped items | Counted per state as `truncatedItems` (0 in the committed run). |
| 3 | Items with < 4 glyph pixels skipped silently | Counted as `skipped` (75, small/thin text). |
| 4 | Ancestor opacity, overlapping elements, clipped overflow are not modelled | Accepted; documented as limits in the evidence README. |
| 5 | CSS change: matches only the SceneCard h3s inside `.table-screen`; GM/player h3s unaffected; wraps at 320 px/200%; forced-colors falls back to Canvas text, legible | Confirmed, no action. |
| 6 | Test did not pin `width`, `max-width` or the table `--sc` pink | Assertions added. |
| 7 | Process: record gates and review | This file, the evidence README and the handoff entry. |

Not verified by the reviewer: any rendered output, the suite, the emulators.
