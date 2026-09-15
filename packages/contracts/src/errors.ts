/**
 * Stable error codes map to actionable client states (docs/ARCHITECTURE.md
 * section 6). Never expose stack traces or hidden payload details alongside
 * these codes.
 */
export const STABLE_ERROR_CODES = [
  "AUTH_REQUIRED",
  "ROLE_FORBIDDEN",
  "REVISION_CONFLICT",
  "ROLL_ALREADY_RESOLVED",
  "TEMPLATE_VERSION_MISMATCH",
  "ROOM_ARCHIVED",
  "RATE_LIMITED",
  "PAYLOAD_TOO_LARGE",
  "UNKNOWN_ACTION",
  "INVALID_ALLOCATION",
  "ROOM_FULL",
  "ADMISSION_CLOSED",
  "ROOM_NOT_FOUND",
  "INVALID_PASSPHRASE",
  "GM_SEAT_TAKEN",
  /**
   * A persisted document required for a decision (authority, room-code
   * index, uid binding, or secret hash) exists but fails runtime validation
   * — malformed data never defaults to a permissive state (open/active/zero
   * capacity); the request is denied instead (Phase 2 PR 3 review).
   */
  "ROOM_DATA_INVALID",
] as const;

export type StableErrorCode = (typeof STABLE_ERROR_CODES)[number];

export interface StableError {
  readonly code: StableErrorCode;
  /** Human-readable, safe to show a player. Never includes hidden state. */
  readonly message: string;
}

export function stableError(code: StableErrorCode, message: string): StableError {
  return { code, message };
}
