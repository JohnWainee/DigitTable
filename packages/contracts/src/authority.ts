import {
  AUTHORITY_WORKING_BUDGET_BYTES,
  FIRESTORE_DOCUMENT_CEILING_BYTES,
  jsonByteSize,
} from "./size.js";
import type { VersionedTemplateRecord } from "./versions.js";
import type { MemberId } from "./ids.js";

/** Lifecycle state kept on the transaction serialization record. */
export type RoomStatus = "active" | "archived";

/**
 * `authority/current`: the sole live source of full template state
 * (docs/ARCHITECTURE.md section 8, N1). Snapshots are archival copies of
 * this shape; command execution never reconstructs state from a snapshot
 * plus an event tail.
 */
export interface AuthorityRecord<TState> extends VersionedTemplateRecord {
  readonly roomRevision: number;
  readonly nextSequence: number;
  /** Kept here (not only in meta/current) so command transactions serialize lifecycle changes. */
  readonly roomStatus: RoomStatus;
  /** The bound GM seat, or null before a GM has claimed the room. */
  readonly gmMemberId: MemberId | null;
  readonly state: TState;
}

export interface AuthorityBudgetCheck {
  readonly bytes: number;
  readonly withinWorkingBudget: boolean;
  readonly withinFirestoreCeiling: boolean;
}

export function checkAuthorityBudget<TState>(
  record: AuthorityRecord<TState>,
): AuthorityBudgetCheck {
  const bytes = jsonByteSize(record);
  return {
    bytes,
    withinWorkingBudget: bytes <= AUTHORITY_WORKING_BUDGET_BYTES,
    withinFirestoreCeiling: bytes <= FIRESTORE_DOCUMENT_CEILING_BYTES,
  };
}
