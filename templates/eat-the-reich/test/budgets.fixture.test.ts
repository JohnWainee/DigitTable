import { projectViewer } from "@digitable/engine";
import { checkAuthorityBudget, checkProjectionBudget } from "@digitable/contracts";
import { describe, expect, it } from "vitest";
import { ACTION_ID, THREAT_ID } from "../src/content.js";
import { eatTheReichTemplate } from "../src/engine.js";
import type { EatTheReichState } from "../src/state.js";
import {
  GM_VIEWER,
  PLAYER_MEMBER_ID,
  PLAYER_VIEWER,
  TABLE_VIEWER,
  freshAuthority,
  freshState,
  stateWithRoll,
} from "./fixtures.js";

/**
 * Representative campaign fixtures proving the working budgets in
 * docs/ARCHITECTURE.md section 8 hold for this template: authority/current
 * stays well under its 256 KiB working budget (and the 1 MiB Firestore
 * ceiling), and every viewer's projection stays under 64 KiB.
 */
describe("size budgets", () => {
  it("keeps the freshly-initialized authority record within budget", () => {
    const result = checkAuthorityBudget(freshAuthority());
    expect(result.withinWorkingBudget).toBe(true);
    expect(result.withinFirestoreCeiling).toBe(true);
  });

  it("keeps a worst-case in-flight authority record (active roll, near-defeated threat) within budget", () => {
    const state = worstCaseState();
    const result = checkAuthorityBudget(freshAuthority(state));
    expect(result.withinWorkingBudget).toBe(true);
    expect(result.withinFirestoreCeiling).toBe(true);
  });

  it("keeps every viewer's projection of the fresh state within the per-viewer ceiling", () => {
    const authority = freshAuthority();
    for (const viewer of [PLAYER_VIEWER, GM_VIEWER, TABLE_VIEWER]) {
      const projection = projectViewer(eatTheReichTemplate, authority, viewer);
      expect(checkProjectionBudget(projection).withinCeiling).toBe(true);
    }
  });

  it("keeps every viewer's projection of a worst-case in-flight state within the per-viewer ceiling", () => {
    const authority = freshAuthority(worstCaseState());
    for (const viewer of [PLAYER_VIEWER, GM_VIEWER, TABLE_VIEWER]) {
      const projection = projectViewer(eatTheReichTemplate, authority, viewer);
      const check = checkProjectionBudget(projection);
      expect(check.withinCeiling).toBe(true);
    }
  });
});

function worstCaseState(): EatTheReichState {
  const base = freshState();
  const threat = base.threats[THREAT_ID];
  if (!threat) throw new Error("fixture threat missing");
  return stateWithRoll(
    {
      id: "roll-1",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      status: "resolved",
      playerFaces: [5, 6, 5, 6, 5, 6],
      playerHits: 6,
      poolComponents: { nerve: 2, gear: 1, hiddenModifier: -1 },
      hiddenAdjustmentApplied: true,
      pushDice: 2,
      oppositionFaces: [1, 2, 3, 4, 6],
      oppositionHits: 1,
      netSuccesses: 5,
      allocations: [
        { optionId: "damage-threat", uses: 3 },
        { optionId: "advance-objective", uses: 2 },
      ],
    },
    {
      ...base,
      threats: {
        ...base.threats,
        [THREAT_ID]: { ...threat, resolveRemaining: 0, status: "defeated" },
      },
    },
  );
}
