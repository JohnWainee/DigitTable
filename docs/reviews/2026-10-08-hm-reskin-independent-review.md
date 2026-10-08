# HM reskin pass: independent review

- **Date:** 2026-10-08
- **Branch:** `worktree-digitable-sonnet-hm-reskin-orchestrated-20261008` (from `sonnet-hl/reskin-integration-20261008`, `041d56c`)
- **Reviewer:** one fresh general-purpose agent, read-only, no access to the author's reasoning; it reviewed the uncommitted diff statically and did not run vitest, the browser probes or mutation tests.
- **Verdict:** one Medium finding, fixed; no other blocking finding.

## Findings and dispositions

| Sev    | Finding                                                                                                                                                                                                   | Disposition                                                                                                                                                                                  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Medium | The recovery-code input used `autoCapitalize="none"`, but recovery codes come from the upper-case-only alphabet in `packages/engine/src/secretHash.ts` and are submitted without case folding, so phones would type lower case and recovery would be rejected (worse than the old default). | Confirmed by reading the alphabet and `handleRecoverSubmit`. **Fixed:** the field now uses `UPPERCASE_CODE_INPUT`; the test asserts `characters`. Passphrases stay `none` (hashed as typed). |
| Nit    | `forced-colors-probe.mjs` reads `summarySurface` but never uses it, and checks colour difference rather than paint.                                                                                         | Accepted; the screenshots in the evidence folder show the painted result.                                                                                                                    |
| Nit    | No `forced-color-adjust` guard on `details[open] > summary::before`.                                                                                                                                      | Not needed: that rule only sets `transform`; the base rule is guarded.                                                                                                                      |
| Low    | Free-text fields (reasons, names) are not in the test.                                                                                                                                                    | Intentional: they keep platform defaults; the test asserts that for names and the item name.                                                                                                |

Reviewer-verified correct: the `useBackDismiss` files are byte-identical to 218bfea; no interaction with the compact-sheet CSS or the hash router (`pushState` without a URL fires no `hashchange`); StrictMode and all close paths; the CSS has no effect at normal text sizes and the class is used only for option/checkbox rows; the forced-colors rule is valid; no engine, contracts, authorization, projection, Firebase, asset or dependency file changed.

Author-run mutation checks: breaking `autoCorrect` fails all four text-entry tests; changing `forced-color-adjust` fails the stylesheet contract test; the real-Chrome probes each have a negative control that failed on the unfixed bundle.

## Not verified (limits)

Physical iPhone/Android keyboards, real Windows High Contrast (Chrome's emulation is an approximation), screen readers, and native `<select>` popups (OS pickers, audited closed only). The Back probe issues `history.back()` programmatically; the real-Safari Back test lives on the `sonnet-eq` lane and was not ported.
