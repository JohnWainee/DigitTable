# Independent review: forced-colors disclosure marker and the `652ba15` lint-gate repair, lane `sonnet-ez` (2026-10-05)

- **Scope:** (1) disposition of `652ba15` (ESLint ignores `docs/evidence/**`); (2) the lane's one product change, `summary::before { background: LinkText }` inside the forced-colors block of `apps/web/src/styles.css`, its contract test, and the harness additions (`ui-audit.mjs --emulate-media / --text-spacing`, `sheet-text-spacing-probe.mjs`).
- **Reviewers:** (1) the `sonnet-ez` author, who did not write `652ba15` (Codex automation did), reproduced the failure and ran negative controls; a separate subagent did **not** look at it. (2) One fresh read-only subagent, separate from the author, which ran Chrome probes against the unfixed and fixed bundles and mutated a scratch copy of the CSS.

## 1. `652ba15` — lint gate: correct, no change needed

| Check | Result |
| --- | --- |
| Reproduce the original failure | With the pre-repair config (`git show 8839c75:eslint.config.js`), `eslint docs/evidence/ex-reskin-audit-20261005/focus-restore-probe.mjs` fails: `Parsing error: ... was not found by the project service ... allowDefaultProject ... does not match`. It is a project-service parse error on a standalone Node script, not a code-quality finding. |
| Repaired config passes | `npm run lint`: 0 errors, the one existing `explicit-function-return-type` warning. |
| Application and test source still linted | Negative control in a scratch clone: an unused variable in `apps/web/src/` and in `apps/web/test/` is reported as `@typescript-eslint/no-unused-vars` errors; the same file under `docs/evidence/` is skipped ("File ignored because of a matching ignore pattern"). |
| Blast radius | `docs/evidence/**` held exactly one code file at the time (`focus-restore-probe.mjs`); the glob matches the already-ignored `scripts/**` convention. Prettier still checks evidence formatting (`.prettierignore` only skips `docs/evidence/**/*.json`). |
| Behaviour change | None: `git show 652ba15 --stat` is `CLAUDE_HANDOFF.md` and `eslint.config.js` only. |

Disposition: **accept.** Nit (not changed): that commit's handoff edit replaced the "Last updated" lane chain with prose; this lane restores a chain.

## 2. Product change and harness: approve with fixes (all applied)

Reviewer verdict: **approve with fixes; no blocking findings.** Measured by the reviewer: bundles differ by exactly one rule; marker `rgb(0,0,0)` / `rgb(255,255,255)` before, `rgb(255,255,0)` / `rgb(0,0,159)` after (equal to the label); `currentcolor` still Canvas, `CanvasText`/`ButtonText`/`LinkText` survive; specificity equals the base rule and the rule comes later; open-state rotation, clip-path and size survive; the new test goes red when the rule is removed, set to `currentcolor`, moved to the `prefers-contrast` block, or aimed at `::after`; default-mode behaviour of the harness is unchanged with no flags.

| Finding | Disposition |
| --- | --- |
| Medium: a misspelt feature (`forced-colours=active`) was accepted silently, running an ordinary audit. | **Fixed:** each requested feature is proven with `matchMedia` after `setEmulatedMedia`; a miss throws (cleanly closes the browser, exit 1). Negative control run: `FAIL flow: --emulate-media forced-colours=active did not take effect`. Pinned in `auditHarnessContract.test.ts`. |
| Low: CSS comment said "LinkText is the colour the UA gives the label" without saying "in Chrome". | **Fixed** (comment states Chrome, both palettes measured, other engines still visible). |
| Low: the test name said "every glyph" but pins two. | **Fixed:** renamed to the disclosure marker and checked mark; the marker regex now also accepts `background-color` and `CanvasText`/`ButtonText`. |
| Low: pixel-contrast skip read like a pass (`contrastFailures: 0`). | **Fixed:** summary carries `pixelContrastSkipped`. |
| Low: `\\s+` escapes in the new template-literal expressions were unpinned. | **Fixed:** pinned (`replace(/\\s+/g`, `split(/\\s+/)`, and `[\\d.]`). |
| Info: the clip audit would flag a visually hidden 1px label. | **Fixed:** boxes of 1px or less are skipped (latent only; the app has no such class). |
| Low (accepted): `.threat-token-cross` (red X on a beaten threat token) is Canvas on Canvas in forced colors. | **Accepted, no change:** it is `aria-hidden` and decorative; the state is carried by the line-through text and the "(status)" text. |
| Info: scratch `/private/tmp` paths in new evidence logs. | **Accepted;** 41 earlier evidence files already do. |

**Not verified by the reviewer:** real Windows High Contrast, Firefox, Safari; `sheet-text-spacing-probe.mjs` (only read); a full `ui-audit.mjs` run; the full test suite; `652ba15` (covered in section 1 by the author).
