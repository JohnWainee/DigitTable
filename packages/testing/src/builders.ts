import {
  asMemberId,
  asRoomId,
  asTemplateId,
  type AuthorityRecord,
  type AuthorizedMemberContext,
  type Capability,
  type MemberId,
  type RoomAdmissionAccepted,
  type RoomAdmissionRejected,
  type StableErrorCode,
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
    roomStatus: "active",
    gmMemberId: null,
    ...overrides,
    state,
  };
}

/** A stable, human-plausible room code for fixtures. Not cryptographically generated (that's A03's job). */
export const FIXTURE_ROOM_CODE = "FOX-TROT-42";

/**
 * A02 fixture: a successful create/join/claim outcome. Sonnet B and C can
 * build screens and projections against this before A03's real `createRoom`
 * exists. `overrides` lets a caller flip `capability`/`recoveryCode` for the
 * player/table/reclaim cases.
 */
export function makeRoomAdmissionAccepted(
  overrides: Partial<RoomAdmissionAccepted> = {},
): RoomAdmissionAccepted {
  return {
    ok: true,
    roomId: FIXTURE_ROOM_ID,
    roomCode: FIXTURE_ROOM_CODE,
    memberId: "member-fixture-gm",
    capability: "gm",
    recoveryCode: "fixture-recovery-code",
    roomRevision: 0,
    ...overrides,
  };
}

/** A02 fixture: a rejected create/join/claim outcome. */
export function makeRoomAdmissionRejected(
  code: StableErrorCode,
  message = `fixture rejection: ${code}`,
): RoomAdmissionRejected {
  return { ok: false, code, message };
}
