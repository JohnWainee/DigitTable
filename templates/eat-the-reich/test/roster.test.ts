import { describe, expect, it } from "vitest";
import { ORIGINAL_ROSTER } from "../src/roster.js";
import { STATS } from "../src/state.js";

/**
 * Matrix C2/C3 (docs/ETR_RULES_MATRIX.md, Appendix A): a fixed roster of six
 * original characters, each following the rulebook's custom-character shape
 * (one stat at 4, two at 3, three at 2, one at 1; 3-4 items; 3 abilities —
 * one special, one blood-cost, one other; 3 advances; 3 injury categories
 * of 2 boxes each, second box penalty-tagged; a Last Stand).
 */
describe("ORIGINAL_ROSTER (matrix C2/C3)", () => {
  it("has exactly six claimable characters, all unclaimed", () => {
    expect(ORIGINAL_ROSTER).toHaveLength(6);
    expect(ORIGINAL_ROSTER.every((c) => c.claimedByMemberId === null)).toBe(true);
    const ids = new Set(ORIGINAL_ROSTER.map((c) => c.id));
    expect(ids.size).toBe(6);
  });

  it.each(ORIGINAL_ROSTER.map((c) => [c.id, c] as const))(
    "%s matches the custom-character shape",
    (_id, character) => {
      const sortedRatings = STATS.map((stat) => character.stats[stat]).sort((a, b) => b - a);
      expect(sortedRatings).toEqual([4, 3, 3, 2, 2, 2, 1]);

      expect(character.items.length).toBeGreaterThanOrEqual(3);
      expect(character.items.length).toBeLessThanOrEqual(4);
      for (const item of character.items) {
        expect(item.usesRemaining).toBe(item.maxUses);
        expect(item.bonusPlus).toBeGreaterThanOrEqual(1);
        expect(item.bonusPlus).toBeLessThanOrEqual(4);
      }

      expect(character.abilities).toHaveLength(3);
      expect(character.abilities.filter((a) => a.trigger === "special")).toHaveLength(1);
      expect(character.abilities.filter((a) => a.trigger === "blood")).toHaveLength(1);
      expect(character.abilities.filter((a) => a.trigger === "other")).toHaveLength(1);

      expect(character.advances).toHaveLength(3);
      expect(character.advances.every((a) => a.unlocked === false)).toBe(true);

      expect(character.injuries).toHaveLength(3);
      for (const category of character.injuries) {
        expect(category.boxes).toHaveLength(2);
        expect(category.boxes[0].marked).toBe(false);
        expect(category.boxes[0].penalty).toBeUndefined();
        expect(category.boxes[1].marked).toBe(false);
        expect(category.boxes[1].penalty).toBeDefined();
      }

      expect(character.lastStand.diceCount).toBe(8);
      expect(character.blood).toBe(0);
      expect(character.downed).toBe(false);
      expect(character.retired).toBe(false);
    },
  );

  it("every item and ability id is unique within its character", () => {
    for (const character of ORIGINAL_ROSTER) {
      expect(new Set(character.items.map((i) => i.id)).size).toBe(character.items.length);
      expect(new Set(character.abilities.map((a) => a.id)).size).toBe(character.abilities.length);
      expect(new Set(character.injuries.map((c) => c.id)).size).toBe(character.injuries.length);
    }
  });

  it("every roster character id is globally unique across the roster", () => {
    const allItemIds = ORIGINAL_ROSTER.flatMap((c) => c.items.map((i) => i.id));
    expect(new Set(allItemIds).size).toBe(allItemIds.length);
  });
});
