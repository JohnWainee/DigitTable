import { describe, test } from "vitest";

/**
 * Traceability register for B01 (docs/ETR_RULES_IMPLEMENTATION_PLAN.md §5).
 * Each `test.todo` names a matrix rule id (docs/ETR_RULES_MATRIX.md §3) and
 * the slice that owns implementing it. As each slice lands, its rows move
 * out of this file and into a real assertion in the matching `*.test.ts`
 * file, and the `test.todo` line here is deleted in the same commit — this
 * file's todo count is expected to shrink to zero by B05, never grow.
 *
 * This file intentionally contains no implementation and asserts nothing;
 * `vitest` reports `.todo` entries as pending, not passing or failing, so it
 * never masks a missing test as green.
 */

// B02 (matrix 3.1, 3.2 P1-P3/P7), B03 (matrix 3.2 P4-P6, 3.3-3.6), and B04
// (matrix 3.7-3.8, scenes/rounds/reinforcements/Pause/GM director commands)
// are all fully landed with real assertions — see test/pool.test.ts,
// test/roster.test.ts, test/decide.test.ts, test/decideResolution.test.ts,
// test/decideScenes.test.ts, test/resolution.test.ts, test/reduce.test.ts,
// test/project.test.ts, and test/lifecycle.integration.test.ts. C2's
// "concurrent claim retried with a stale revision" row is resolved by
// design, not by that literal test: ClaimCharacter is entity-scoped
// (packages/contracts/src/command.ts's `expectedRevision` doc comment) and
// relies on the CHARACTER_TAKEN precondition instead.

describe("Deferred to B05/manual (matrix P1 items, not cut, sequenced later)", () => {
  test.todo(
    "P6: late bonus dice rolled during allocation, not just at review (P1; manual fallback: GM applies via correction)",
  );
  test.todo(
    "D4: Flashback — reroll kept-dice<=2 with +2 dice, once per session (P1; manual fallback: GM narrates a retry)",
  );
  test.todo(
    "D5: passive onOnesGainBlood/onOnesRemoveAttack — implemented and unit-tested against a synthetic character (test/decideResolution.test.ts); no shipped roster character has a passive ability to exercise it live",
  );
  test.todo(
    "A6/noSpecials: an active noSpecials injury tag rejects a SPECIAL allocation (code path exists in decideAllocateResults, not yet decide-tested directly)",
  );
  test.todo(
    "I3: Last Stand (8 dice, retire) — P1; manual fallback: GM marks retired via CorrectCharacter (implemented in B04) and adjudicates by hand",
  );
  test.todo(
    "I4: injuryMarksWholeCategory threat flag — typed and applied in decideAllocateResults's injury logic; not yet exercised by a fixture Threat with the flag set in a full-loop test",
  );
  test.todo(
    "S9: Loot 'only one loot item mechanically available at a time' cap — GrantItem (B04) replaces the active loot item unconditionally; not yet tested that a second GrantItem always displaces the first (implied by the replace logic, not asserted)",
  );
  test.todo(
    "S2: secondary-objective rewards (ChooseSecondaryReward) — P1; manual fallback: GM applies via correction",
  );
  test.todo(
    "S3: retreat Objective creation — manual, GM uses AddObjective-equivalent via EditScene",
  );
});

// B05 landed: Appendix C's four original scenes (test/scenes.test.ts,
// test/playtest.test.ts), the content/private/*.json loader
// (test/privateContent.test.ts, not exported from ./index.js — see the
// module's own doc comment), and docs/ETR_PLAYTEST.md's S01-S05, S08, S09,
// S10 bound as fixed-seed tests against the real shipped scene content
// (test/playtest.test.ts). S06 and S07 are not implemented here: S06
// (disconnect mid-roll) and S07's "late joiner's event tail may be empty"
// proof need live client/reconnect/event-store infrastructure that doesn't
// exist at the template level — Sonnet A's A05-A07.
describe("B05 — remaining gaps, not cut, recorded for a future pass", () => {
  test.todo(
    "retry with the same commandId produces identical events, no double spend, for LoadScene/NextScene/EndRound/EditScene/CorrectCharacter/VoidRoll/GrantItem/UnlockAdvance/ReassignCharacter/ChooseInjuryCategory specifically (lifecycle.integration.test.ts and playtest.test.ts's S02 cover ClaimCharacter/BeginAction/ReviewAction retries; the runCommand/priorReceipt mechanism is generic and already exercised there, but per-command coverage is not exhaustive)",
  );
});
