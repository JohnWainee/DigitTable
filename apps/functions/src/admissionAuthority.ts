import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import {
  decideAdmitMember,
  decideClaimSeat,
  generateRecoveryCode,
  hashSecret,
  verifySecret,
  type HashedSecret,
  type RoomAdmissionSnapshot,
} from "@digitable/engine";
import {
  asMemberId,
  asRoomId,
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
  readonly metaRef: DocumentReference;
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
 * Only the secret the *requested* capability needs is verified — the room
 * passphrase (`admission/secret`) for `player`/`gm`, the separate table code
 * (`admission/tableSecret`) for `table` (docs/ARCHITECTURE.md section 8) —
 * so one PBKDF2 run happens per request, not two (second pass, C10). The
 * other flag on the snapshot is simply `false`; the pure decision never
 * consults it for that capability, so knowing one secret never satisfies
 * the other.
 */
async function resolveRoomContext(
  txn: Transaction,
  db: Firestore,
  uid: string,
  roomCode: string,
  passphrase: string,
  requestedCapability: Capability,
): Promise<ResolvedRoomContext | { readonly deniedResult: AdmissionResult }> {
  const roomId = await resolveRoomId(txn, db, roomCode);
  if (roomId === null) {
    return { deniedResult: denied("ROOM_NOT_FOUND", "The room code was not recognized.") };
  }

  const authorityRef = db.doc(`rooms/${roomId}/authority/current`);
  const metaRef = db.doc(`rooms/${roomId}/meta/current`);
  const secretRef = db.doc(
    requestedCapability === "table"
      ? `rooms/${roomId}/admission/tableSecret`
      : `rooms/${roomId}/admission/secret`,
  );
  const [authoritySnap, metaSnap, secretValid, existingBinding] = await Promise.all([
    txn.get(authorityRef),
    txn.get(metaRef),
    readSecretValid(txn, secretRef, passphrase),
    readExistingBinding(txn, db.doc(`rooms/${roomId}/uidBindings/${uid}`)),
  ]);

  if (!authoritySnap.exists) {
    return { deniedResult: denied("ROOM_NOT_FOUND", "The room code was not recognized.") };
  }
  const authority = parseAuthorityAdmissionFields(authoritySnap.data());
  // `meta/current` is the client-readable mirror every GM claim updates; a
  // room without one is inconsistent data, denied rather than silently
  // created as a partial document (second pass, T6).
  if (!metaSnap.exists) throw new RoomDataError("room data: meta/current: missing");

  return {
    roomId,
    authorityRef,
    metaRef,
    authority,
    snapshot: {
      roomStatus: authority.roomStatus,
      admissionStatus: authority.admissionStatus,
      participantCount: authority.participantCount,
      tableSeatClaimed: authority.tableSeatClaimed,
      gmMemberId: authority.gmMemberId,
      passphraseValid: requestedCapability === "table" ? false : secretValid,
      tablePassphraseValid: requestedCapability === "table" ? secretValid : false,
      existingBinding,
    },
  };
}

/** A freshly minted seat identity and one-time recovery credential. */
interface SeatCredential {
  readonly memberId: MemberId;
  readonly recoveryCode: string;
  readonly hashedRecovery: HashedSecret;
}

/**
 * Minted once per request, *outside* the transaction, so the slow PBKDF2
 * hash is never redone on a transaction retry and never runs while the
 * `authority/current` lock is held (second pass, C10). Simply unused when
 * the decision is a denial or a reclaim.
 */
async function mintSeatCredential(): Promise<SeatCredential> {
  const recoveryCode = generateRecoveryCode();
  return {
    memberId: asMemberId(crypto.randomUUID()),
    recoveryCode,
    hashedRecovery: await hashSecret(recoveryCode),
  };
}

/** Writes a newly-created seat's documents and returns its one-time recovery code. */
function createSeat(
  txn: Transaction,
  db: Firestore,
  roomId: string,
  uid: string,
  capability: Capability,
  displayName: string,
  credential: SeatCredential,
  now: string,
): AdmissionAccepted {
  const { memberId, recoveryCode, hashedRecovery } = credential;

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

  return { roomId: asRoomId(roomId), memberId, capability, recoveryCode };
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
export async function admitMember(
  db: Firestore,
  uid: string,
  input: AdmitMemberInput,
): Promise<AdmissionResult> {
  const credential = await mintSeatCredential();
  return runAdmissionTransaction(db, async (txn) => {
    const context = await resolveRoomContext(
      txn,
      db,
      uid,
      input.roomCode,
      input.passphrase,
      input.requestedCapability,
    );
    if ("deniedResult" in context) return context.deniedResult;

    const decision = decideAdmitMember(input, context.snapshot);
    if (decision.outcome === "denied") {
      return denied(decision.code, decision.message);
    }
    if (decision.outcome === "reclaim") {
      return {
        ok: true,
        accepted: {
          roomId: asRoomId(context.roomId),
          memberId: decision.memberId,
          capability: decision.capability,
          recoveryCode: null,
        },
      };
    }

    const accepted = createSeat(
      txn,
      db,
      context.roomId,
      uid,
      decision.capability,
      input.displayName,
      credential,
      new Date().toISOString(),
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
export async function claimSeat(
  db: Firestore,
  uid: string,
  input: ClaimSeatInput,
): Promise<AdmissionResult> {
  const credential = await mintSeatCredential();
  return runAdmissionTransaction(db, async (txn) => {
    const context = await resolveRoomContext(txn, db, uid, input.roomCode, input.passphrase, "gm");
    if ("deniedResult" in context) return context.deniedResult;

    const decision = decideClaimSeat(input, context.snapshot);
    if (decision.outcome === "denied") {
      return denied(decision.code, decision.message);
    }
    if (decision.outcome === "reclaim") {
      return {
        ok: true,
        accepted: {
          roomId: asRoomId(context.roomId),
          memberId: decision.memberId,
          capability: "gm",
          recoveryCode: null,
        },
      };
    }

    const now = new Date().toISOString();
    const accepted = createSeat(
      txn,
      db,
      context.roomId,
      uid,
      "gm",
      input.displayName,
      credential,
      now,
    );
    txn.update(context.authorityRef, {
      participantCount: context.authority.participantCount + 1,
      gmMemberId: accepted.memberId,
    });
    // The client-readable mirror was read above (it must exist), so this is a
    // field update on a complete document, never the creation of a partial one.
    txn.update(context.metaRef, { gmMemberId: accepted.memberId, updatedAtServer: now });
    return { ok: true, accepted };
  });
}
