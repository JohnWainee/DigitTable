import { describe, expect, it } from "vitest";
import { asMemberId, asRoomId } from "@digitable/contracts";
import { eatTheReichTemplate } from "../src/engine.js";
import { ORIGINAL_ROSTER } from "../src/roster.js";
import { GM_MEMBER_ID, PLAYER_MEMBER_ID, ROOM_ID } from "./fixtures.js";

/**
 * Board task A03's `createRoom` calls `initialState` at room creation
 * time, before any player has joined. B02-B05's real roster/scene engine
 * replaced the placeholder engine A03 was written against: characters are
 * claimed via `ClaimCharacter`, never pre-assigned from `memberIds`, and no
 * scene exists until the GM's `LoadScene` (docs/ETR_SESSION_FLOW.md
 * sections 4.3 and 5). These tests pin that contract for the integration
 * of both tracks (issue #14).
 */
describe("eatTheReichTemplate.initialState", () => {
  it("starts with the full original roster unclaimed and no scene when no player has joined yet (board task A03: createRoom)", () => {
    const state = eatTheReichTemplate.initialState({
      roomId: ROOM_ID,
      gmMemberId: GM_MEMBER_ID,
      memberIds: [],
    });
    expect(Object.keys(state.characters).sort()).toEqual(
      ORIGINAL_ROSTER.map((character) => character.id).sort(),
    );
    for (const character of Object.values(state.characters)) {
      expect(character.claimedByMemberId).toBeNull();
      expect(character.blood).toBeGreaterThanOrEqual(0);
    }
    expect(state.scene).toBeNull();
    expect(state.objectives).toEqual({});
    expect(state.threats).toEqual({});
    expect(state.rolls).toEqual({});
    expect(state.nextRollSequence).toBe(1);
    expect(state.paused).toBe(false);
    expect(state.missionEnded).toBe(false);
    expect(state.schemaVersion).toBe(eatTheReichTemplate.manifest.currentSchemaVersion);
  });

  it("does not pre-assign any character when a player member is given: claims happen through ClaimCharacter (B02)", () => {
    const state = eatTheReichTemplate.initialState({
      roomId: ROOM_ID,
      gmMemberId: GM_MEMBER_ID,
      memberIds: [PLAYER_MEMBER_ID],
    });
    expect(
      Object.values(state.characters).every((character) => character.claimedByMemberId === null),
    ).toBe(true);
    expect(state.characters[PLAYER_MEMBER_ID]).toBeUndefined();
  });

  it("does not assign a character to the GM's own member ID", () => {
    const state = eatTheReichTemplate.initialState({
      roomId: asRoomId("room-a03-fixture"),
      gmMemberId: asMemberId("member-gm-a03"),
      memberIds: [],
    });
    expect(
      Object.values(state.characters).some(
        (character) => character.claimedByMemberId === asMemberId("member-gm-a03"),
      ),
    ).toBe(false);
  });
});
