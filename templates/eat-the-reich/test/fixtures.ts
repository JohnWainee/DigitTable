import {
  asMemberId,
  asRoomId,
  type AuthorityRecord,
  type AuthorizedMemberContext,
  type MemberId,
  type RandomSource,
  type ViewerContext,
} from "@digitable/contracts";
import { eatTheReichTemplate } from "../src/engine.js";
import { EAT_THE_REICH_MANIFEST } from "../src/manifest.js";
import type {
  CharacterState,
  EatTheReichState,
  ObjectiveState,
  RollRecord,
  ThreatState,
} from "../src/state.js";

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
    schemaVersion: 3,
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

/**
 * A test double that returns an exact, pre-planned sequence of die faces
 * regardless of the `sides` requested, so a test can assert on a specific
 * worked example (docs/ETR_RULES_MATRIX.md's p.31/34/38 examples) instead
 * of a seeded-but-opaque sequence. Throws if more draws are requested than
 * were planned, so a test's die budget is self-documenting.
 */
export class FixedSequenceRandom implements RandomSource {
  private index = 0;
  constructor(private readonly faces: readonly number[]) {}
  rollDie(): number {
    if (this.index >= this.faces.length) {
      throw new Error(`FixedSequenceRandom: exhausted after ${this.faces.length} draws`);
    }
    const face = this.faces[this.index]!;
    this.index += 1;
    return face;
  }
}

const DEFAULT_OBJECTIVE: ObjectiveState = {
  id: "objective-fixture",
  title: "Fixture Objective",
  kind: "primary",
  rating: 8,
  challenge: 0,
  status: "active",
};

const DEFAULT_THREAT: ThreatState = {
  id: "threat-fixture",
  name: "Fixture Threat",
  rating: 6,
  startingAttack: 3,
  attack: 3,
  challenge: 0,
  solo: false,
  elite: false,
  flags: {},
  status: "active",
  revealed: true,
};

/** A minimal scene: one primary Objective and one revealed Threat, both overridable. */
export function stateWithScene(
  overrides: {
    readonly objective?: Partial<ObjectiveState>;
    readonly threat?: Partial<ThreatState>;
    readonly extraThreats?: readonly ThreatState[];
    readonly extraObjectives?: readonly ObjectiveState[];
  } = {},
  base: EatTheReichState = freshState(),
): EatTheReichState {
  const objective: ObjectiveState = { ...DEFAULT_OBJECTIVE, ...overrides.objective };
  const threat: ThreatState = { ...DEFAULT_THREAT, ...overrides.threat };
  const extraThreats = Object.fromEntries((overrides.extraThreats ?? []).map((t) => [t.id, t]));
  const extraObjectives = Object.fromEntries(
    (overrides.extraObjectives ?? []).map((o) => [o.id, o]),
  );
  return {
    ...base,
    objectives: { ...base.objectives, [objective.id]: objective, ...extraObjectives },
    threats: { ...base.threats, [threat.id]: threat, ...extraThreats },
  };
}

const DEFAULT_ROLL_DEFAULTS: Pick<
  RollRecord,
  | "declaredStat"
  | "declaredItemIds"
  | "declaredAbilityIds"
  | "declaredBonusClaimIds"
  | "declaredEngagedThreatIds"
  | "note"
> = {
  declaredStat: "none",
  declaredItemIds: [],
  declaredAbilityIds: [],
  declaredBonusClaimIds: [],
  declaredEngagedThreatIds: [],
  note: null,
};

/** Injects a roll directly into state, bypassing decide/reduce, for tests focused on a later lifecycle stage. */
export function stateWithRoll(
  roll: Partial<RollRecord> & Pick<RollRecord, "id" | "characterId" | "actorMemberId" | "status">,
  base: EatTheReichState = freshState(),
): EatTheReichState {
  const fullRoll: RollRecord = { ...DEFAULT_ROLL_DEFAULTS, ...roll };
  return { ...base, rolls: { ...base.rolls, [fullRoll.id]: fullRoll } };
}
