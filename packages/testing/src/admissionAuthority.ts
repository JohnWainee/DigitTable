import type { RulesTestContext } from "@firebase/rules-unit-testing";
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
  type AdmissionAccepted,
  type AdmissionStatus,
  type AdmitMemberInput,
  type Capability,
  type ClaimSeatInput,
  type MemberBindingDocument,
  type MemberId,
  type RecoveryCredentialDocument,
  type RoomAdmissionSecretDocument,
  type RoomCodeDocument,
  type RoomMemberDocument,
  type StableErrorCode,
  type UidBindingDocument,
} from "@digitable/contracts";

/**
 * Derived from `RulesTestContext.firestore()`'s own return type rather than
 * naming the underlying `firebase.firestore.*` compat namespace directly —
 * that namespace is only merged into scope by an import elsewhere
 * (`@firebase/rules-unit-testing`'s own type declarations), which makes it
 * fragile to reference by name here. This is the trusted-context Firestore
 * handle this module runs against in every test call site.
 */
export type Firestore = ReturnType<RulesTestContext["firestore"]>;
type Transaction = Parameters<Parameters<Firestore["runTransaction"]>[0]>[0];
type DocumentReference = ReturnType<Firestore["doc"]>;

/**
 * The subset of `authority/current` the admission authority reads and
 * writes. Deliberately excludes `state` (the template's `TState`) — admission
 * never reads or writes template state, only the platform-owned lifecycle
 * and capacity fields (docs/ARCHITECTURE.md section 8).
 */
interface AuthorityAdmissionFields {
  readonly roomStatus: "active" | "archived";
  readonly admissionStatus: AdmissionStatus;
  readonly participantCount: number;
  readonly tableSeatClaimed: boolean;
  readonly gmMemberId: string | null;
}

export type AdmissionResult =
  | { readonly ok: true; readonly accepted: AdmissionAccepted }
  | { readonly ok: false; readonly code: StableErrorCode; readonly message: string };

function denied(code: StableErrorCode, message: string): AdmissionResult {
  return { ok: false, code, message };
}

/** Defensive defaults, not runtime validation: these are our own service-written documents. */
function readAuthorityAdmissionFields(
  data: Record<string, unknown> | undefined,
): AuthorityAdmissionFields | null {
  if (data === undefined) return null;
  return {
    roomStatus: data.roomStatus === "archived" ? "archived" : "active",
    admissionStatus: data.admissionStatus === "closed" ? "closed" : "open",
    participantCount: typeof data.participantCount === "number" ? data.participantCount : 0,
    tableSeatClaimed: data.tableSeatClaimed === true,
    gmMemberId: typeof data.gmMemberId === "string" ? data.gmMemberId : null,
  };
}

function readExistingBinding(
  data: Record<string, unknown> | undefined,
): { readonly memberId: MemberId; readonly capability: Capability } | null {
  if (data === undefined) return null;
  const binding = data as unknown as UidBindingDocument;
  return { memberId: asMemberId(binding.memberId), capability: binding.capability };
}

async function resolveRoomId(
  txn: Transaction,
  db: Firestore,
  roomCode: string,
): Promise<string | null> {
  const snapshot = await txn.get(db.doc(`roomCodes/${roomCode}`));
  if (!snapshot.exists) return null;
  return (snapshot.data() as RoomCodeDocument).roomId;
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
  const secretRef = db.doc(`rooms/${roomId}/admission/secret`);
  const uidBindingRef = db.doc(`rooms/${roomId}/uidBindings/${uid}`);

  const [authoritySnap, secretSnap, uidBindingSnap] = await Promise.all([
    txn.get(authorityRef),
    txn.get(secretRef),
    txn.get(uidBindingRef),
  ]);

  const authority = readAuthorityAdmissionFields(authoritySnap.data());
  if (authority === null) {
    return { deniedResult: denied("ROOM_NOT_FOUND", "The room code was not recognized.") };
  }

  const secret = secretSnap.data() as RoomAdmissionSecretDocument | undefined;
  const passphraseValid = secret !== undefined ? await verifySecret(passphrase, secret) : false;

  return {
    roomId,
    authorityRef,
    authority,
    snapshot: {
      roomStatus: authority.roomStatus,
      admissionStatus: authority.admissionStatus,
      participantCount: authority.participantCount,
      tableSeatClaimed: authority.tableSeatClaimed,
      gmMemberId: authority.gmMemberId === null ? null : asMemberId(authority.gmMemberId),
      passphraseValid,
      existingBinding: readExistingBinding(uidBindingSnap.data()),
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

/**
 * Resolves an `AdmitMember` join request inside one Firestore transaction —
 * the shape a real trusted Function (Phase 2 PR 4+) will host, exercised
 * here against the emulator's trusted context exactly as Phase 2 PR 2's
 * rules were exercised without a real Function
 * (docs/PHASE_2_PLAN.md: "rules are tested by direct emulator reads/writes
 * standing in for a trusted service identity where needed").
 */
export async function admitMember(
  db: Firestore,
  uid: string,
  input: AdmitMemberInput,
): Promise<AdmissionResult> {
  return db.runTransaction(async (txn): Promise<AdmissionResult> => {
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
export async function claimSeat(
  db: Firestore,
  uid: string,
  input: ClaimSeatInput,
): Promise<AdmissionResult> {
  return db.runTransaction(async (txn): Promise<AdmissionResult> => {
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
      {
        merge: true,
      },
    );
    return { ok: true, accepted };
  });
}
