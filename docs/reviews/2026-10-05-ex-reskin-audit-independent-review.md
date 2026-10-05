# Independent review: reskin/pop-out audit of `8839c75`, lane `sonnet-ex` (2026-10-05)

- **Scope:** evidence-only unit `docs/evidence/ex-reskin-audit-20261005/`; static re-read of the sheet, Back-dismiss, visual-viewport and dock code and CSS.
- **Reviewer:** one fresh read-only subagent, separate from the author (ran no browser or server).
- **Verdict:** approve with fixes to the write-up; no source defect found.

| Finding | Disposition |
| --- | --- |
| Medium: README cited this review file before it existed. | **Fixed** (this file). |
| Low: the extra focus/Back/Forward/Apply probe result was not evidenced. | **Fixed:** probe committed as `focus-restore-probe.mjs`; README states the output was observed, not saved. |
| Low: real Mobile Safari "4 tests, 0 failures" is carried over from `sonnet-eu`, no mobile screenshots here. | **Accepted**; README says carried over, not re-run. |
| Low: `SheetDialog.tsx:124` focus falls back to `<body>` if the trigger unmounts while open. | **Accepted**; the only caller's trigger persists (probe: focus restored after Apply). |
| Low: inert set is a mount-time snapshot (`SheetDialog.tsx:108-112`). | **Accepted**, documented in code; revisit if a body-level toast is added. |
| Low: reload with a sheet open leaves one inert extra Back (`useBackDismiss.ts:34-38`). | **Accepted**, documented. |
| Info: `ActionDock` observes only mount-time children. | **No action**; always exactly two children. |

Reviewer verified every README number against the raw logs and reports, found no secrets in them, and confirmed the diff touches only `docs/`.
