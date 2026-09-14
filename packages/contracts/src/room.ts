import type { AuthorityRecord, RoomStatus } from "./authority.js";
import type { CommandId, MemberId, ReceiptId, RoomId } from "./ids.js";
import type { Capability } from "./template.js";
import type { VersionedTemplateRecord } from "./versions.js";

/** Client-readable mirror of room lifecycle metadata at `meta/current`. */
export interface RoomMetaDocument extends VersionedTemplateRecord {
  readonly roomStatus: RoomStatus;
  readonly gmMemberId: MemberId | null;
  readonly createdAtServer: string;
  readonly updatedAtServer: string;
}

/** Client-readable roster entry at `members/{memberId}`. */
export interface RoomMemberDocument {
  readonly memberId: MemberId;
  readonly capability: Capability;
  readonly displayName: string;
  readonly joinedAtServer: string;
  readonly lastSeenAtServer: string;
}

/** Service-only stable-seat binding at `bindings/{memberId}`. */
export interface MemberBindingDocument {
  readonly memberId: MemberId;
  readonly uid: string;
  readonly capability: Capability;
}

/**
 * Service-only rules lookup at `uidBindings/{uid}`. Its two fields are the
 * authorization contract consumed by Firestore rules, so writers must never
 * spell them independently (Phase 2 PR 2 review S6).
 */
export interface UidBindingDocument {
  readonly memberId: MemberId;
  readonly capability: Capability;
}

/** Actor-private command outcome at `receipts/{memberId}_{commandId}`. */
export interface CommandReceiptDocument {
  readonly receiptId: ReceiptId;
  readonly memberId: MemberId;
  readonly commandId: CommandId;
  readonly status: "accepted" | "rejected";
  readonly acceptedSequence: number | null;
  readonly roomRevision: number;
}

/** Service-only archival copy at `snapshots/{sequence}`. */
export interface SnapshotDocument<TState> {
  readonly sequence: number;
  readonly checksum: string;
  readonly authority: AuthorityRecord<TState>;
}

/** Service-only code index at `roomCodes/{code}`. Code material never appears here. */
export interface RoomCodeDocument {
  readonly roomId: RoomId;
}

/**
 * Service-only salted-hash record. Shared shape for the room passphrase
 * (`rooms/{roomId}/admission/secret`) and per-seat recovery codes
 * (`rooms/{roomId}/recovery/{memberId}`, Phase 2 PR 3) — both are "shown or
 * set once, verified many times" secrets per docs/ARCHITECTURE.md section 8,
 * never stored or logged in plaintext.
 */
export interface HashedSecretDocument {
  readonly hash: string;
  readonly salt: string;
  readonly iterations: number;
}

/** Service-only room passphrase at `rooms/{roomId}/admission/secret`. */
export type RoomAdmissionSecretDocument = HashedSecretDocument;

/** Service-only per-seat recovery credential at `rooms/{roomId}/recovery/{memberId}`. */
export interface RecoveryCredentialDocument extends HashedSecretDocument {
  readonly memberId: MemberId;
}

/** Canonical Firestore document identifier from the architecture's R6 decision. */
export function receiptIdFor(memberId: MemberId, commandId: CommandId): ReceiptId {
  return `${memberId}_${commandId}` as ReceiptId;
}
