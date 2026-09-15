import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import { PLAYER_MEMBER_ID, ROOK_ID, freshState, stateWithClaim } from "./fixtures.js";

describe("reduce", () => {
  it("CharacterClaimed binds the character to the member", () => {
    const state = eatTheReichTemplate.reduce(freshState(), {
      type: "CharacterClaimed",
      characterId: ROOK_ID,
      memberId: PLAYER_MEMBER_ID,
    });
    expect(state.characters[ROOK_ID]?.claimedByMemberId).toBe(PLAYER_MEMBER_ID);
  });

  it("CharacterReleased clears the binding", () => {
    const claimed = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    const state = eatTheReichTemplate.reduce(claimed, {
      type: "CharacterReleased",
      characterId: ROOK_ID,
      memberId: PLAYER_MEMBER_ID,
    });
    expect(state.characters[ROOK_ID]?.claimedByMemberId).toBeNull();
  });

  it("an event for an unknown character is a no-op", () => {
    const before = freshState();
    const after = eatTheReichTemplate.reduce(before, {
      type: "CharacterClaimed",
      characterId: "not-a-character",
      memberId: PLAYER_MEMBER_ID,
    });
    expect(after).toEqual(before);
  });

  it("InjuryHealed clears exactly the named box and spends Blood, clamped at 0", () => {
    const base = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID, { blood: 2 });
    const character = base.characters[ROOK_ID];
    if (!character) throw new Error("fixture missing rook");
    const categoryId = character.injuries[0]?.id;
    if (!categoryId) throw new Error("fixture missing category");
    const markedCategory = character.injuries[0];
    if (!markedCategory) throw new Error("fixture missing category");
    const state = {
      ...base,
      characters: {
        ...base.characters,
        [ROOK_ID]: {
          ...character,
          injuries: character.injuries.map((c, i) =>
            i === 0 ? { ...c, boxes: [{ marked: true }, c.boxes[1]] as typeof c.boxes } : c,
          ),
        },
      },
    };
    const after = eatTheReichTemplate.reduce(state, {
      type: "InjuryHealed",
      characterId: ROOK_ID,
      categoryId,
      boxIndex: 0,
      bloodSpent: 3,
    });
    expect(after.characters[ROOK_ID]?.injuries[0]?.boxes[0].marked).toBe(false);
    // Blood was 2 and the spend is 3; reduce never trusts an un-vetted event's
    // arithmetic to go negative (decide already rejects this in practice).
    expect(after.characters[ROOK_ID]?.blood).toBe(0);
  });

  it("InjuryHealed only clears the named box, not its sibling", () => {
    const base = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID, { blood: 10 });
    const character = base.characters[ROOK_ID];
    if (!character) throw new Error("fixture missing rook");
    const categoryId = character.injuries[0]?.id;
    if (!categoryId) throw new Error("fixture missing category");
    const state = {
      ...base,
      characters: {
        ...base.characters,
        [ROOK_ID]: {
          ...character,
          injuries: character.injuries.map((c, i) =>
            i === 0
              ? {
                  ...c,
                  boxes: [{ marked: true }, { ...c.boxes[1], marked: true }] as typeof c.boxes,
                }
              : c,
          ),
        },
      },
    };
    const after = eatTheReichTemplate.reduce(state, {
      type: "InjuryHealed",
      characterId: ROOK_ID,
      categoryId,
      boxIndex: 0,
      bloodSpent: 3,
    });
    expect(after.characters[ROOK_ID]?.injuries[0]?.boxes[0].marked).toBe(false);
    expect(after.characters[ROOK_ID]?.injuries[0]?.boxes[1].marked).toBe(true);
  });

  it("ActionRolled decrements exactly the charged items' usesRemaining and spends/gains Blood (matrix P2)", () => {
    const base = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID, { blood: 5 });
    const character = base.characters[ROOK_ID];
    if (!character) throw new Error("fixture missing rook");
    const declared = {
      ...base,
      rolls: {
        "roll-1": {
          id: "roll-1",
          characterId: ROOK_ID,
          actorMemberId: PLAYER_MEMBER_ID,
          status: "declared" as const,
          declaredStat: "SNEAK" as const,
          declaredItemIds: [],
          declaredAbilityIds: [],
          declaredBonusClaimIds: [],
          declaredEngagedThreatIds: [],
          note: null,
        },
      },
    };
    const after = eatTheReichTemplate.reduce(declared, {
      type: "ActionRolled",
      rollId: "roll-1",
      characterId: ROOK_ID,
      approvedBonusClaims: [],
      engagedThreatIds: [],
      primaryEngagedThreatId: null,
      playerFaces: [4],
      keptDice: [{ faceIndex: 0, face: 4, result: "success", points: 1 }],
      attackDiceRolled: 0,
      attackFaces: [],
      attackSuccessesRolled: 0,
      itemIdsCharged: ["rook-silenced-pistol"],
      bloodSpent: 2,
      passiveBloodGained: 1,
    });
    expect(
      after.characters[ROOK_ID]?.items.find((i) => i.id === "rook-silenced-pistol")?.usesRemaining,
    ).toBe(2);
    // Every other item is untouched.
    expect(
      after.characters[ROOK_ID]?.items.find((i) => i.id === "rook-forged-papers")?.usesRemaining,
    ).toBe(3);
    expect(after.characters[ROOK_ID]?.blood).toBe(4); // 5 - 2 + 1
    expect(after.rolls["roll-1"]?.status).toBe("awaiting_allocation");
    expect(after.rolls["roll-1"]?.keptDice).toHaveLength(1);
  });
});
