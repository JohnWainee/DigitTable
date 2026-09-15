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

describe("B02 — characters and pool (matrix 3.1, 3.2 P1-P3/P7)", () => {
  // Landed in B02 (real assertions, not listed here): C1 (test/pool.test.ts),
  // C2 six-character roster and second-claim rejection (test/roster.test.ts,
  // test/decide.test.ts), C3 shape (test/roster.test.ts), C6 heal cost/reject
  // (test/decide.test.ts), P7 oneItemPerTurn/statDelta/allStatsDelta/
  // noBloodSpend (test/pool.test.ts). C2's "concurrent claim retried with a
  // stale revision" row is resolved by design, not by that literal test:
  // ClaimCharacter is entity-scoped (docs/ETR_RULES_IMPLEMENTATION_PLAN.md,
  // packages/contracts/src/command.ts's `expectedRevision` doc comment) and
  // relies on the CHARACTER_TAKEN precondition instead, covered in
  // test/decide.test.ts and test/lifecycle.integration.test.ts.
  test.todo(
    "C4: blood gain past 10 clamps at 10 (no command grants Blood until B03's Feed/gainBlood)",
  );
  test.todo(
    "P2: item use adds one die and decrements `usesRemaining` once, even on retry — buildPool (B02) only previews this; B03's BeginAction/ReviewAction must actually charge it",
  );
  test.todo(
    "P2: depleted item cannot be selected (ITEM_DEPLETED) at declare time, not just in buildPool's preview",
  );
  test.todo(
    "P3: ability use adds one die and charges Blood exactly once — buildPool (B02) only previews this; B03 must actually charge it",
  );
  test.todo(
    "P7: injury tag noBonusDice forbids bonus claims (bonus claims do not exist until B03's P4)",
  );
  test.todo(
    "P7: injury tag noSpecials forbids SPECIAL activation (SPECIALs are not usable until B03's A6)",
  );
});

describe("B03 — rolling and pool completion (matrix 3.2 P4-P6, 3.3)", () => {
  test.todo("P4: struck bonus claim adds no dice; approved adds its plus count");
  test.todo("P5: last use of a multi-use item adds one extra die; single-use gets none");
  test.todo("D1: interpretDie classifies every face [1..6]; empty pool -> zero kept/points");
  test.todo("D2: threat discardBelow override changes the discard band");
  test.todo("D3: GM attack success is 4+, worth 1, no criticals by default");
  test.todo("D3: attackCritOnSix flag makes a 6 worth 2");
});

describe("B03 — opposition / attack pool (matrix 3.4)", () => {
  test.todo("O1: attack dice equal the engaged threat's Attack");
  test.todo("O1: attack dice add 1 per additional active threat in play (p.38 worked example)");
  test.todo("O2: no engaged threat rolls zero attack dice");
  test.todo("O3: threat at rating 0 has effective attack 0");
  test.todo("O4: zero GM successes bumps the primary engaged threat's Attack by 1");
});

describe("B03 — allocation (matrix 3.5)", () => {
  test.todo("A1: every kept die must be allocated exactly once");
  test.todo("A1: duplicate die index is rejected");
  test.todo("A1/A6: a success cannot be allocated to a SPECIAL");
  test.todo("A2: objective rating drops by points, clamps at 0, emits ObjectiveCompleted");
  test.todo("A3: threat rating drops by points, 0 sets Attack 0");
  test.todo("A4: defend removes attack successes by points, floor 0");
  test.todo("A5: feed adds points to blood, clamps at 10");
  test.todo("A5: noFeeding threat flag rejects feed when only that threat is engaged");
  test.todo("A6: special requires a critical and an owned special ability");
  test.todo("A7: challenge negates points before rating drops (p.38 worked example)");
  test.todo("A8: points split across every present objective/threat");
  test.todo("A9: allocation cannot exceed dice rolled");
  test.todo("A9: player cannot allocate another actor's roll (ROLE_FORBIDDEN)");
});

describe("B03 — injury / downed (matrix 3.6)", () => {
  test.todo("I1: 1 remaining attack success rolls one injury category, marks first open box");
  test.todo("I1: full category on both boxes prompts ChooseInjuryCategory");
  test.todo("I1: second box penalty tag activates once ticked");
  test.todo(
    "I2: 3+ remaining attack successes downs the character, marks all boxes, creates rescue objective",
  );
  test.todo("I2: downed character cannot BeginAction (CHARACTER_DOWNED)");
  test.todo("I2: completing the rescue objective clears downed");
  test.todo("I5: healed-then-remarked injury reapplies the same penalty");
});

describe("B04 — rounds, scenes, reinforcements (matrix 3.7)", () => {
  test.todo("S5: a character who already acted this round is blocked (NOT_YOUR_TURN)");
  test.todo("S5: EndRound resets acted-this-round and advances round");
  test.todo("S5: EndRound rejected with open rolls (ROUND_HAS_OPEN_ROLLS)");
  test.todo("S6: reinforcements worked example (p.38) reproduced with fixed d6");
  test.todo("S6: solo/elite threats are exempt from reinforcement");
  test.todo("S7: simplified mode raises ratings 1-3 and removes threats at 0");
  test.todo("S1: primary objective completion emits SceneCompleted");
  test.todo("S1: secondary objective completion does not end the scene");
  test.todo("S8: NextScene rejected with open rolls (SCENE_HAS_OPEN_ROLLS)");
  test.todo("S8: character Blood/injuries/items carry across scenes; threats reset");
});

describe("B02-B05 — cross-cutting (matrix §6)", () => {
  test.todo("projection isolation holds for every new field added by B02-B04");
  test.todo("other players' pending declarations show only 'acting', never their inputs");
  test.todo(
    "retry with the same commandId produces identical events, no double spend, for every new command",
  );
  test.todo(
    "budget fixture: worst-case roster + scene projection stays under PROJECTION_CEILING_BYTES",
  );
  test.todo("migration: a v1 record fails closed under the new manifest (schemaVersion 2)");
});
