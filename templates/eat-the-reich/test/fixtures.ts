import {
  asMemberId,
  asRoomId,
  type AuthorityRecord,
  type AuthorizedMemberContext,
  type MemberId,
  type ViewerContext,
} from "@digitable/contracts";
import { eatTheReichTemplate } from "../src/engine.js";
import { EAT_THE_REICH_MANIFEST } from "../src/manifest.js";
import type { CharacterState, EatTheReichState } from "../src/state.js";

export const ROOM_ID = asRoomId("room-fixture");
export const PLAYER_MEMBER_ID = asMemberId("member-player-one");
export const SECOND_PLAYER_MEMBER_ID = asMemberId("member-player-two");
export const GM_MEMBER_ID = asMemberId("member-gm");
export const TABLE_MEMBER_ID = asMemberId("member-table");

/** Two roster ids used across tests for readability; any six roster ids would do. */
export const ROOK_ID = "rook";
export const VESPER_ID = "vesper";

export function freshState(): EatTheReichState {
  return eatTheReichTemplate.initialState({
    roomId: ROOM_ID,
    gmMemberId: GM_MEMBER_ID,
    memberIds: [PLAYER_MEMBER_ID],
  });
}

export function freshAuthority(
  state: EatTheReichState = freshState(),
): AuthorityRecord<EatTheReichState> {
  return {
    platformVersion: "0.0.0",
    templateId: EAT_THE_REICH_MANIFEST.templateId,
    templateVersion: EAT_THE_REICH_MANIFEST.templateVersion,
    schemaVersion: 2,
    roomRevision: 0,
    nextSequence: 1,
    roomStatus: "active",
    gmMemberId: GM_MEMBER_ID,
    state,
  };
}

export const PLAYER_CTX: AuthorizedMemberContext = {
  roomId: ROOM_ID,
  memberId: PLAYER_MEMBER_ID,
  capability: "player",
};
export const SECOND_PLAYER_CTX: AuthorizedMemberContext = {
  roomId: ROOM_ID,
  memberId: SECOND_PLAYER_MEMBER_ID,
  capability: "player",
};
export const GM_CTX: AuthorizedMemberContext = {
  roomId: ROOM_ID,
  memberId: GM_MEMBER_ID,
  capability: "gm",
};
export const TABLE_CTX: AuthorizedMemberContext = {
  roomId: ROOM_ID,
  memberId: TABLE_MEMBER_ID,
  capability: "table",
};

export const PLAYER_VIEWER: ViewerContext = {
  roomId: ROOM_ID,
  viewerId: PLAYER_MEMBER_ID,
  capability: "player",
};
export const SECOND_PLAYER_VIEWER: ViewerContext = {
  roomId: ROOM_ID,
  viewerId: SECOND_PLAYER_MEMBER_ID,
  capability: "player",
};
export const GM_VIEWER: ViewerContext = { roomId: ROOM_ID, viewerId: "gm", capability: "gm" };
export const TABLE_VIEWER: ViewerContext = {
  roomId: ROOM_ID,
  viewerId: "table",
  capability: "table",
};

/**
 * Claims `characterId` for `memberId` directly in state (bypassing
 * decide/reduce) and applies an optional patch, for tests focused on
 * behavior that only matters once a character is already claimed.
 */
export function stateWithClaim(
  characterId: string,
  memberId: MemberId,
  patch: Partial<CharacterState> = {},
  base: EatTheReichState = freshState(),
): EatTheReichState {
  const character = base.characters[characterId];
  if (!character) throw new Error(`fixture: unknown character "${characterId}"`);
  return {
    ...base,
    characters: {
      ...base.characters,
      [characterId]: { ...character, claimedByMemberId: memberId, ...patch },
    },
  };
}
