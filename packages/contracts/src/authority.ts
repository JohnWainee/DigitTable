import {
  AUTHORITY_WORKING_BUDGET_BYTES,
  FIRESTORE_DOCUMENT_CEILING_BYTES,
  jsonByteSize,
} from "./size.js";
import type { MemberId } from "./ids.js";
import type { RoomStatus } from "./room.js";
import type { VersionedTemplateRecord } from "./versions.js";

/**
 * `authority/current`: the sole live source of full template state
 * (docs/ARCHITECTURE.md section 8, N1). Snapshots are archival copies of
 * this shape; command execution never reconstructs state from a snapshot
 * plus an event tail.
 *
 * Also carries `roomStatus` and `gmMemberId` directly, because this document
 * is already the command transaction's serialization point: a transaction
 * that read only `meta/current` for these fields could miss a concurrent
 * archive or GM-seat transfer committed by a different transaction
 * (third-pass review R2). `meta/current` mirrors the same two fields for
 * clients that only need to display room status without subscribing to this
 * service-only document; the transaction that changes either field writes
 * both documents atomically.
 */
export interface AuthorityRecord<TState> extends VersionedTemplateRecord {
  readonly roomRevision: number;
  readonly nextSequence: number;
  readonly roomStatus: RoomStatus;
  readonly gmMemberId: MemberId;
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
