# 2026-10-06 hourly deployed-staging playthrough

## Purpose and boundary

The named `digitable-staging-playthrough` Sonnet session was absent from the
current Claude roster. Its prior outcome was therefore recovered from committed
evidence and verified by a new direct run, rather than inferred from missing
process state.

This exercises only the build already deployed at
<https://digitable.signal-bleed.com>. It does not deploy, merge, or establish
that the unmerged `codex/reskin-fi-integration-20261006` candidate is live.

## Command and outcome

```sh
node scripts/playtest/two-device-smoke.mjs \
  --base https://digitable.signal-bleed.com \
  --out /private/tmp/digitable-staging-playthrough-20261006-hourly-0610 \
  --reload --port 9593
```

The run began at `2026-10-06T06:12:07.389Z` and completed at
`2026-10-06T06:12:44.644Z` with `report.ok: true`: **17/17** GM, player, and
table steps passed. It exercised session and scene creation, player and table
admission, character claim, a complete declaration/opposition/allocation flow,
pause/resume, scene advance, role guidance, direct resume, and reload recovery.

All browser contexts reported zero console errors and zero failed requests. At
375, 768, 1024, 1280, and 1920 px, every device layout had no horizontal
overflow.

## Evidence handling

The raw JSON report and screenshots intentionally remain untracked at the
`--out` path because they contain a short-lived room code. This redacted record
preserves the command, timestamps, and result without committing ephemeral
credentials.
