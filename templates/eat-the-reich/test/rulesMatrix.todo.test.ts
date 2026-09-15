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

// B02 (matrix 3.1, 3.2 P1-P3/P7) and B03 (matrix 3.2 P4-P6, 3.3-3.6) are both
// fully landed with real assertions — see test/pool.test.ts, test/roster.test.ts,
// test/decide.test.ts, test/decideResolution.test.ts, test/resolution.test.ts,
// test/reduce.test.ts, test/project.test.ts, and test/lifecycle.integration.test.ts.
// C2's "concurrent claim retried with a stale revision" row is resolved by
// design, not by that literal test: ClaimCharacter is entity-scoped
// (packages/contracts/src/command.ts's `expectedRevision` doc comment) and
// relies on the CHARACTER_TAKEN precondition instead.

describe("B03 — deferred to B04/manual (matrix P1 items, not cut, sequenced later)", () => {
  test.todo(
    "P6: late bonus dice rolled during allocation, not just at review (P1; manual fallback: GM applies via correction)",
  );
  test.todo(
    "D4: Flashback — reroll kept-dice<=2 with +2 dice, once per session (P1; manual fallback: GM narrates a retry)",
  );
  test.todo(
    "D5: passive onOnesGainBlood/onOnesRemoveAttack — implemented and unit-tested against a synthetic character (test/decideResolution.test.ts does not cover it; no roster character currently has a passive ability to exercise it live)",
  );
  test.todo(
    "A6/noSpecials: an active noSpecials injury tag rejects a SPECIAL allocation (code path exists in decideAllocateResults, not yet decide-tested directly)",
  );
  test.todo(
    "I3: Last Stand (8 dice, retire) — P1; manual fallback: GM marks retired via CorrectCharacter (B04) and adjudicates by hand",
  );
  test.todo(
    "I4: injuryMarksWholeCategory threat flag — typed and applied in decideAllocateResults's injury logic; not yet exercised by a fixture Threat with the flag set",
  );
  test.todo("S9: Loot (GrantItem, activeLootId swap) — B04 GM command");
  test.todo(
    "S2: secondary-objective rewards (ChooseSecondaryReward) — P1; manual fallback: GM applies via correction",
  );
});

describe("B04 — rounds, scenes, reinforcements (matrix 3.7)", () => {
  test.todo("S5: a character who already acted this round is blocked (NOT_YOUR_TURN)");
  test.todo("S5: EndRound resets acted-this-round and advances round");
  test.todo("S5: EndRound rejected with open rolls (ROUND_HAS_OPEN_ROLLS)");
  test.todo("S6: reinforcements worked example (p.38) reproduced with fixed d6");
  test.todo("S6: solo/elite threats are exempt from reinforcement");
  test.todo(
    "S7: SetSceneRules simplified mode raises ratings 1-3 and removes threats at 0 (docs/ETR_SESSION_FLOW.md §7)",
  );
  test.todo(
    "S1: primary objective completion blocks further declares until NextScene (LoadScene/NextScene not implemented until B04)",
  );
  test.todo("S8: NextScene rejected with open rolls (SCENE_HAS_OPEN_ROLLS)");
  test.todo("S8: character Blood/injuries/items carry across scenes; threats reset");
  test.todo(
    "Pause/Resume: anonymous actor, no initiator leaked to any client path (coordinate with Sonnet A)",
  );
});

describe("B02-B05 — cross-cutting (matrix §6)", () => {
  test.todo(
    "retry with the same commandId produces identical events, no double spend, for ReviewAction/AllocateResults/ChooseInjuryCategory specifically (lifecycle.integration.test.ts covers it for ClaimCharacter and BeginAction only so far)",
  );
});
