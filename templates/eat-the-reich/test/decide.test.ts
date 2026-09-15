import { createSeededRandom } from "@digitable/engine";
import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import type { EatTheReichState } from "../src/state.js";
import {
  GM_CTX,
  PLAYER_CTX,
  PLAYER_MEMBER_ID,
  ROOK_ID,
  SECOND_PLAYER_CTX,
  VESPER_ID,
  freshState,
  stateWithClaim,
} from "./fixtures.js";

const random = (): ReturnType<typeof createSeededRandom> => createSeededRandom("decide-test-seed");

describe("decide: ClaimCharacter (matrix C2)", () => {
  it("claims an unclaimed character", () => {
    const decision = eatTheReichTemplate.decide(
      { state: freshState(), actor: PLAYER_CTX, random: random() },
      { type: "ClaimCharacter", characterId: ROOK_ID },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.events).toHaveLength(1);
    expect(decision.events[0]?.event).toEqual({
      type: "CharacterClaimed",
      characterId: ROOK_ID,
      memberId: PLAYER_MEMBER_ID,
    });
  });

  it("rejects claiming an already-claimed character (CHARACTER_TAKEN)", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    const decision = eatTheReichTemplate.decide(
      { state, actor: SECOND_PLAYER_CTX, random: random() },
      { type: "ClaimCharacter", characterId: ROOK_ID },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("CHARACTER_TAKEN");
  });

  it("rejects claiming an unknown character", () => {
    const decision = eatTheReichTemplate.decide(
      { state: freshState(), actor: PLAYER_CTX, random: random() },
      { type: "ClaimCharacter", characterId: "not-a-character" },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("UNKNOWN_ACTION");
  });

  it("rejects a member claiming a second character while already holding one", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: random() },
      { type: "ClaimCharacter", characterId: VESPER_ID },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("ROLE_FORBIDDEN");
  });
});

describe("decide: ReleaseCharacter", () => {
  it("releases the caller's own character", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: random() },
      { type: "ReleaseCharacter", characterId: ROOK_ID },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.events[0]?.event).toEqual({
      type: "CharacterReleased",
      characterId: ROOK_ID,
      memberId: PLAYER_MEMBER_ID,
    });
  });

  it("rejects releasing another member's character", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    const decision = eatTheReichTemplate.decide(
      { state, actor: SECOND_PLAYER_CTX, random: random() },
      { type: "ReleaseCharacter", characterId: ROOK_ID },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("ROLE_FORBIDDEN");
  });

  it("rejects releasing an unclaimed character", () => {
    const decision = eatTheReichTemplate.decide(
      { state: freshState(), actor: PLAYER_CTX, random: random() },
      { type: "ReleaseCharacter", characterId: ROOK_ID },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("ROLE_FORBIDDEN");
  });
});

describe("decide: HealInjury (matrix C6)", () => {
  function markedState(blood: number): EatTheReichState {
    const base = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID, { blood });
    const character = base.characters[ROOK_ID];
    if (!character) throw new Error("fixture missing rook");
    const injuries = character.injuries.map((category, index) =>
      index === 0
        ? {
            ...category,
            boxes: [{ marked: true }, category.boxes[1]] as [
              (typeof category.boxes)[0],
              (typeof category.boxes)[1],
            ],
          }
        : category,
    );
    return {
      ...base,
      characters: { ...base.characters, [ROOK_ID]: { ...character, injuries } },
    };
  }

  it("clears a marked box for 3 blood", () => {
    const state = markedState(5);
    const categoryId = state.characters[ROOK_ID]?.injuries[0]?.id;
    if (!categoryId) throw new Error("fixture missing category");
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: random() },
      { type: "HealInjury", characterId: ROOK_ID, categoryId, boxIndex: 0 },
    );
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.events[0]?.event).toEqual({
      type: "InjuryHealed",
      characterId: ROOK_ID,
      categoryId,
      boxIndex: 0,
      bloodSpent: 3,
    });
  });

  it("rejects healing below cost (INSUFFICIENT_BLOOD)", () => {
    const state = markedState(2);
    const categoryId = state.characters[ROOK_ID]?.injuries[0]?.id;
    if (!categoryId) throw new Error("fixture missing category");
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: random() },
      { type: "HealInjury", characterId: ROOK_ID, categoryId, boxIndex: 0 },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("INSUFFICIENT_BLOOD");
  });

  it("rejects healing an unmarked box", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID, { blood: 5 });
    const categoryId = state.characters[ROOK_ID]?.injuries[0]?.id;
    if (!categoryId) throw new Error("fixture missing category");
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: random() },
      { type: "HealInjury", characterId: ROOK_ID, categoryId, boxIndex: 0 },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("UNKNOWN_ACTION");
  });

  it("rejects healing another member's character", () => {
    const state = markedState(5);
    const categoryId = state.characters[ROOK_ID]?.injuries[0]?.id;
    if (!categoryId) throw new Error("fixture missing category");
    const decision = eatTheReichTemplate.decide(
      { state, actor: SECOND_PLAYER_CTX, random: random() },
      { type: "HealInjury", characterId: ROOK_ID, categoryId, boxIndex: 0 },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("ROLE_FORBIDDEN");
  });

  it("rejects healing a retired character (CHARACTER_RETIRED)", () => {
    const base = markedState(5);
    const character = base.characters[ROOK_ID];
    if (!character) throw new Error("fixture missing rook");
    const state = {
      ...base,
      characters: { ...base.characters, [ROOK_ID]: { ...character, retired: true } },
    };
    const categoryId = character.injuries[0]?.id;
    if (!categoryId) throw new Error("fixture missing category");
    const decision = eatTheReichTemplate.decide(
      { state, actor: PLAYER_CTX, random: random() },
      { type: "HealInjury", characterId: ROOK_ID, categoryId, boxIndex: 0 },
    );
    expect(decision.ok).toBe(false);
    if (decision.ok) return;
    expect(decision.code).toBe("CHARACTER_RETIRED");
  });
});

describe("decide: GM cannot act as a player", () => {
  it("GM is denied at authorization, never reaching decide, for ClaimCharacter", () => {
    const result = eatTheReichTemplate.authorizeGameAction(GM_CTX, {
      type: "ClaimCharacter",
      characterId: ROOK_ID,
    });
    expect(result.allowed).toBe(false);
  });
});
