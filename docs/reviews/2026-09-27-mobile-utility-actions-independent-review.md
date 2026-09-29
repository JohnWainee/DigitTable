# 2026-09-27: mobile utility-action tap-target repair — independent review

## Scope

The narrow uncommitted repair on `sonnet-ax/reskin-final-audit-20260927`, based on
`origin/main` at `b599abd`:

- `apps/web/src/player2/ChooseInjuryPanel2.tsx`
- `apps/web/src/player2/ComposeStep2.tsx`
- `apps/web/test/styles/reskinContract.test.ts`

The change gives the two previously class-less utility-item action buttons the established
`link-button` class and adds a static contract that rejects future class-less buttons outside
the documented `.stepper-controls` exception.

## Finding and disposition

An independent Sonnet audit found that the `Destroy Cowboy hat to ignore this result` and
`Mark and regain Blood` actions had no tap-target class. The reskin's `--tap` contract is 3rem
(48px), but the existing test covered only buttons that already had `className`, so both
controls could render below the WCAG 2.5.8 44px minimum without a failing regression test.

The repair uses the existing `link-button` style, which already supplies the 48px minimum
height and width, visible focus styling, and accessible cyan-underlined presentation. It leaves
action wiring, role behavior, engine/template code, Firebase code, projections, and privacy
boundaries unchanged.

## Independent review

A fresh Sonnet reviewer inspected the resulting diff without editing it. Verdict: **PASS — no
blocking findings.** The reviewer traced every `<button>` in `apps/web/src`, confirmed the only
remaining class-less buttons are the +/- controls inside `.stepper-controls`, and verified that
the new balanced-div scanner covers the nested allocation-stepper markup. It also confirmed that
the new buttons inherit the existing 48px target and global 3px focus ring. The reviewer could
not execute commands in its sandbox, so that review is static; the author independently ran the
repository gates below.

## Verification

- `npm run check` — passed: format, lint, typecheck, **691 passed / 11 todo** across 71 passed
  files and one skipped file.
- `npm run build` — passed for Functions and web; the existing Vite chunk-size warning remains
  non-blocking.
- `git diff --check` — passed.
- `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` — unable to start because an
  unrelated session already owns fixed ports 9099, 8080, and 9000. The process was not disturbed.
  Existing reviewed evidence for the same source baseline is 108/108 emulator tests green on an
  isolated port set.
- `node scripts/playtest/two-device-smoke.mjs --base https://digitable.signal-bleed.com --out
  /private/tmp/digitable-staging-playthrough-20260927-0228 --reload` — **17/17** GM/player/table
  steps passed at 2026-09-27T12:22Z, including the 375–1920px overflow sweep, full resolution,
  pause/resume, scene advance, and reload recovery; zero console errors, failed requests, or
  positive overflow. This validates the deployed baseline, not this not-yet-deployed CSS-class
  change.

## Remaining evidence

Because this repair is not deployed, the two changed controls still need a post-deploy live
mobile geometry pass before the physical-device rehearsal can treat them as fully closed. The
standing release-evidence gap remains John's two-device rehearsal; no deployment, merge, or
production-resource action was performed here.
