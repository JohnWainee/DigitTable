import { describe, expect, it } from "vitest";
import { ACTION_ID, THREAT_ID } from "../src/content.js";
import { eatTheReichTemplate } from "../src/engine.js";
import { GM_CTX, GM_MEMBER_ID, PLAYER_CTX, PLAYER_MEMBER_ID, TABLE_CTX } from "./fixtures.js";

describe("authorizeGameAction", () => {
  it("allows a player to begin an action as themselves", () => {
    const result = eatTheReichTemplate.authorizeGameAction(PLAYER_CTX, {
      type: "BeginAction",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      gearIds: [],
    });
    expect(result).toEqual({ allowed: true });
  });

  it("denies a player beginning an action as a different member", () => {
    const result = eatTheReichTemplate.authorizeGameAction(PLAYER_CTX, {
      type: "BeginAction",
      actorMemberId: GM_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      gearIds: [],
    });
    expect(result.allowed).toBe(false);
  });

  it("denies the GM from beginning an action", () => {
    const result = eatTheReichTemplate.authorizeGameAction(GM_CTX, {
      type: "BeginAction",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      gearIds: [],
    });
    expect(result.allowed).toBe(false);
  });

  it("allows the GM to submit opposition", () => {
    const result = eatTheReichTemplate.authorizeGameAction(GM_CTX, {
      type: "SubmitOpposition",
      rollId: "roll-1",
      pushDice: 0,
    });
    expect(result).toEqual({ allowed: true });
  });

  it("denies a player from submitting opposition", () => {
    const result = eatTheReichTemplate.authorizeGameAction(PLAYER_CTX, {
      type: "SubmitOpposition",
      rollId: "roll-1",
      pushDice: 0,
    });
    expect(result.allowed).toBe(false);
  });

  it("denies the table seat from every game command", () => {
    const begin = eatTheReichTemplate.authorizeGameAction(TABLE_CTX, {
      type: "BeginAction",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      gearIds: [],
    });
    const oppose = eatTheReichTemplate.authorizeGameAction(TABLE_CTX, {
      type: "SubmitOpposition",
      rollId: "roll-1",
      pushDice: 0,
    });
    const allocate = eatTheReichTemplate.authorizeGameAction(TABLE_CTX, {
      type: "AllocateResults",
      rollId: "roll-1",
      allocations: [],
    });
    expect(begin.allowed).toBe(false);
    expect(oppose.allowed).toBe(false);
    expect(allocate.allowed).toBe(false);
  });

  it("allows a player to allocate results", () => {
    const result = eatTheReichTemplate.authorizeGameAction(PLAYER_CTX, {
      type: "AllocateResults",
      rollId: "roll-1",
      allocations: [],
    });
    expect(result).toEqual({ allowed: true });
  });
});
