# Reskin verification evidence — 2026-10-02 (sonnet-df)

Baseline: committed `2c5fe8e`. Local `demo-digitable` Firebase emulators (loopback only) and a live-mode
`vite preview` on 127.0.0.1; nothing deployed.

- `ui-audit-report.json` — `ui-audit.mjs` on the candidate: 216 states, 2,562 controls, 0 control issues, 0 overflow states,
  0 hard axe violations, 87 keyboard-focus checks, 8 validation scenarios, 21 sheet cases, 0 failures. Non-gating notes:
  `page-has-heading-one` on the intentional missing-room route, and the recorded 320 px + 200% text sheet geometry.
- Four representative captures (correction sheet at phone, landscape and small-phone sizes; inline-error create form).
  The full 274-file capture set was left in the job's scratch directory to keep the repository small.
