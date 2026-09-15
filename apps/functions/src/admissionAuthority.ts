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
  parseAuthorityRecord,
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
import { eatTheReichTemplate, type EatTheReichState } from "@digitable/template-eat-the-reich";

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
  roomRevision: number,
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

  return { roomId: asRoomId(roomId), memberId, capability, recoveryCode, roomRevision };
}

/**
 * Writes a newly-created seat's own initial isolated projection, mirroring
 * `createRoomAuthority.ts`'s `projections/gm` write for the room's creator.
 * Without this, a newly admitted player (or a GM claimed via this file's
 * legacy `claimSeat` "create" path, distinct from `createRoom`'s atomic GM
 * provisioning) has no projection document to read at all until some
 * command runs on their behalf — but every screen's first render reads its
 * own projection before any command can be dispatched, so a player could
 * never get past joining (documented as a known, deferred residual in
 * `createRoomAuthority.ts`'s own comment on its `projections/gm` write;
 * confirmed live and fixed here rather than deferred further).
 *
 * `viewerId` is the reserved `"gm"`/`"table"` literal for those two
 * capabilities (never a real member ID — see `useRoomProjection.ts`'s
 * client-side counterpart of this same convention) and the real `memberId`
 * for a player, matching every other reader/writer of this collection.
 */
/**
 * Re-reads `authority/current` with the full, strict `AuthorityRecord`
 * parse (validating the complete `EatTheReichState`, not just the narrow
 * admission-relevant fields `resolveRoomContext` uses for its decision) —
 * needed only on the create-seat path, right before `writeInitialProjection`
 * computes a real `project()` output. Kept deliberately separate from
 * `resolveRoomContext`'s own parse: coupling every admission *decision* to
 * full template-state validity broke every existing admission test whose
 * fixtures build a minimal admission-only authority document (this was
 * caught live during board task A08's verification, not by any unit test —
 * the emulator suite went from 106/106 to 58/86 the moment the two parses
 * were merged into one). Firestore transactions cache reads by reference,
 * so this is the same already-fetched document, not a second round trip.
 */
async function readFullState(
  txn: Transaction,
  authorityRef: DocumentReference,
): Promise<EatTheReichState> {
  const snap = await txn.get(authorityRef);
  return parseAuthorityRecord(snap.data(), eatTheReichTemplate).state;
}

function writeInitialProjection(
  txn: Transaction,
  db: Firestore,
  roomId: string,
  state: EatTheReichState,
  roomRevision: number,
  memberId: MemberId,
  capability: Capability,
): void {
  const manifest = eatTheReichTemplate.manifest;
  const viewerId = capability === "gm" || capability === "table" ? capability : memberId;
  txn.set(db.doc(`rooms/${roomId}/projections/${viewerId}`), {
    platformVersion: "0.0.0",
    templateId: manifest.templateId,
    templateVersion: manifest.templateVersion,
    schemaVersion: manifest.currentSchemaVersion,
    viewerId,
    // The room's live revision at the moment this seat was created, not 0
    // — unlike createRoomAuthority.ts's projections/gm write (genuinely
    // the room's first-ever write), a player can join well after other
    // commands have already run (board task A07 live verification: a
    // scene was already loaded before the first player joined).
    roomRevision,
    view: eatTheReichTemplate.project(state, { roomId: asRoomId(roomId), viewerId, capability }),
  });
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
          roomRevision: context.authority.roomRevision,
        },
      };
    }

    // Must happen before any write below — Firestore transactions require
    // every read to complete before the first write (board task A08 live
    // verification: this exact ordering violation was caught only by the
    // real emulator suite, not by any unit test, and surfaced as "Firestore
    // transactions require all reads to be executed before all writes").
    const fullState = await readFullState(txn, context.authorityRef);

    const accepted = createSeat(
      txn,
      db,
      context.roomId,
      uid,
      decision.capability,
      input.displayName,
      credential,
      new Date().toISOString(),
      context.authority.roomRevision,
    );
    txn.update(
      context.authorityRef,
      decision.capability === "table"
        ? { tableSeatClaimed: true }
        : { participantCount: context.authority.participantCount + 1 },
    );
    writeInitialProjection(
      txn,
      db,
      context.roomId,
      fullState,
      context.authority.roomRevision,
      asMemberId(accepted.memberId),
      accepted.capability,
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
          roomRevision: context.authority.roomRevision,
        },
      };
    }

    // Must happen before any write below — see the identical comment in
    // `admitMember`.
    const fullState = await readFullState(txn, context.authorityRef);

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
      context.authority.roomRevision,
    );
    txn.update(context.authorityRef, {
      participantCount: context.authority.participantCount + 1,
      gmMemberId: accepted.memberId,
    });
    // The client-readable mirror was read above (it must exist), so this is a
    // field update on a complete document, never the creation of a partial one.
    txn.update(context.metaRef, { gmMemberId: accepted.memberId, updatedAtServer: now });
    writeInitialProjection(
      txn,
      db,
      context.roomId,
      fullState,
      context.authority.roomRevision,
      asMemberId(accepted.memberId),
      "gm",
    );
    return { ok: true, accepted };
  });
}
