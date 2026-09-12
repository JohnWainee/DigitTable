import {
  asMemberId,
  asRoomId,
  asTemplateId,
  type AuthorityRecord,
  type AuthorizedMemberContext,
  type Capability,
  type MemberId,
  type ViewerContext,
  type ViewerId,
} from "@digitable/contracts";

export const FIXTURE_ROOM_ID = asRoomId("room-fixture-0001");
export const FIXTURE_TEMPLATE_ID = asTemplateId("eat-the-reich");
export const FIXTURE_TEMPLATE_VERSION = "0.0.0";
export const FIXTURE_PLATFORM_VERSION = "0.0.0";

/** A fixed seed for deterministic-dice tests. Never used outside tests. */
export const FIXTURE_SEED = "digitable-fixture-seed-v1";

export function fixtureMemberId(label: string): MemberId {
  return asMemberId(`member-${label}`);
}

export function makeMemberContext(
  memberId: MemberId,
  capability: Capability,
  roomId = FIXTURE_ROOM_ID,
): AuthorizedMemberContext {
  return { roomId, memberId, capability };
}

export function makeViewerContext(
  viewerId: ViewerId,
  capability: Capability,
  roomId = FIXTURE_ROOM_ID,
): ViewerContext {
  return { roomId, viewerId, capability };
}

export function makeAuthority<TState>(
  state: TState,
  overrides: Partial<Omit<AuthorityRecord<TState>, "state">> = {},
): AuthorityRecord<TState> {
  return {
    platformVersion: FIXTURE_PLATFORM_VERSION,
    templateId: FIXTURE_TEMPLATE_ID,
    templateVersion: FIXTURE_TEMPLATE_VERSION,
    schemaVersion: 1,
    roomRevision: 0,
    nextSequence: 1,
    ...overrides,
    state,
  };
}
