import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import {
  decideAdmitMember,
  decideClaimSeat,
  generateRecoveryCode,
  hashSecret,
  verifySecret,
  type RoomAdmissionSnapshot,
} from "@digitable/engine";
import {
  asMemberId,
  parseAuthorityAdmissionFields,
  parseHashedSecretDocument,
  parseRoomCodeDocument,
  parseUidBindingDocument,
  RoomDataError,
  type AdmissionAccepted,
  type AdmitMemberInput,
  type AuthorityAdmissionFields,
  type Capability,
  type ClaimSeatInput,
  type MemberBindingDocument,
  type MemberId,
  type RecoveryCredentialDocument,
  type RoomMemberDocument,
  type StableErrorCode,
  type UidBindingDocument,
} from "@digitable/contracts";

export type AdmissionResult =
  | { readonly ok: true; readonly accepted: AdmissionAccepted }
  | { readonly ok: false; readonly code: StableErrorCode; readonly message: string };

function denied(code: StableErrorCode, message: string): AdmissionResult {
  return { ok: false, code, message };
}

const ROOM_DATA_INVALID = denied(
  "ROOM_DATA_INVALID",
  "This room's data could not be verified. Ask the GM to check the room.",
);

/**
 * Every persisted-document read below is runtime-validated
 * (`parse*Document`, `@digitable/contracts/room.ts`) and fails closed: a
 * document that exists but does not parse throws `RoomDataError`, which the
 * transaction wrapper maps to a `ROOM_DATA_INVALID` denial — never to a
 * permissive default (active/open/zero capacity/"no binding"/"valid
 * secret"). Only a genuinely *absent* document is treated as "not found",
 * "no binding", or "cannot verify" — a distinct, narrower meaning from
 * "malformed".
 */
async function readExistingBinding(
  txn: Transaction,
  ref: DocumentReference,
): Promise<{ readonly memberId: MemberId; readonly capability: Capability } | null> {
  const snapshot = await txn.get(ref);
  if (!snapshot.exists) return null;
  const binding: UidBindingDocument = parseUidBindingDocument(snapshot.data());
  return { memberId: binding.memberId, capability: binding.capability };
}

/** `false` for a missing secret document (nothing to verify against); throws `RoomDataError` for a malformed one. */
async function readSecretValid(
  txn: Transaction,
  ref: DocumentReference,
  candidate: string,
): Promise<boolean> {
  const snapshot = await txn.get(ref);
  if (!snapshot.exists) return false;
  return verifySecret(candidate, parseHashedSecretDocument(snapshot.data()));
}

async function resolveRoomId(
  txn: Transaction,
  db: Firestore,
  roomCode: string,
): Promise<string | null> {
  const snapshot = await txn.get(db.doc(`roomCodes/${roomCode}`));
  if (!snapshot.exists) return null;
  return parseRoomCodeDocument(snapshot.data()).roomId;
}

interface ResolvedRoomContext {
  readonly roomId: string;
  readonly authorityRef: DocumentReference;
  readonly authority: AuthorityAdmissionFields;
  readonly snapshot: RoomAdmissionSnapshot;
}

/**
 * Reads every document the admission decision needs, all before any write —
 * required for Firestore transaction correctness, and the mechanism that
 * makes capacity checks and the GM-seat claim race-safe under concurrent
 * invocations (the transaction retries automatically if another commit
 * changes `authority/current` first).
 *
 * Both secrets are verified on every request: the general room passphrase
 * (`admission/secret`, gating `player`/`gm`) and the separate table code
 * (`admission/tableSecret`, gating `table`; docs/ARCHITECTURE.md section 8).
 * The pure decision picks the one the *requested* capability requires, so
 * knowing one never satisfies the other.
 */
async function resolveRoomContext(
  txn: Transaction,
  db: Firestore,
  uid: string,
  roomCode: string,
  passphrase: string,
): Promise<ResolvedRoomContext | { readonly deniedResult: AdmissionResult }> {
  const roomId = await resolveRoomId(txn, db, roomCode);
  if (roomId === null) {
    return { deniedResult: denied("ROOM_NOT_FOUND", "The room code was not recognized.") };
  }

  const authorityRef = db.doc(`rooms/${roomId}/authority/current`);
  const [authoritySnap, passphraseValid, tablePassphraseValid, existingBinding] = await Promise.all(
    [
      txn.get(authorityRef),
      readSecretValid(txn, db.doc(`rooms/${roomId}/admission/secret`), passphrase),
      readSecretValid(txn, db.doc(`rooms/${roomId}/admission/tableSecret`), passphrase),
      readExistingBinding(txn, db.doc(`rooms/${roomId}/uidBindings/${uid}`)),
    ],
  );

  if (!authoritySnap.exists) {
    return { deniedResult: denied("ROOM_NOT_FOUND", "The room code was not recognized.") };
  }
  const authority = parseAuthorityAdmissionFields(authoritySnap.data());

  return {
    roomId,
    authorityRef,
    authority,
    snapshot: {
      roomStatus: authority.roomStatus,
      admissionStatus: authority.admissionStatus,
      participantCount: authority.participantCount,
      tableSeatClaimed: authority.tableSeatClaimed,
      gmMemberId: authority.gmMemberId,
      passphraseValid,
      tablePassphraseValid,
      existingBinding,
    },
  };
}

