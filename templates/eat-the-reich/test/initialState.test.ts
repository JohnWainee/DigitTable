import { describe, expect, it } from "vitest";
import { asMemberId, asRoomId } from "@digitable/contracts";
import { eatTheReichTemplate } from "../src/engine.js";
import { GM_MEMBER_ID, PLAYER_MEMBER_ID, ROOM_ID } from "./fixtures.js";

describe("eatTheReichTemplate.initialState", () => {
  it("starts with no characters when no player has joined yet (board task A03: createRoom)", () => {
    const state = eatTheReichTemplate.initialState({
      roomId: ROOM_ID,
      gmMemberId: GM_MEMBER_ID,
      memberIds: [],
    });
    expect(state.characters).toEqual({});
    // Everything else about a fresh campaign is still populated.
    expect(state.threats).not.toEqual({});
    expect(state.rolls).toEqual({});
    expect(state.nextRollSequence).toBe(1);
  });

  it("still pre-assigns the one placeholder character when a player member is given (unchanged behavior)", () => {
    const state = eatTheReichTemplate.initialState({
      roomId: ROOM_ID,
      gmMemberId: GM_MEMBER_ID,
      memberIds: [PLAYER_MEMBER_ID],
    });
    expect(Object.keys(state.characters)).toEqual([PLAYER_MEMBER_ID]);
  });

  it("does not assign a character to the GM's own member ID when memberIds is empty", () => {
    const state = eatTheReichTemplate.initialState({
      roomId: asRoomId("room-a03-fixture"),
      gmMemberId: asMemberId("member-gm-a03"),
      memberIds: [],
    });
    expect(state.characters).toEqual({});
  });
});
