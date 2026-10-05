# Live staging playthrough rerun (2026-10-05 UTC)

This rerun confirms the outcome of the absent `digitable-staging-playthrough`
Sonnet session without assuming it succeeded. That session was blocked by local
port contention; its first recovered replacement is recorded in commit
`9ee8aa5`.

## Scope and command

The deployed staging candidate was exercised without a deploy or source change:

```text
node scripts/playtest/two-device-smoke.mjs \
  --base https://digitable.signal-bleed.com \
  --out /private/tmp/digitable-staging-playthrough-20261005 \
  --reload --port 9365
```

The test used isolated browser contexts for a desktop GM, a 375px phone player,
and a 1920px shared table. The machine-local output has `report.ok: true`, the
17 successful workflow steps, and 21 screenshots. It remains untracked because
it contains a throwaway room code.

## Result

All 17 steps passed: landing, session creation, scene load, 375px GM fit,
player/table admission, character claim, cross-role propagation, action
declaration, GM roll, allocation and confirmation, outcome display,
pause/resume, scene advance, seat guidance, direct resume, and reload recovery.
Each device had zero console errors and zero failed requests. Horizontal-overflow
checks were non-positive at 375/768/1024/1280/1920px.

## Limit

This is deployed-build evidence only. It does not validate the unmerged
visual-viewport/dock or reskin candidates, and does not replace physical
iOS/Android or VoiceOver/TalkBack rehearsal.