/** Writes a newly-created seat's documents and returns its one-time recovery code. */
async function createSeat(
  txn: Transaction,
  db: Firestore,
  roomId: string,
  uid: string,
  capability: Capability,
  displayName: string,
): Promise<AdmissionAccepted> {
  const memberId = asMemberId(crypto.randomUUID());
  const recoveryCode = generateRecoveryCode();
  const hashedRecovery = await hashSecret(recoveryCode);
  const now = new Date().toISOString();

  const binding: MemberBindingDocument = { memberId, uid, capability };
  const uidBinding: UidBindingDocument = { memberId, capability };
  const member: RoomMemberDocument = {
    memberId,
    capability,
    displayName,
    joinedAtServer: now,
    lastSeenAtServer: now,
  };
  const recovery: RecoveryCredentialDocument = { memberId, ...hashedRecovery };

  txn.set(db.doc(`rooms/${roomId}/bindings/${memberId}`), binding);
  txn.set(db.doc(`rooms/${roomId}/uidBindings/${uid}`), uidBinding);
  txn.set(db.doc(`rooms/${roomId}/members/${memberId}`), member);
  txn.set(db.doc(`rooms/${roomId}/recovery/${memberId}`), recovery);

  return { memberId, capability, recoveryCode };
}

/** Runs one admission transaction, mapping a fail-closed data error to a stable denial. */
async function runAdmissionTransaction(
  db: Firestore,
  body: (txn: Transaction) => Promise<AdmissionResult>,
): Promise<AdmissionResult> {
  try {
    return await db.runTransaction(body);
  } catch (error) {
    if (error instanceof RoomDataError) return ROOM_DATA_INVALID;
    throw error;
  }
}

/**
 * Resolves an `AdmitMember` join request inside one Firestore transaction.
 * This is the trusted authority a real client reaches through the
 * `admitMember` callable (`src/index.ts`) — the operable boundary the
 * platform's join flow actually calls.
 */
export function admitMember(
  db: Firestore,
  uid: string,
  input: AdmitMemberInput,
): Promise<AdmissionResult> {
  return runAdmissionTransaction(db, async (txn) => {
    const context = await resolveRoomContext(txn, db, uid, input.roomCode, input.passphrase);
    if ("deniedResult" in context) return context.deniedResult;

    const decision = decideAdmitMember(input, context.snapshot);
    if (decision.outcome === "denied") {
      return denied(decision.code, decision.message);
    }
    if (decision.outcome === "reclaim") {
      return {
        ok: true,
        accepted: {
          memberId: decision.memberId,
          capability: decision.capability,
          recoveryCode: null,
        },
      };
    }

    const accepted = await createSeat(
      txn,
      db,
      context.roomId,
      uid,
      decision.capability,
      input.displayName,
    );
    txn.update(
      context.authorityRef,
      decision.capability === "table"
        ? { tableSeatClaimed: true }
        : { participantCount: context.authority.participantCount + 1 },
    );
    return { ok: true, accepted };
  });
}

/**
 * Resolves a `ClaimSeat` (GM) request inside one Firestore transaction. See
 * `admitMember` for the shared transaction/trust-boundary shape.
 */
export function claimSeat(
  db: Firestore,
  uid: string,
  input: ClaimSeatInput,
): Promise<AdmissionResult> {
  return runAdmissionTransaction(db, async (txn) => {
    const context = await resolveRoomContext(txn, db, uid, input.roomCode, input.passphrase);
    if ("deniedResult" in context) return context.deniedResult;

    const decision = decideClaimSeat(input, context.snapshot);
    if (decision.outcome === "denied") {
      return denied(decision.code, decision.message);
    }
    if (decision.outcome === "reclaim") {
      return {
        ok: true,
        accepted: { memberId: decision.memberId, capability: "gm", recoveryCode: null },
      };
    }

    const accepted = await createSeat(txn, db, context.roomId, uid, "gm", input.displayName);
    txn.update(context.authorityRef, {
      participantCount: context.authority.participantCount + 1,
      gmMemberId: accepted.memberId,
    });
    txn.set(
      db.doc(`rooms/${context.roomId}/meta/current`),
      { gmMemberId: accepted.memberId },
      { merge: true },
    );
    return { ok: true, accepted };
  });
}
