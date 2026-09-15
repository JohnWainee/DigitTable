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
