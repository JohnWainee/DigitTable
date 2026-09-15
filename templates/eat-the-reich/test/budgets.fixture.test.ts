import { projectViewer } from "@digitable/engine";
import { checkAuthorityBudget, checkProjectionBudget, asMemberId } from "@digitable/contracts";
import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import type { EatTheReichState } from "../src/state.js";
import { GM_VIEWER, PLAYER_VIEWER, TABLE_VIEWER, freshAuthority, freshState } from "./fixtures.js";

/**
 * Representative campaign fixtures proving the working budgets in
 * docs/ARCHITECTURE.md section 8 hold for this template: authority/current
 * stays well under its 256 KiB working budget (and the 1 MiB Firestore
 * ceiling), and every viewer's projection stays under 64 KiB — even in the
 * worst case for B02 (the full six-character roster claimed, every injury
 * box marked).
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
  return { ...base, characters };
}
