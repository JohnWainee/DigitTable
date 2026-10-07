# hd reskin lane — independent review (2026-10-07)

Reviewer: separate Sonnet session `476b77`, which made no tracked edits. It shared the worktree with the author session, so the author's commits were reviewed as they landed. Branch `sonnet-hd/reskin-orchestrated-20261007`.

Revisions verified: `456f3ec` (integration plus the gutter and recovery fixes), `8d31c11` (blacker wash, `.step.needs-attention`, recovery regression test), and docs-only `0356760` and `a713b64`. Between `8d31c11` and `a713b64` the only non-doc changes are two files totalling 54 insertions, which are the evidence README and handoff text.

## Scope reviewed

- The presentation diff from `354e7c9` to `HEAD`: `styles.css`, `PendingActionsPanel.tsx`, `JoinScreen.tsx`, `reskinContract.test.ts`, `RecoveryCodeEntry.test.tsx`, `scripts/playtest/ui-audit.mjs`, and the evidence.
- No engine, contracts, template, Functions, rules, projection or authorization file is touched. `git diff 354e7c9..HEAD --stat` confirms it. Invariants are therefore unchanged: this is presentation plus one client-side input normalisation.

## Verification I ran (isolated stack on remapped ports; no peer process touched)

| Check | Result |
| --- | --- |
| prettier on tracked files, eslint (with the git-excluded local Vite configs ignored), typecheck | clean on `456f3ec` and `8d31c11` |
| `npm test` | 716 passed / 11 todo at `456f3ec`; **719 passed / 11 todo** at `8d31c11` |
| `npm run build` | passes; only the existing chunk-size warning |
| `ui-audit.mjs`, real Chrome, local emulators, `8d31c11` | **150 states, 1,422 controls, 0 control issues, 0 overflow states, 0 axe hard violations, 0 failures**. 17 modal scenarios pass. They include `back-closes-only-the-sheet`, `short-visible-140`, `short-visible-160-landscape`, `text-150-phone-small`, `text-200-phone` and the **now-gating** `text-200-phone-small`. The only best-practice note is `page-has-heading-one` on the intentional nonexistent-room route. |
| `two-device-smoke.mjs --reload`, `456f3ec` and `8d31c11` | **17/17** both times |
| Emulator suite, all five emulators including RTDB, run in an APFS clone with only the port numbers changed | **18 rules/testing + 86 Functions + 4 web passed**, at `456f3ec`. Later commits change no Functions, rules or contracts file; the 4 web emulator tests do not render CSS. |

An earlier audit run failed (`[table] timed out`, `auth/network-request-failed`) because an outside process sent SIGTERM to my emulator mid-run. It reproduced neither on rerun nor in the log, and I did not count it. It matches the known peer-kill hazard in the handoff.

## Requested focus areas

**(a) Pop-out inventory completeness: confirmed.** I grepped `apps/web/src` independently of the author's table.

- There are 6 native `<select>` elements: `SceneDirector` ×2 and `GmToolsPanel` ×4, each with `SelectedEcho`.
- There is 1 `SheetDialog`, used only by `CorrectionDialog`, and 1 `<details>` ("Why?" in `ComposeStep2`).
- `.gear-option` rows are in `ComposeStep2`, `PendingActionsPanel` and the `SceneDirector` threat row. Radio and checkbox inputs sit in `ComposeStep2` and `CorrectionDialog`.
- `role="menu"`, `role="listbox"`, `aria-haspopup`, `popover`, `<dialog>`, `<datalist>` and `title=` tooltips: no matches.

So there is no anchored popover, menu or drawer to convert to a bottom sheet. The pattern the task prefers already applies to the one floating surface that exists. Native selects and `<details>` cannot clip: the OS owns the picker and the disclosure is in-flow.

**(b) Contrast of the new riot/pink colours: pass.** I computed WCAG ratios from the tokens in `styles.css`.

- Riot `#ff3348` on `--ink-1` is 5.54:1 and on `--ink-0` is 5.75:1.
- Pink `#ff3fae` on `--ink-0` is 6.49:1, and as the card border on the pink-tinted card (`#20121f` blended) 5.63:1. Both clear the 3:1 non-text minimum with margin.
- Paper text on the tinted `.pending-action-card` is about 15.7:1.
- The new colours are used only for border, shadow and a 7% tint, never as the sole text colour. The heading and list text still say "Pending actions", so colour is not the only channel (WCAG 1.4.1). axe colour-contrast ran in real Chrome with 0 violations.

**(c) Anything lost in the lineage merge: nothing found.**

- `9c6d254`, the final-verified fq tip, is an ancestor of `HEAD`.
- The audit's pop-out scenarios from that lineage (Back-dismiss, short-visible sheet) are present and passing, and the roster-agnostic character selection works: 150 states, not the truncated 108.
- The cx gutter cap is in the stylesheet and pinned by `reskinContract.test.ts`. It also makes the 320 px / 200 % text scenario pass as a gate, resolving the "closed-sheet ~5 px overflow" backlog item recorded by the fu lane.
- `.step.needs-attention` adds 0.5 rem of left padding. I checked that it does not undo the 320 px / 200 % fix: the gated `text-200-phone-small` scenario runs the GM console with a pending action present, and passes with no overflow.
- `5663d7f` (cx utility-item tap target) was knowingly not taken. fq already moved the utility action to the 48 px button class, and the audit measures 0 control issues, so no coverage was lost.

## Findings and dispositions

| # | Finding | Severity | Disposition |
| --- | --- | --- | --- |
| 1 | `JoinScreen` recovery-code `.trim().toUpperCase()` had no regression test. The code is correct: the minted alphabet is `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, all uppercase, and the server compares exactly. | low | **Resolved** in `8d31c11` (`RecoveryCodeEntry.test.tsx`). The author reports a mutation check that fails without the normalisation. |
| 2 | The original `typecheck` failure (`uiAudit` undefined in `reskinContract.test.ts`, introduced by the lineage merge). | medium (gate) | **Resolved** in `456f3ec`; re-verified clean. |
| 3 | `reskinContract.test.ts` asserts on CSS source text with regexes, so it pins declarations, not rendering. | info | Accepted. The real-Chrome audit is the rendering gate, and it runs with the 320 px / 200 % scenario gating. |
| 4 | The author's `firebase.hd.json` and `vite.hd.config.mjs` are untracked, excluded only via `.git/info/exclude`. Prettier does not honour that exclude, so plain `prettier --check .` fails while they exist. I also overwrote the Vite config once with my own copy while we shared the worktree, then restored it to the author's ports. | info | Not a repo defect. Delete both files before running the plain `npm run check`, or run the gates over `git ls-files`. |
| 5 | Before/after screenshots exist for phone, tablet, desktop and table. | none | Accepted. |

No blocking finding.

## Limits, not hidden

- Headless Chrome only. No real iOS Safari or Android on-screen-keyboard pass, no VoiceOver/TalkBack/NVDA, no Windows High Contrast run, no physical device. The visual-viewport-only keyboard case is covered in jsdom and by the pinch-zoom scenarios.
- No staging playthrough of this build, since it was not deployed. The smoke ran against local emulators and a local build.
- The branch is not merged or deployed. John still decides the merge order against the other reskin lineages.
