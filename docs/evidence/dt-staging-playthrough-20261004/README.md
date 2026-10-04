# Live staging playthrough rerun (2026-10-04 UTC)

This rerun closes the evidence gap from the blocked `digitable-staging-playthrough`
Sonnet session. That session was blocked by local port contention and left only
untracked scratch output; it did not establish a result. The harness repair recorded
in `docs/reviews/2026-10-02-df-reskin-verification-review.md` was already committed
before this rerun.

## Scope and command

The deployed staging candidate was exercised without a deploy or source change:

```text
node scripts/playtest/two-device-smoke.mjs \
  --base https://digitable.signal-bleed.com \
  --out /private/tmp/digitable-staging-playthrough-20261004 \
  --reload --port 9354
```

The three isolated Chrome contexts represented a desktop GM, a 375px phone player,
and a 1920px table display. The output directory holds the machine-local JSON report
and 21 screenshots; it deliberately is not committed because it includes an ephemeral
test-room code. The report completed at `2026-10-04T01:26:10.612Z` with `ok: true`.

## Result

All 17 steps passed: session creation, scene load, 375px GM fit, player/table
admission, character claim, GM/player/table propagation, declared action, GM roll,
allocation and confirmation, outcome display, pause/resume, scene advance, seat
guidance, direct resume, and reload recovery. GM/player/table horizontal-overflow
checks passed at 375/768/1024/1280/1920px (the table's -15px result at 1920px is
intentional spare width, not overflow). All three contexts reported zero console
errors and zero failed requests.

## Limits

This verifies the deployed build only. It predates the unmerged dock and
visual-viewport reskin commits, so it is not evidence that those source changes have
been deployed. It also does not substitute for the remaining physical iOS/Android,
VoiceOver, or TalkBack rehearsal.
