import { describe, expect, it } from "vitest";
import { asMemberId, asRoomId } from "@digitable/contracts";
import { eatTheReichTemplate } from "../src/engine.js";
import { GM_MEMBER_ID, PLAYER_MEMBER_ID, ROOM_ID } from "./fixtures.js";

describe("eatTheReichTemplate.initialState", () => {
  it("starts with the complete unclaimed roster when no player has joined yet", () => {
    const state = eatTheReichTemplate.initialState({
      roomId: ROOM_ID,
      gmMemberId: GM_MEMBER_ID,
      memberIds: [],
    });
    expect(Object.keys(state.characters)).toHaveLength(6);
    expect(
      Object.values(state.characters).every((character) => character.claimedByMemberId === null),
    ).toBe(true);
    // Scene content is loaded explicitly by the GM.
    expect(state.threats).toEqual({});
    expect(state.rolls).toEqual({});
    expect(state.nextRollSequence).toBe(1);
  });

  it("does not pre-assign a character when player member IDs are supplied", () => {
    const state = eatTheReichTemplate.initialState({
      roomId: ROOM_ID,
      gmMemberId: GM_MEMBER_ID,
      memberIds: [PLAYER_MEMBER_ID],
    });
    expect(Object.keys(state.characters)).toHaveLength(6);
    expect(
      Object.values(state.characters).every((character) => character.claimedByMemberId === null),
    ).toBe(true);
  });

  it("does not assign a character to the GM's own member ID", () => {
    const state = eatTheReichTemplate.initialState({
      roomId: asRoomId("room-a03-fixture"),
      gmMemberId: asMemberId("member-gm-a03"),
      memberIds: [],
    });
    expect(
      Object.values(state.characters).every((character) => character.claimedByMemberId === null),
    ).toBe(true);
  });
});
