import type { Firestore, Transaction } from "firebase-admin/firestore";
import { generateRecoveryCode, hashSecret, verifySecret } from "@digitable/engine";
import {
  RoomDataError,
  asMemberId,
  asRoomId,
  parseHashedSecretDocument,
  parseRoomCodeDocument,
  type Capability,
  type MemberId,
  type RecoverSeatAccepted,
  type RecoverSeatInput,
  type RecoveryCredentialDocument,
  type SeatRecoveredAuditDocument,
  type StableErrorCode,
  type UidBindingDocument,
} from "@digitable/contracts";

export type RecoverySeatResult =
  | { readonly ok: true; readonly accepted: RecoverSeatAccepted }
  | { readonly ok: false; readonly code: StableErrorCode; readonly message: string };

function denied(code: StableErrorCode, message: string): RecoverySeatResult {
  return { ok: false, code, message };
}

const ROOM_DATA_INVALID = denied(
  "ROOM_DATA_INVALID",
  "A stored record could not be verified while recovering this seat.",
);

const INVALID_RECOVERY_CODE = denied(
  "INVALID_RECOVERY_CODE",
  "That recovery code was not recognized for this room.",
);

interface CandidateSeat {
  readonly memberId: MemberId;
  readonly uid: string;
  readonly capability: Capability;
}

/**
 * Every currently-seated member's binding (`bindings/{memberId}`),
 * fail-closed on a malformed entry — bounded to at most
 * `MAX_PARTICIPANT_SEATS + 1` documents (`admission.ts`), so checking the
 * candidate code against every one of them is a small, fixed-size scan, not
 * an unbounded operation.
 */
async function seatedBindings(
  txn: Transaction,
  db: Firestore,
  roomId: string,
): Promise<readonly CandidateSeat[]> {
  const snapshot = await txn.get(db.collection(`rooms/${roomId}/bindings`));
  return snapshot.docs.map((doc) => {
    const data = doc.data() as {
      readonly memberId?: unknown;
      readonly uid?: unknown;
      readonly capability?: unknown;
    };
    if (typeof data.memberId !== "string" || data.memberId.length === 0) {
      throw new RoomDataError(`room data: bindings/${doc.id}.memberId: malformed or missing`);
    }
    if (typeof data.uid !== "string" || data.uid.length === 0) {
      throw new RoomDataError(`room data: bindings/${doc.id}.uid: malformed or missing`);
    }
    if (data.capability !== "player" && data.capability !== "gm" && data.capability !== "table") {
      throw new RoomDataError(`room data: bindings/${doc.id}.capability: malformed or missing`);
    }
    return { memberId: asMemberId(data.memberId), uid: data.uid, capability: data.capability };
  });
}

/**
 * Finds which seated member's `recovery/{memberId}` hash the candidate code
 * matches, checking every seat (constant-time per check via `verifySecret`;
 * checking all of them rather than stopping "early" on structural grounds
 * is itself already what a fixed, bounded scan does — there is no seat-
 * count side channel beyond what the bounded seat cap already reveals).
 * `null` for no match, including a room with no seated members.
 */
async function findRecoverableSeat(
  txn: Transaction,
  db: Firestore,
  roomId: string,
  seats: readonly CandidateSeat[],
  candidateCode: string,
): Promise<CandidateSeat | null> {
  let matched: CandidateSeat | null = null;
  for (const seat of seats) {
    const snapshot = await txn.get(db.doc(`rooms/${roomId}/recovery/${seat.memberId}`));
    if (!snapshot.exists) continue;
    const hashed = parseHashedSecretDocument(snapshot.data());
    if (await verifySecret(candidateCode, hashed)) {
      matched = seat;
    }
  }
  return matched;
}

/** Runs one recovery transaction, mapping a fail-closed data error to a stable denial — same shape as the other trusted authorities. */
async function runRecoveryTransaction(
  db: Firestore,
  body: (txn: Transaction) => Promise<RecoverySeatResult>,
): Promise<RecoverySeatResult> {
  try {
    return await db.runTransaction(body);
  } catch (error) {
    if (error instanceof RoomDataError) return ROOM_DATA_INVALID;
    throw error;
  }
}

/**
 * Resolves a `recoverSeat` redemption (board task A06,
 * docs/ARCHITECTURE.md section 8 "Redemption"): the caller proves
 * ownership of a seat by presenting its recovery code — never a
 * client-asserted `memberId` — and the transaction rebinds that seat to
 * the caller's current UID, invalidates the spent code (replacing it with
 * a freshly minted one, since a seat that can never be recovered again is
 * a worse failure mode than a rotated credential), and writes a
 * GM-visible audit entry naming only the seat. The old UID's binding is
 * deleted in the same transaction (`docs/ARCHITECTURE.md`: "old-UID access
 * revocation" for Firestore membership; the old UID remains an
 * authenticated Firebase user and its RTDB presence write grant is a
 * documented, accepted residual — RTDB presence itself is not implemented
 * by this platform yet, so there is nothing to revoke there today).
 */
export async function recoverSeat(
  db: Firestore,
  uid: string,
  input: RecoverSeatInput,
): Promise<RecoverySeatResult> {
  const recoveryCode = generateRecoveryCode();
  const hashedRecovery = await hashSecret(recoveryCode);
  const now = new Date().toISOString();

  return runRecoveryTransaction(db, async (txn) => {
    const roomCodeSnap = await txn.get(db.doc(`roomCodes/${input.roomCode}`));
    if (!roomCodeSnap.exists) {
      return denied("ROOM_NOT_FOUND", "The room code was not recognized.");
    }
    const roomId = parseRoomCodeDocument(roomCodeSnap.data()).roomId;

    const seats = await seatedBindings(txn, db, roomId);
    const matched = await findRecoverableSeat(txn, db, roomId, seats, input.recoveryCode);
    if (matched === null) return INVALID_RECOVERY_CODE;

    const uidBinding: UidBindingDocument = {
      memberId: matched.memberId,
      capability: matched.capability,
    };
    if (matched.uid !== uid) {
      txn.delete(db.doc(`rooms/${roomId}/uidBindings/${matched.uid}`));
    }
    txn.set(db.doc(`rooms/${roomId}/uidBindings/${uid}`), uidBinding);
    txn.update(db.doc(`rooms/${roomId}/bindings/${matched.memberId}`), { uid });

    const recovery: RecoveryCredentialDocument = { memberId: matched.memberId, ...hashedRecovery };
    txn.set(db.doc(`rooms/${roomId}/recovery/${matched.memberId}`), recovery);

    const audit: SeatRecoveredAuditDocument = {
      type: "SeatRecovered",
      memberId: matched.memberId,
      occurredAtServer: now,
    };
    txn.set(db.collection(`rooms/${roomId}/audit`).doc(), audit);

    return {
      ok: true,
      accepted: {
        roomId: asRoomId(roomId),
        memberId: matched.memberId,
        capability: matched.capability,
        recoveryCode,
      },
    };
  });
}
