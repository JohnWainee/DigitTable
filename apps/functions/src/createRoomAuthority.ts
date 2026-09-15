import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import {
  decideCreateRoom,
  generateRecoveryCode,
  generateRoomCode,
  hashSecret,
  type HashedSecret,
} from "@digitable/engine";
import { eatTheReichTemplate } from "@digitable/template-eat-the-reich";
import {
  RoomDataError,
  asMemberId,
  asRoomId,
  parseCreateRoomReceiptDocument,
  type CreateRoomAccepted,
  type CreateRoomInput,
  type MemberBindingDocument,
  type MemberId,
  type RecoveryCredentialDocument,
  type RoomId,
  type RoomMemberDocument,
  type RoomMetaDocument,
  type StableErrorCode,
  type UidBindingDocument,
} from "@digitable/contracts";

export type CreateRoomResult =
  | { readonly ok: true; readonly accepted: CreateRoomAccepted }
  | { readonly ok: false; readonly code: StableErrorCode; readonly message: string };

function denied(code: StableErrorCode, message: string): CreateRoomResult {
  return { ok: false, code, message };
}

const ROOM_DATA_INVALID = denied(
  "ROOM_DATA_INVALID",
  "A stored record could not be verified while creating the room.",
);

/** Bounded so a pathological run of collisions fails loudly instead of looping forever; see `roomCode.ts`'s entropy note. */
const MAX_ROOM_CODE_ATTEMPTS = 5;

/** Everything the transaction needs, minted once per invocation (see the class doc below for why). */
interface CreateRoomCredentials {
  readonly gmMemberId: MemberId;
  readonly recoveryCode: string;
  readonly hashedRecovery: HashedSecret;
  readonly tableCode: string;
  readonly hashedTableCode: HashedSecret;
  readonly hashedPassphrase: HashedSecret;
}

/**
 * Mints every slow-hashed / random value `createRoom` needs, *outside* the
 * transaction and exactly once per callable invocation — the same
 * discipline `admissionAuthority.ts`'s `mintSeatCredential` uses (Phase 2
 * PR 3 second pass, C10): PBKDF2 is slow, so it must never be redone on a
 * Firestore transaction retry and must never run while a lock is held. Here
 * there are three slow hashes (the creator's passphrase, the freshly minted
 * table code, and the freshly minted recovery code) instead of one; all
 * three still happen once, before `db.runTransaction` is ever called, and
 * the same `CreateRoomCredentials` object is reused across any internal SDK
 * retries of that transaction body.
 */
async function mintCreateRoomCredentials(passphrase: string): Promise<CreateRoomCredentials> {
  const recoveryCode = generateRecoveryCode();
  const tableCode = generateRecoveryCode();
  const [hashedRecovery, hashedTableCode, hashedPassphrase] = await Promise.all([
    hashSecret(recoveryCode),
    hashSecret(tableCode),
    hashSecret(passphrase),
  ]);
  return {
    gmMemberId: asMemberId(crypto.randomUUID()),
    recoveryCode,
    hashedRecovery,
    tableCode,
    hashedTableCode,
    hashedPassphrase,
  };
}

/** `false` for genuinely unset room codes; throws `RoomDataError` for a malformed record. `roomCodes/{code}` is a bare `{ roomId }`, so existence alone is enough to know "taken". */
async function roomCodeIsTaken(txn: Transaction, ref: DocumentReference): Promise<boolean> {
  const snapshot = await txn.get(ref);
  return snapshot.exists;
}

/**
 * Finds a collision-free room code inside the transaction (so the
 * check-then-reserve is atomic with every other concurrent `createRoom`),
 * bounded to `MAX_ROOM_CODE_ATTEMPTS` regenerations. `generateCode` is
 * injectable so emulator tests can force a real collision deterministically
 * without waiting on astronomically unlikely real-random collisions.
 */
async function reserveRoomCode(
  txn: Transaction,
  db: Firestore,
  generateCode: () => string,
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
    const candidate = generateCode();
    const taken = await roomCodeIsTaken(txn, db.doc(`roomCodes/${candidate}`));
    if (!taken) return candidate;
  }
  return null;
}

/** Runs one createRoom transaction, mapping a fail-closed data error to a stable denial — same shape as `admissionAuthority.ts`'s `runAdmissionTransaction`. */
async function runCreateRoomTransaction(
  db: Firestore,
  body: (txn: Transaction) => Promise<CreateRoomResult>,
): Promise<CreateRoomResult> {
  try {
    return await db.runTransaction(body);
  } catch (error) {
    if (error instanceof RoomDataError) return ROOM_DATA_INVALID;
    throw error;
  }
}

/**
 * Provisions a brand-new room and its creator-bound GM seat in one
 * transaction: the room-code index, the room passphrase hash, the separate
 * table-code hash, `authority/current` (ETR preselected, `participantCount:
 * 1` for the seated GM), its client-readable `meta/current` mirror, the
 * GM's binding/uidBinding/member/recovery documents, and the GM's own
 * initial isolated projection — the only viewer that exists yet. Idempotent
 * on `input.requestId`: a `createRoomReceipts/{requestId}` document is
 * written in the same transaction as everything else, so a retried or
 * double-clicked request with the same `requestId` can never provision a
 * second room; it replays the first attempt's outcome instead (recovery
 * code and table code are `null` on replay, since neither is ever stored in
 * plaintext for the receipt to re-expose — board task A03).
 */
