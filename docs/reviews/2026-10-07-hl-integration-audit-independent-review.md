# HL integration audit: independent review

- **Date:** 2026-10-07
- **Branch:** `sonnet-hl/reskin-integration-20261008` (from candidate `041d56c`)
- **Scope:** bounded integration-grade audit of the GM / player / table flow on the unmerged, undeployed reskin candidate, plus the one defect it produced.
- **Reviewers:** two fresh read-only agents with no access to the author's reasoning. Pass 1 reviewed the harness-only state and ran the full audit itself. Pass 2 reviewed the fix.
- **Verdict:** pass 1 found one reproducible Medium defect (fixed); pass 2: approve with nits, no High/Medium.

## Staging reconciliation (stated first, so nothing is over-claimed)

- The historical Sonnet playtest record is [`2026-09-18-staging-independent-playtest-review.md`](2026-09-18-staging-independent-playtest-review.md). Its source commit `59c4fe3` is an ancestor of the deployed roster commit `5e8907b` and of this candidate. That record verified the **deployed build of that day** (`d1294cc`) and a locally built patched copy; it is not evidence for any later commit.
- The later 17/17 staging reports (2026-09-19 and the 2026-10-07 Codex follow-up in `CLAUDE_HANDOFF.md`) ran against <https://digitable.signal-bleed.com>, i.e. the **deployed baseline** (`5e8907b`). The candidate is six commits ahead of that (three touch `apps/web/src`), and this lane adds a seventh change. **Nothing here proves `041d56c`, or the fix below, is deployed.** This lane never contacted staging.
- The requested `digitable-staging-playthrough` session (`31f4a4ef`) is still not queryable (`claude logs 31f4a4ef`: "job not found — it may have already exited"). Its absence is not counted as a completed run.

## What was audited

Every pop-out-like surface: six native selects (closed state), the "Why?" `<details>`, the one `SheetDialog` (GM correction), the allocation radios and push-dice stepper, and the one-time-secret and recovery controls (create reveal, join reveal, recovery form: empty, rejected, success reveal).

Viewports: 320x568, 375x812, 390x844, 412x915 portrait; 812x375 and 667x375 landscape; 768x1024 and 1024x768 tablet; 1280x800 desktop; 1920x1080 and 2560x1440 table. The sheet was also driven through emulated keyboards (stand-in `visualViewport` at 476/300/200/140), safe-area insets, pinch-zoom, 150% / 200% text, and reduced motion on/off. A separate probe covered `forced-colors: active` (Windows High Contrast emulation) and a 200% page-scale pass on the signed-out routes at 375 and 320.

## The defect (reproduced three ways)

The recovery-code input (`apps/web/src/landing/JoinScreen.tsx`) carried only `autoComplete="off"`. Codes are 13 characters from an upper-case-and-digit alphabet (`packages/engine/src/secretHash.ts`) and are verified by exact hash. On a phone keyboard only the first character is auto-capitalised, and a pasted code can carry a space, so a **correct** code was rejected with "That recovery code was not recognized for this room. [403]", on the one screen a player reaches after losing their device. Measured by reviewer 1 at 320/390/412: `autocapitalize=""`, `spellcheck=true`.

1. Reviewer 1's probe: valid code lower-cased, with a leading space and with a trailing space were each rejected; only the exact string worked.
2. Real-browser audit step added here (lower-case, space-padded valid code) failed on the unfixed build (`FAIL recovery/lowercase`) and passes on the fixed build. Before/after captures: `docs/evidence/sonnet-hl-reskin/{before,after}/anon-recover-lowercase-result-*.jpg`.
3. Unit regression test fails with either half of the fix removed (attributes only; normalisation only), checked by mutation.

## Fix

Client only: `autoCapitalize="characters" autoCorrect="off" spellCheck={false}` on the field, and the handler sends `recoveryCode.replace(/\s+/g, "").toUpperCase()`. No change to `apps/functions`, `packages/*`, rules, projections, or templates: the server still matches the exact string, so no authorization or secret-handling check is weakened, and the client could already send any string to the callable. Test: `apps/web/test/landing/LandingFlow.a11y.test.tsx`.

## Findings and dispositions

| Pass | Sev    | Finding                                                                                                                  | Disposition |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------ | ----------- |
| 1    | Medium | Recovery-code input mangled/rejected correctly typed codes (above)                                                       | **Fixed**, regression test, real-browser step |
| 1    | Low    | Focus is not moved on successful recovery (form unmounts, `activeElement` is `body`); the polite live region announces "Seat recovered." | Recorded; whether to move focus to the reveal heading is a UX decision (`docs/UX_RESOLUTION_THEATRE.md` is cautious about moving focus), so left for John |
| 1    | Low    | The rejection step in the harness only proves one wrong and one exact-correct code                                        | Superseded: the harness now submits a lower-case, space-padded valid code |
| 1    | Low    | Control counts differ run to run (live dice change the number of allocation controls); only 86 of 290 captures are committed | Recorded; pass/fail counts are stable, absolute control counts are not |
| 1    | Nit    | Audit header comment stale (viewports, recovery states)                                                                    | Fixed |
| 1    | Nit    | Rejection message ends in a raw "[403]"; `claim/no-such-room` has no `h1`; table display is capped at 96rem on 2560 px     | Recorded; unchanged (the `h1` best-practice item is the existing intentional nonexistent-room route) |
| 2    | Low    | `JoinTableScreen.tsx:37` table code upper-cases but does not strip whitespace                                              | Recorded, out of scope (different secret, typically typed on a laptop/TV) |
| 2    | Nit    | Recovery room-code field blocks a trailing space by `pattern` and lacks `autoCorrect`/`spellCheck` off                      | Recorded, pre-existing |
| 2    | Nit    | `recover-lowercase-result` and `recover-reveal` capture the same DOM (doubles that state's per-viewport work)               | Accepted: the committed evidence was produced by this exact script |
| 2    | Nit    | Extra viewports lengthen the audit by roughly 43%                                                                          | Accepted: the task named these widths; they stay inside the harness |

## Carried-over limit (not hidden)

At 320 px with `html` font-size 32 px (rem-scaled "200% text") the GM console **behind** the correction sheet overflows by 4 px: the pending-action card's engaged-threat/gear checkbox rows are left under 70 px of content width. The sheet itself stays inside the viewport and every sheet check except the two geometry checks the console can break still gates. This is the same non-gating item recorded in the HK/fu passes; it is unchanged, scoped to the GM director console, and not fixed here.

## Limits

- No physical iPhone or Android, no real Safari, no screen reader (VoiceOver/TalkBack/NVDA), no real Windows High Contrast. Headless Chrome cannot shrink only the visual viewport; keyboard cases use a stand-in `visualViewport` plus layout-viewport shrink. Native `<select>` popups are OS pickers and were audited closed only.
- Forced-colors was emulated in headless Chrome on the signed-out routes only, not on signed-in GM/player/table states.
- Reviewer 1 re-ran the full audit (280 states at that time, 0 failures) against the same stack; pass 2 re-ran the landing unit tests, `eslint`, `prettier`, and `tsc` for `apps/web` but not the browser audit.
- No deploy, merge, production resource, or staging contact.
