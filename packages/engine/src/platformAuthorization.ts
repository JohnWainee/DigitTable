import {
  deny,
  allow,
  jsonByteSize,
  stableError,
  type AuthorizationResult,
  type Capability,
} from "@digitable/contracts";

/** Platform-known facts about the requesting member. `null` means unauthenticated. */
export interface PlatformMember {
  readonly memberId: string;
  readonly capability: Capability;
}

export interface PlatformRoom {
  readonly status: "active" | "archived";
  readonly templateId: string;
  readonly templateVersion: string;
}

export interface PlatformCommand {
  readonly templateId: string;
  readonly templateVersion: string;
  readonly payload: unknown;
}

export interface PlatformAuthorizationLimits {
  /** Maximum serialized payload size, in bytes. */
  readonly maxPayloadBytes: number;
}

export const DEFAULT_PLATFORM_LIMITS: PlatformAuthorizationLimits = {
  maxPayloadBytes: 8 * 1024,
};

/**
 * Capabilities allowed to issue game commands. `table` has shared-read
 * capability only and cannot issue game or safety commands
 * (docs/ARCHITECTURE.md section 8).
 */
const GAME_COMMAND_CAPABILITIES: readonly Capability[] = ["player", "gm"];

/**
 * Platform authorization: room membership, seat capability, room status,
 * payload bounds, and command-family/template-version guards. Runs before
 * template authorization; a template cannot weaken any of these checks
 * (docs/ARCHITECTURE.md section 7).
 */
export function authorizePlatform(
  member: PlatformMember | null,
  room: PlatformRoom,
  command: PlatformCommand,
  limits: PlatformAuthorizationLimits = DEFAULT_PLATFORM_LIMITS,
): AuthorizationResult {
  if (member === null) {
    return deny(stableError("AUTH_REQUIRED", "Sign-in is required to act in this room."));
  }

  if (room.status === "archived") {
    return deny(stableError("ROOM_ARCHIVED", "This room has been archived."));
  }

  if (command.templateId !== room.templateId || command.templateVersion !== room.templateVersion) {
    return deny(
      stableError(
        "TEMPLATE_VERSION_MISMATCH",
        "This client's template build does not match the room's template.",
      ),
    );
  }

  if (!GAME_COMMAND_CAPABILITIES.includes(member.capability)) {
    return deny(stableError("ROLE_FORBIDDEN", "This seat cannot issue game commands."));
  }

  const payloadBytes = jsonByteSize(command.payload);
  if (payloadBytes > limits.maxPayloadBytes) {
    return deny(stableError("PAYLOAD_TOO_LARGE", "Command payload exceeds the allowed size."));
  }

  return allow();
}
