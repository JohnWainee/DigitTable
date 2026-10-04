# Independent review: table display legibility, lane `sonnet-dz` (2026-10-04)

- **Candidate:** `cc7dcd5` on `sonnet-dz/reskin-uiux-20261004`, reviewed against `9ee8aa5`.
- **Reviewer:** Codex, independent of the author.
- **Scope:** only the shared-table CSS, its stylesheet contract test, handoff, evidence and captures.

## Result: approve with tracked physical-display follow-up

The change is correctly constrained to `@media (min-width: 80rem)`: it makes secondary
table text relative to the enlarged table base, moves the party strip across both columns,
and caps only the 110rem table banner/map. It does not change DOM order, interactive
controls, sheet/dock mechanics, permissions, projections, engine rules, Firebase wiring,
or assets. The two new contract assertions mutation-test the intended declarations.

The author does not overclaim the outcome: a six-member 1920x1080 table remains 38px
taller than the display and needs a real-TV viewing-distance check. That is a release/
integration follow-up, not a hidden regression in this narrow readability improvement.
The existing browser audit covers the relevant responsive and pop-out cases; its 288 states,
3,336 controls, zero overflow/control/hard-axe failures and 23 sheet cases are consistent
with the stored screenshots.

## Independent verification

- `git diff --check 9ee8aa5..cc7dcd5` — clean.
- `npm run check` — 805 passed, 11 todo.
- `npm run build` — passed; only the existing Vite chunk-size warning.
- The ordinary emulator command was attempted but cannot bind the already-occupied default
  Auth/Firestore/RTDB ports. The candidate's retained, isolated remapped-stack record shows
  18 rules + 86 Functions + 4 web passing after the documented one-off collision-test rerun.

No merge or deployment is authorized by this review. A changed staging build plus physical
iOS/Android, assistive-technology, and TV checks remain necessary before the overall reskin
can be declared complete.
