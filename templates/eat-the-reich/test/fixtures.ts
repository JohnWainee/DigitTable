import {
  asMemberId,
  asRoomId,
  type AuthorityRecord,
  type AuthorizedMemberContext,
  type ViewerContext,
} from "@digitable/contracts";
import { eatTheReichTemplate } from "../src/engine.js";
import { EAT_THE_REICH_MANIFEST } from "../src/manifest.js";
import type { EatTheReichState, RollState } from "../src/state.js";

export const ROOM_ID = asRoomId("room-fixture");
export const PLAYER_MEMBER_ID = asMemberId("member-rook");
export const GM_MEMBER_ID = asMemberId("member-gm");
export const TABLE_MEMBER_ID = asMemberId("member-table");

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
    schemaVersion: 1,
    roomRevision: 0,
    nextSequence: 1,
    state,
  };
}

export const PLAYER_CTX: AuthorizedMemberContext = {
  roomId: ROOM_ID,
  memberId: PLAYER_MEMBER_ID,
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
export const GM_VIEWER: ViewerContext = { roomId: ROOM_ID, viewerId: "gm", capability: "gm" };
export const TABLE_VIEWER: ViewerContext = {
  roomId: ROOM_ID,
  viewerId: "table",
  capability: "table",
};

const DEFAULT_ROLL_DEFAULTS: Pick<
  RollState,
  "playerFaces" | "playerHits" | "poolComponents" | "hiddenAdjustmentApplied"
> = {
  playerFaces: [],
  playerHits: 0,
  poolComponents: { nerve: 0, gear: 0, hiddenModifier: 0 },
  hiddenAdjustmentApplied: false,
};

/** Injects a roll directly into state, bypassing decide/reduce, for tests that only care about later lifecycle stages. */
export function stateWithRoll(
  roll: Partial<RollState> &
    Pick<RollState, "id" | "actorMemberId" | "threatId" | "actionId" | "status">,
  base: EatTheReichState = freshState(),
): EatTheReichState {
  const fullRoll: RollState = { ...DEFAULT_ROLL_DEFAULTS, ...roll };
  return { ...base, rolls: { ...base.rolls, [fullRoll.id]: fullRoll } };
}
