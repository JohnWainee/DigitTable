import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import { GM_CTX, PLAYER_CTX, ROOK_ID, TABLE_CTX } from "./fixtures.js";

describe("authorizeGameAction", () => {
  it("allows a player to claim a character", () => {
    const result = eatTheReichTemplate.authorizeGameAction(PLAYER_CTX, {
      type: "ClaimCharacter",
      characterId: ROOK_ID,
    });
    expect(result).toEqual({ allowed: true });
  });

  it("denies the GM from claiming a character", () => {
    const result = eatTheReichTemplate.authorizeGameAction(GM_CTX, {
      type: "ClaimCharacter",
      characterId: ROOK_ID,
    });
    expect(result.allowed).toBe(false);
  });

  it("denies the table seat from every game command", () => {
    const claim = eatTheReichTemplate.authorizeGameAction(TABLE_CTX, {
      type: "ClaimCharacter",
      characterId: ROOK_ID,
    });
    const release = eatTheReichTemplate.authorizeGameAction(TABLE_CTX, {
      type: "ReleaseCharacter",
      characterId: ROOK_ID,
    });
    const heal = eatTheReichTemplate.authorizeGameAction(TABLE_CTX, {
      type: "HealInjury",
      characterId: ROOK_ID,
      categoryId: "rook-papers-burned",
      boxIndex: 0,
    });
    expect(claim.allowed).toBe(false);
    expect(release.allowed).toBe(false);
    expect(heal.allowed).toBe(false);
  });

  it("allows a player to release a character", () => {
    const result = eatTheReichTemplate.authorizeGameAction(PLAYER_CTX, {
      type: "ReleaseCharacter",
      characterId: ROOK_ID,
    });
    expect(result).toEqual({ allowed: true });
  });

  it("allows a player to heal an injury", () => {
    const result = eatTheReichTemplate.authorizeGameAction(PLAYER_CTX, {
      type: "HealInjury",
      characterId: ROOK_ID,
      categoryId: "rook-papers-burned",
      boxIndex: 0,
    });
    expect(result).toEqual({ allowed: true });
  });
});
