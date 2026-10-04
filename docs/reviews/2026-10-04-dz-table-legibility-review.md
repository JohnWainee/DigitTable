# Review: table display legibility, lane `sonnet-dz` (2026-10-04)

- **Scope:** the `.table-screen` CSS change and its contract test.
- **Reviewer:** the author only. The task forbade spawning agents, so **no independent review was performed**.
  This is a self-review and must not be counted as one; an independent pass is still required before merge.
- **Method:** mutation check (both new contract tests fail on the pre-fix stylesheet); before/after captures at
  1920/1280; full browser audit and smoke; emulator suites.
- **Self-found issues, fixed:** (1) first cut grew the idle 1920x1080 table to 1127px and a full party to
  1485px (chips stacked in one column); fixed with the party span, banner and route-map caps. (2) Spanning the
  party alone raised the idle table to 1150px because it removed column slack; the route-map cap fixed that.
- **Residual:** six-member party at 1920x1080 is 1118px (38px of scroll; was 1175px). Rules live only in the
  >= 80rem media queries, so phone/tablet layouts cannot change. `em` sizing compounds if a future element inside
  these selectors sets its own font-size; the contract test pins the declared values only.
