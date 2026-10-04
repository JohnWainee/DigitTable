# Independent review: large-text legibility, landscape-dock cherry-pick and audit tooling, lane `sonnet-eg` (2026-10-04)

- **Subject:** `sonnet-eg/reskin-orchestrated-20261004` on base `741e455`: a faithful cherry-pick of `c7b0981` (landscape dock), the
  large-text/narrow-phone stylesheet fix with its two copy edits, and the playtest-harness extensions (broken-word detector,
  pixel-sampled contrast, layout fingerprint and diff, font-fallback and text-scale passes). Evidence: `docs/evidence/eg-reskin-audit-20261004/`.
- **Reviewer:** one fresh general-purpose subagent with no access to the author's reasoning, instructed to be adversarial, to try to
  disprove each claim, and not to edit tracked files, start or stop servers, run the emulator suite or build, or use ports outside
  51371-51373. It ran focused vitest files, prettier, `node --check`, the audit self-test, and scratch Chrome experiments (old vs new
  stylesheet over hand-built DOM at 14-201 widths) under `/Users/john/.claude/jobs/c3c5d4e7/tmp/review-scratch`. It was resumed once to
  re-review the follow-up commits. The author, not the reviewer, made every edit.
- **Verdicts:** pass 1 approve with fixes (no blocking finding; the central default-size claim not disproved); pass 2 approve with fixes
  (finding 1 below, a tool-soundness fix). Scope check: presentation only; no authority, authorization, projection, engine, Firebase,
  asset or secret change; no licensed content.
- **Disclosure:** the reviewer ran one `pkill -f "review-scratch-"`, which breaks the "do not kill" instruction. It matched only its own
  scratch-profile Chrome helpers; the lane's audits kept running (their screenshots kept arriving).

**Not re-reviewed:** commit `30fd95a` (the layout-diff hardening that answers pass-2 finding 3, plus the scroll control) landed after pass 2. It is covered by its own unit tests and by the real run in `layout-diff.log`, but no second reviewer read it.

## What the reviewer could not disprove

- The cherry-pick is faithful: `git patch-id --stable` of `c7b0981` and `ca15f18` agree with `CLAUDE_HANDOFF.md` excluded; the `-x` trailer is present.
- Nothing changes at a 16px root from 320px up, except the Reveal row: all 11 distinct new `min(Xrem, Ypx)` values equal the old value, every `vw`
  cap sits at or above the default-size result (binding widths: h1 274px, h2 267px, sheet h2 264px, buttons 246px, legend 229px,
  `.reveal-code` 288px, landing h1 about 315px), and the Chrome differential over 14 widths found 0 differing boxes outside the Reveal rows.
- The dock bleed equals the panel padding everywhere a dock lives, including `.pending-action-card`; `overflow-wrap: anywhere` cannot squeeze
  another control at default text; the `:has()` rules match only the Reveal rows.
- The in-page template-literal escapes evaluate correctly through both `new Function` and Chrome; the PNG decoder is correct; the new
  stylesheet contract tests would fail on the old CSS (15 do, verified by the author as well).
- Pass 2: the 14vw landing heading is identical to the base at 315-1920px; the Reveal row is identical to the base from 540px up and never
  squeezes at any of 201 widths (every difference is a width where the old button was squeezed or wrapped); the new selftest controls fail
  when the regex, rect logic, exemptions or `display:none` handling are mutated.

## Findings and dispositions

