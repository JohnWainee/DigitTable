import { describe, expect, it } from "vitest";
import { ORIGINAL_ROSTER } from "../src/roster.js";
import { STATS } from "../src/state.js";

/** Exact regression coverage for the six owner-supplied sourcebook sheets. */
describe("ORIGINAL_ROSTER (matrix C2/C3)", () => {
  it("matches the complete approved source-sheet fixture", () => {
    expect(ORIGINAL_ROSTER).toMatchSnapshot();
  });

  it("uses the six core sourcebook iconic character names", () => {
    expect(ORIGINAL_ROSTER.map((character) => character.name)).toEqual([
      "Iryna",
      "Nicole",
      "Cosgrave",
      "Chuck",
      "Astrid",
      "Flint",
    ]);
  });

  it("has exactly six claimable characters, all unclaimed", () => {
    expect(ORIGINAL_ROSTER).toHaveLength(6);
    expect(ORIGINAL_ROSTER.every((c) => c.claimedByMemberId === null)).toBe(true);
    const ids = new Set(ORIGINAL_ROSTER.map((c) => c.id));
    expect(ids.size).toBe(6);
  });

  it.each(ORIGINAL_ROSTER.map((c) => [c.id, c] as const))(
    "%s matches the custom-character shape",
    (_id, character) => {
      for (const stat of STATS) {
        expect(character.stats[stat]).toBeGreaterThanOrEqual(1);
        expect(character.stats[stat]).toBeLessThanOrEqual(4);
      }

      expect(character.items.length).toBeGreaterThanOrEqual(2);
      expect(character.items.length).toBeLessThanOrEqual(6);
      for (const item of character.items) {
        expect(item.usesRemaining).toBe(item.maxUses);
        expect(item.bonusPlus).toBeGreaterThanOrEqual(0);
        expect(item.bonusPlus).toBeLessThanOrEqual(4);
      }

      expect(character.abilities.length).toBeGreaterThanOrEqual(3);

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

  it("matches the source sheets' stats, equipment, abilities, injuries, and Last Stands", () => {
    const sheet = (name: string): (typeof ORIGINAL_ROSTER)[number] =>
      ORIGINAL_ROSTER.find((character) => character.name === name)!;

    expect(
      ORIGINAL_ROSTER.map(({ name, stats, lastStand }) => ({ name, stats, lastStand })),
    ).toEqual([
      {
        name: "Iryna",
        stats: { BRAWL: 2, CON: 4, FIX: 2, SEARCH: 2, SHOOT: 3, SNEAK: 1, TERRIFY: 3 },
        lastStand: { label: "Forbidden Sorceries", diceCount: 8 },
      },
      {
        name: "Nicole",
        stats: { BRAWL: 2, CON: 2, FIX: 1, SEARCH: 2, SHOOT: 4, SNEAK: 3, TERRIFY: 3 },
        lastStand: { label: "Rigged to Blow", diceCount: 8 },
      },
      {
        name: "Cosgrave",
        stats: { BRAWL: 2, CON: 3, FIX: 3, SEARCH: 2, SHOOT: 2, SNEAK: 3, TERRIFY: 2 },
        lastStand: { label: "Undead Horde", diceCount: 8 },
      },
      {
        name: "Chuck",
        stats: { BRAWL: 3, CON: 1, FIX: 4, SEARCH: 2, SHOOT: 3, SNEAK: 2, TERRIFY: 2 },
        lastStand: { label: "Go Down Shooting", diceCount: 8 },
      },
      {
        name: "Astrid",
        stats: { BRAWL: 3, CON: 1, FIX: 2, SEARCH: 3, SHOOT: 2, SNEAK: 2, TERRIFY: 4 },
        lastStand: { label: "Unleash the Spirits", diceCount: 8 },
      },
      {
        name: "Flint",
        stats: { BRAWL: 4, CON: 2, FIX: 2, SEARCH: 2, SHOOT: 1, SNEAK: 3, TERRIFY: 3 },
        lastStand: { label: "Final Form", diceCount: 8 },
      },
    ]);

    expect(sheet("Nicole").items.map((item) => item.name)).toEqual([
      "[1] M3 submachine gun",
      "[2] Cut-down Lee Enfield rifle",
      "[3] Smoke grenades",
      "[4] Firebombs",
      "[5] Panzerfaust",
      "[6] Dynamite",
    ]);
    expect(sheet("Iryna").items.at(-1)).toMatchObject({
      bonusPlus: 0,
      poolEligible: false,
      useEffect: { kind: "gainBlood", amount: 2 },
    });
    expect(sheet("Chuck").items.at(-1)).toMatchObject({
      bonusPlus: 0,
      poolEligible: false,
      useEffect: { kind: "ignoreInjuryOrDownedAndDestroy" },
    });
    expect(sheet("Chuck").abilities.at(-1)).toMatchObject({
      name: "Corpse Eater",
      trigger: "passive",
      effect: { kind: "onOnesGainBlood", amount: 1 },
    });

    expect(
      ORIGINAL_ROSTER.flatMap((character) =>
        character.abilities
          .filter((ability) => ability.bonusPlus)
          .map(({ name, bonusRequirement, bonusPlus }) => [name, bonusRequirement, bonusPlus]),
      ),
    ).toEqual([
      ["Dark Glamour", "beautiful surroundings", 1],
      ["Night's Willing Servants", "old buildings", 1],
      ["Blink", "infiltration", 1],
      ["Danse Macabre", "Hans, are you okay?", 1],
      ["Phantasmagoria", "incorporates background cleverly", 1],
      ["Acid Spit", "against metal", 2],
      ["Spider Scurry", "low ceilings", 1],
      ["Bloodhunt", "target fleeing", 1],
      ["Sense Heartbeat", "dense cover", 1],
      ["Improvised Projectile", "aerodynamic", 1],
      ["Wings", "aerial combat", 1],
    ]);

    expect(
      ORIGINAL_ROSTER.map((character) => character.injuries.map((injury) => injury.label)),
    ).toEqual([
      ["Suit Torn / Abdominal Puncture", "Hair Ruined / Headshot", "Shoulder Injury / Arm Removed"],
      ["Dazed / Headshot", "Just a Graze / Bleeding Out", "Hand Injury / Lost an Arm"],
      [
        "Lost Some Fingers / Arm Ripped Off",
        "Sucking Chest Wound / Shot in the Face",
        "Grimoire Damaged / Wards Compromised",
      ],
      ["Flesh Wound / Shot Fulla Holes", "Limping / Crawling", "Mauled / Eviscerated"],
      [
        "Spirits Cowed / Spirits Cast Out",
        "Sigils Marred / Bleeding Shadows",
        "Limping / Ruined Leg",
      ],
      ["Teeth Smashed / Jaw Broken", "Spooked / Broken", "Hamstrung / Eviscerated"],
    ]);
  });
});
