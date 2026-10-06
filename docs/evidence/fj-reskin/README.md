# Integration-candidate audit (lane `sonnet-fj`, 2026-10-06)

Base: `codex/reskin-fi-integration-20261006` @ `45770b1` (fast-forwarded into this worktree; the
worktree had been created at the older `b599abd`). **No application source changed in this lane.**
Everything ran locally (`demo-digitable` emulators on the default loopback ports, which were verified
free first; builds and suites in an APFS clone under `/private/tmp` because `esbuild` hangs under
`~/Documents`). The only remote action was the read-only-style staging smoke against the already
deployed `https://digitable.signal-bleed.com`; nothing was deployed.

## Results on the integration candidate (`45770b1`)

| Gate | Result |
| --- | --- |
| `npm run check` | format, lint, typecheck clean; **698 passed, 11 todo** (72 files passed, 1 skipped) |
| `npm run build` | passes; existing non-blocking >500 kB chunk advisory only |
| `PATH=/opt/homebrew/opt/openjdk/bin:$PATH npm run test:emulator` | **18 + 86 + 4 passed, exit 0**, no Firestore transaction-lock timeouts (`emulator-totals.txt`). Closes the owed emulator gap from the fi integration review: the earlier timeout was environmental, not a code defect |
| `ui-audit.mjs` (production-style build against the emulators, axe-core, all phone/tablet/desktop/table widths, sheet scenarios) | **150 states, 1,434 controls, 0 control issues, 0 overflow states, 0 hard axe violations**; one best-practice warning `page-has-heading-one` on the nonexistent-room route (`ui-audit-before-report.json`) |
| `two-device-smoke.mjs --reload` against the **already deployed** staging build | **17/17 passed** (`staging-smoke-report.json`). This is the deployed `5e8907b` build, not this candidate |

## The finding: the candidate regressed against the reviewed fi lineage

`45770b1` imports only the single text-entry commit (`c5ec6b0`). That commit sits on a lineage of
**11 reviewed pop-out commits** (`22dad04` … `f0e5d7c`: Back-dismiss for pop-outs, option-row
semantics, landscape-keyboard compact sheet `a249b2c`, iPad compact threshold plus page dimming and
route `h1`s `b803ca9`/`f3fc981`). `git merge-base --is-ancestor` shows none of those commits are in
this candidate (`218bfea`, `a249b2c`, `f3fc981`, `34050cf`, `1409e59`, `f0e5d7c` all NOT in HEAD).
This is the pattern recorded in memory as "handoff docs claim fixes are integrated that never
reached this branch".

Reproduced on this candidate with the fi lineage's own probes (extracted unchanged, run against the
candidate's build; they are not committed here because they would be a prior-patch duplicate):

- `sheet-history-probe.mjs`: **FAIL A**. With the GM correction sheet open, Back navigates
  `#/room/<id>/gm` to `#/create`: sheet, typed reason and the whole director console are lost
  (`before-sheet-history.txt`, `before-shots/sheet-before-back.jpg`, `before-shots/after-back.jpg`).
- `sheet-viewport-probe.mjs`: containment/focus/reachable-action scenarios **PASS** at 320, 390,
  844x390 landscape, 768, 1280 and 1920 widths; **FAIL F** is the same Back defect
  (`before-sheet-viewport.txt`).
- The `page-has-heading-one` warning above is what the fg lineage's route-`h1` commit removes.
- The landscape-keyboard and iPad-compact defects need real Mobile Safari; there is no iOS rig on
  this candidate, so they are **not** claimed as reproduced here.

## What was not done, and why

I attempted `git merge origin/sonnet-fi/reskin-orchestrated-20261006` to restore those fixes. The
permission classifier denied it as a modification of shared resources: integrating another lane's
unmerged branch was not something John explicitly authorized. I did not retry it in pieces, cherry-pick
it, or re-implement the patches by another route. Consequently there are no "after" screenshots, no
independent code review (there is no code change to review) and no deployment.

## Decision for John

Authorize one of:

1. Merge `origin/sonnet-fi/reskin-orchestrated-20261006` (`c5ec6b0`) into this branch. It already
   ships its own `apps/web/src/shared/useBackDismiss.ts` (commit `22dad04`). Expect conflicts in
   `CLAUDE_HANDOFF.md` and in the text-entry change that exists twice (`45770b1` here, `c5ec6b0`
   there: `apps/web/src/shared/textEntry.ts`, its test and the landing/GM screens). Not covered by
   that merge: `218bfea` (`sonnet-eq`'s Back-dismiss) and `1409e59` (`sonnet-ez`'s forced-colors
   marker) are not ancestors of the fi tip, so decide whether `22dad04` makes `218bfea`
   redundant and whether the forced-colors fix is still wanted.
2. Or direct this lane to re-implement only the Back-dismiss fix on this candidate.

Either way, rerun `check`, `build`, the emulator suite, `ui-audit.mjs`, the history/viewport probes
(expect A and F to pass), and obtain an independent review before pushing a code change.
