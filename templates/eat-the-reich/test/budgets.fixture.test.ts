import { projectViewer } from "@digitable/engine";
import { checkAuthorityBudget, checkProjectionBudget, asMemberId } from "@digitable/contracts";
import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import type { EatTheReichState, ObjectiveState, RollRecord, ThreatState } from "../src/state.js";
import { GM_VIEWER, PLAYER_VIEWER, TABLE_VIEWER, freshAuthority, freshState } from "./fixtures.js";

/**
 * Representative campaign fixtures proving the working budgets in
 * docs/ARCHITECTURE.md section 8 hold for this template: authority/current
 * stays well under its 256 KiB working budget (and the 1 MiB Firestore
 * ceiling), and every viewer's projection stays under 64 KiB — even in the
 * worst case (the full six-character roster claimed and all injured, a
 * full scene of Objectives/Threats per matrix Appendix C's busiest scene,
 * and every character with a concurrent in-progress roll — flow doc §6:
 * "several characters may have rolls open concurrently").
 */
describe("size budgets", () => {
  it("keeps the freshly-initialized authority record within budget", () => {
    const result = checkAuthorityBudget(freshAuthority());
    expect(result.withinWorkingBudget).toBe(true);
    expect(result.withinFirestoreCeiling).toBe(true);
  });

  it("keeps a worst-case authority record (full roster claimed, all injuries marked) within budget", () => {
    const result = checkAuthorityBudget(freshAuthority(worstCaseState()));
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

  it("keeps every viewer's projection of the worst-case state within the per-viewer ceiling", () => {
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
  const characters = Object.fromEntries(
    Object.values(base.characters).map((character, index) => [
      character.id,
      {
        ...character,
        claimedByMemberId: asMemberId(`member-worst-case-${index}`),
        blood: 10,
        injuries: character.injuries.map((category) => ({
          ...category,
          boxes: [
            { marked: true },
            { marked: true, penalty: category.boxes[1].penalty },
          ] as typeof category.boxes,
        })),
        items: character.items.map((item) => ({ ...item, usesRemaining: 0 })),
        advances: character.advances.map((advance) => ({ ...advance, unlocked: true })),
      },
    ]),
  );

  const objectives: Record<string, ObjectiveState> = {};
  for (let i = 0; i < 3; i += 1) {
    objectives[`objective-${i}`] = {
      id: `objective-${i}`,
      title: `Worst-case Objective ${i} with a reasonably long title for budget purposes`,
      kind: i === 0 ? "primary" : "secondary",
      rating: 8,
      challenge: 1,
      status: "active",
    };
  }

  const threats: Record<string, ThreatState> = {};
  for (let i = 0; i < 3; i += 1) {
    threats[`threat-${i}`] = {
      id: `threat-${i}`,
      name: `Worst-case Threat ${i}`,
      rating: 6,
      startingAttack: 3,
      attack: 3,
      challenge: 1,
      solo: false,
      elite: i === 0,
      flags: {
        discardBelow: 5,
        noFeeding: true,
        attackCritOnSix: true,
        challengeLocked: true,
        injuryMarksWholeCategory: true,
      },
      status: "active",
      revealed: true,
      notes: "A reasonably long worst-case GM-only foreshadowing note for budget purposes.",
    };
  }

  const rolls: Record<string, RollRecord> = {};
  Object.values(characters).forEach((character, index) => {
    rolls[`roll-${index}`] = {
      id: `roll-${index}`,
      characterId: character.id,
      actorMemberId: character.claimedByMemberId,
      status: "awaiting_allocation",
      declaredStat: "SNEAK",
      declaredItemIds: character.items.map((item) => item.id),
      declaredAbilityIds: character.abilities
        .filter((a) => a.trigger !== "special")
        .map((a) => a.id),
      declaredBonusClaimIds: character.items.map((item) => item.id),
      declaredEngagedThreatIds: Object.keys(threats),
      note: "A reasonably long note about this declared action for budget purposes.",
      approvedBonusClaims: character.items.map((item) => ({
        sourceId: item.id,
        approved: true,
        plus: item.bonusPlus,
      })),
      engagedThreatIds: Object.keys(threats),
      playerFaces: [6, 5, 4, 3, 2, 1, 6, 5, 4, 3],
      keptDice: [
        { faceIndex: 0, face: 6, result: "critical", points: 2 },
        { faceIndex: 1, face: 5, result: "success", points: 1 },
        { faceIndex: 2, face: 4, result: "success", points: 1 },
      ],
      attackDiceRolled: 5,
      attackFaces: [6, 5, 4, 3, 2],
      attackSuccessesRolled: 3,
      primaryEngagedThreatId: "threat-0",
    };
  });

  return {
    ...base,
    characters,
    scene: {
      id: "worst-case-scene",
      title: "A reasonably long worst-case scene title for budget purposes",
      locationLabel: "A reasonably long worst-case location label",
      round: 3,
      actedThisRound: Object.values(characters).map((c) => c.id),
      reinforcementsMode: "book",
      status: "active",
    },
    objectives,
    threats,
    rolls,
    nextRollSequence: Object.keys(rolls).length + 1,
  };
}
