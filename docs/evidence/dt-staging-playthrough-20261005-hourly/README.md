# 2026-10-05 hourly deployed-staging playthrough

## Purpose and boundary

The named `digitable-staging-playthrough` Claude session was not present in the
active roster. Its outcome was not inferred from that absence. This direct rerun
tests only the build already deployed at `https://digitable.signal-bleed.com`;
it does not deploy, merge, or establish that the unmerged `sonnet-fa` reskin is
on staging.

## Command and outcome

```sh
node scripts/playtest/two-device-smoke.mjs \
  --base https://digitable.signal-bleed.com \
  --out /private/tmp/digitable-staging-playthrough-20261005-hourly-1655 \
  --reload --port 9590
```

The run began at `2026-10-05T16:59:05.572Z` and completed at
`2026-10-05T16:59:52.500Z` with `report.ok: true`: **17/17** GM, player, and
table steps passed. It exercised session and scene creation, player and table
admission, character claim, a complete declaration/opposition/allocation flow,
pause/resume, scene advance, role guidance, direct resume, and reload recovery.

All three browser contexts reported zero console errors and zero failed
requests. At 375, 768, 1024, 1280, and 1920 px, GM and player horizontal
overflow was 0 px; table was 0 px except for -15 px spare viewport width at
some widths.

## Evidence handling

The full JSON report and screenshots intentionally remain untracked under the
`--out` directory because they contain a short-lived room code. This redacted
record preserves the reproducible command, timestamps, and result without
committing test-room credentials.