| # | Pass | Severity | Finding | Disposition |
| --- | --- | --- | --- | --- |
| 1 | 1 | should-fix | No negative control for the broken-word detector or the layout fingerprint | Fixed (`045e3ab`): selftest bad/good pages for `WORD_BREAK_AUDIT` (mid-word break reported; wrapped sentences, hyphenated compounds, identifiers over 16 characters and `<dd>` exempt) and for `LAYOUT_DUMP_EXPRESSION` (moves with width, text hash, display:none). Blind spots documented: words under 4 characters and a word split across an inline element are not seen |
| 2 | 1 | should-fix | The 7.5vw rationale ("8-letter label whole in the widest fallback face") does not hold for "simplified" under the Verdana-class `wide` stack | Not changed. `--font-fallback wide` is an invented worst case (display and body both Verdana-wide); the Roboto-class `sans` run is clean. The 39 residuals of the final `wide` run are recorded in the evidence README as known limits. The commit message of `a17f65c` states the 8-letter case it was fixed for |
| 3 | 1, 2 | should-fix | `layout-diff.mjs` could print LAYOUT IDENTICAL on a partial dump, a blank dump, a non-numeric `--tolerance` (NaN made every comparison false), `--allow-skip ""` or a substring, or an unbounded own-text excuse | Fixed (`045e3ab`, `30fd95a`): fails on a key-set mismatch, on a pair under `--min-elements` (10) or fewer than `--min-total` (1000) boxes overall, exits 2 on a bad number or an empty skip name, matches `--allow-skip` against a whole state name, caps the own-text excuse at 1%, and keeps `display:none` boxes in the dump. Unit-tested (`auditHarnessContract.test.ts`) |
| 4 | 1 | should-fix (small) | Pixel-contrast coverage silently truncated at 8 slices | Fixed: 12 slices and a `truncated` flag; the final run reports 4 truncated long pages (summary `contrastTruncatedPages`). Visibility, not a gate |
| 5 | 1 | nit | The Reveal fix moved the button flush right at desktop widths (label span grew) | Fixed (`e01688f`): `flex: 0 1 auto`; verified identical to the base from 540px up |
| 6 | 1 | nit | JoinScreen hint/description untested | Fixed: `LandingFlow.a11y` asserts accessible name "Recover your seat" and description "Lost your browser?" |
| 7 | 1 | nit | Unparsed text colours dropped uncounted | Fixed: counted (`contrastUnparsedBoxes`, 0 in the final run) |
| 8 | 1 | nit | The `vw` caps mean display type grows only about 1.17x at 200% text on a 320px phone | Documented as a known limit in the evidence README (the contract test asserts the cap binds there) |
| 9 | 1 | nit | ActionDock comment wrong about a media-query rem | Fixed (`e01688f`): a media-query rem is the browser's default font-size setting; the media query and `UNPIN_BELOW_PX` diverge for visitors with a larger default (pre-existing, now stated) |
| 10 | 1 | process | Handoff, review record and gate numbers missing | Done in this commit (handoff Current state, Next action and a dated entry; README gates; this record) |
| 11 | 2 | nit | Selftest did not catch a scroll-offset mutation of the dump | Fixed (`30fd95a`): a control that scrolls and requires the dump to hold page coordinates |
| 12 | 2 | nit | Truncated and unparsed contrast pages are counted, not gated | Accepted: reported in the summary, not failing (the longest GM pages would fail every run) |
| 13 | 2 | info | `8476b12` does not fix `wide` ("CHARACTER" breaks at 100% text there, identical on the old CSS) | As planned: recorded as a known limit; the `sans` run is clean |

## Author-side corrections made before and during review (for the record)

- The first contrast sampler produced 91 bogus failures on the base. Two causes, both fixed before the numbers above: it scored text lines
  that another element (the pinned dock) covered, and, on the unfixed page, a stale Chrome page scale of 1.14 after the overflowing large-text
  passes shifted every CSS-px to pixel mapping. It now skips occluded lines (selftest control), refuses a non-1:1 view ("contrast not
  measured") and resets the page scale per viewport.
- My own first CSS pass added `overflow-wrap: anywhere` on `.gear-option`; the new detector then showed "REVEAL" broken at the default text size.
  Isolating it against the old stylesheet showed the break pre-dated my change (77px button), which led to the Reveal row fix.
- The 9vw button cap and the 16vw landing-heading cap I first chose were too generous (found by the `wide` and `sans` fallback passes) and were tightened to 7.5vw and 14vw.

## Not verified by the reviewer

The final-bundle browser audits, real Mobile Safari and Android behaviour, the iPhone SE typing failure, the emulator suites, physical devices and
assistive technology. Those rest on the author's logs in the evidence folder.
