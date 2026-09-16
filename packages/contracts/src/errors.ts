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
  // Sonnet B's contract proposal (GitHub issue #14, B02/B03), reconciled
  // against docs/ETR_SESSION_FLOW.md §9/§12: Eat the Reich character claim,
  // declare, resource-spend, and round/scene-transition rejections.
  /** `claimCharacter`/reassign: the character is already bound to another member. */
  "CHARACTER_TAKEN",
  /** `declareAction`: the actor already acted this round (`actedThisRound`). */
  "NOT_YOUR_TURN",
  /** `declareAction`: the actor's character is downed, awaiting rescue. */
  "CHARACTER_DOWNED",
  /** `declareAction`: the actor's character has completed a Last Stand. */
  "CHARACTER_RETIRED",
  /** Ability use / heal / feed: the spend exceeds the character's available Blood. */
  "INSUFFICIENT_BLOOD",
  /** An item/gear option was selected with zero uses remaining. */
  "ITEM_DEPLETED",
  /** GM `EndRound` with one or more rolls still open (unresolved). */
  "ROUND_HAS_OPEN_ROLLS",
  /** GM `NextScene`/`EndMission` with one or more rolls still open (unresolved). */
  "SCENE_HAS_OPEN_ROLLS",
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
  /** The untrusted request payload failed runtime validation before any read (Phase 2 PR 3 second pass). */
  "INVALID_REQUEST",
  /**
   * Board task A03: `createRoom` exhausted its bounded room-code
   * collision-retry loop. Practically unreachable (a fresh 10-symbol code
   * from a 31-symbol alphabet collides with a live room with vanishing
   * probability), kept only so this failure mode still carries a stable
   * code instead of an unmapped internal error.
   */
  "ROOM_CREATION_FAILED",
  /**
   * Board task A06: `recoverSeat`'s candidate code matched no seat's
   * `recovery/{memberId}` hash in the room. Deliberately distinct from
   * `INVALID_PASSPHRASE` (the room's code-plus-passphrase secret) so a
   * client never conflates "wrong recovery code" with "wrong room
   * passphrase" — they gate different flows.
   */
  "INVALID_RECOVERY_CODE",
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