export async function createRoom(
  db: Firestore,
  uid: string,
  input: CreateRoomInput,
  generateCode: () => string = generateRoomCode,
): Promise<CreateRoomResult> {
  const credentials = await mintCreateRoomCredentials(input.passphrase);
  const now = new Date().toISOString();

  return runCreateRoomTransaction(db, async (txn) => {
    const receiptRef = db.doc(`createRoomReceipts/${input.requestId}`);
    const receiptSnap = await txn.get(receiptRef);
    const existingReceipt = receiptSnap.exists
      ? parseCreateRoomReceiptDocument(receiptSnap.data())
      : null;

    const decision = decideCreateRoom(existingReceipt);
    if (decision.outcome === "replay") {
      return {
        ok: true,
        accepted: {
          ok: true,
          roomId: decision.receipt.roomId,
          roomCode: decision.receipt.roomCode,
          memberId: decision.receipt.memberId,
          capability: "gm",
          recoveryCode: null,
          tableCode: null,
          roomRevision: 0,
        },
      };
    }

    const roomCode = await reserveRoomCode(txn, db, generateCode);
    if (roomCode === null) {
      return denied(
        "ROOM_CREATION_FAILED",
        "Could not generate a unique room code. Please try again.",
      );
    }
    const roomId: RoomId = asRoomId(crypto.randomUUID());
    const {
      gmMemberId,
      recoveryCode,
      hashedRecovery,
      tableCode,
      hashedTableCode,
      hashedPassphrase,
    } = credentials;

    const initialState = eatTheReichTemplate.initialState({
      roomId,
      gmMemberId,
      // No player has joined yet; only the GM seat exists at creation
      // (see `templates/eat-the-reich/src/engine.ts`'s `initialState`).
      memberIds: [],
    });
    const manifest = eatTheReichTemplate.manifest;

    txn.set(receiptRef, { roomId, roomCode, memberId: gmMemberId });
    txn.set(db.doc(`roomCodes/${roomCode}`), { roomId });
    txn.set(db.doc(`rooms/${roomId}/admission/secret`), hashedPassphrase);
    txn.set(db.doc(`rooms/${roomId}/admission/tableSecret`), hashedTableCode);
    txn.set(db.doc(`rooms/${roomId}/authority/current`), {
      platformVersion: "0.0.0",
      templateId: manifest.templateId,
      templateVersion: manifest.templateVersion,
      schemaVersion: manifest.currentSchemaVersion,
      roomRevision: 0,
      nextSequence: 1,
      roomStatus: "active",
      admissionStatus: "open",
      participantCount: 1,
      tableSeatClaimed: false,
      gmMemberId,
      state: initialState,
    });
    const meta: RoomMetaDocument = {
      platformVersion: "0.0.0",
      templateId: manifest.templateId,
      templateVersion: manifest.templateVersion,
      schemaVersion: manifest.currentSchemaVersion,
      roomStatus: "active",
      gmMemberId,
      createdAtServer: now,
      updatedAtServer: now,
    };
    txn.set(db.doc(`rooms/${roomId}/meta/current`), meta);

    const binding: MemberBindingDocument = { memberId: gmMemberId, uid, capability: "gm" };
    const uidBinding: UidBindingDocument = { memberId: gmMemberId, capability: "gm" };
    const member: RoomMemberDocument = {
      memberId: gmMemberId,
      capability: "gm",
      displayName: input.creatorDisplayName,
      joinedAtServer: now,
      lastSeenAtServer: now,
    };
    const recovery: RecoveryCredentialDocument = { memberId: gmMemberId, ...hashedRecovery };
    txn.set(db.doc(`rooms/${roomId}/bindings/${gmMemberId}`), binding);
    txn.set(db.doc(`rooms/${roomId}/uidBindings/${uid}`), uidBinding);
    txn.set(db.doc(`rooms/${roomId}/members/${gmMemberId}`), member);
    txn.set(db.doc(`rooms/${roomId}/recovery/${gmMemberId}`), recovery);

    // The GM's own initial isolated projection (board task A03): the only
    // viewer that exists at creation. A player/table projection is written
    // once that seat is actually claimed (board task A04's job, matching
    // `admissionAuthority.ts`'s admit/claim paths, which do not yet write
    // any projection either — see docs/reviews for that residual).
    txn.set(db.doc(`rooms/${roomId}/projections/gm`), {
      platformVersion: "0.0.0",
      templateId: manifest.templateId,
      templateVersion: manifest.templateVersion,
      schemaVersion: manifest.currentSchemaVersion,
      viewerId: gmMemberId,
      roomRevision: 0,
      view: eatTheReichTemplate.project(initialState, {
        roomId,
        viewerId: gmMemberId,
        capability: "gm",
      }),
    });

    return {
      ok: true,
      accepted: {
        ok: true,
        roomId,
        roomCode,
        memberId: gmMemberId,
        capability: "gm",
        recoveryCode,
        tableCode,
        roomRevision: 0,
      },
    };
  });
}
