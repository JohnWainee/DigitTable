import {
  asRoomId,
  type Capability,
  type RecoverSeatAccepted,
  type RoomAdmissionAccepted,
  type RoomId,
} from "@digitable/contracts";
import { newUuid } from "../shared/uuid.js";

const OWNERSHIP_STORAGE_KEY = "digitable.etr.ownership.v2";
const CREATE_REQUEST_ID_KEY = "digitable.etr.createRequestId.v1";

/**
 * C06: matches `@digitable/contracts`'s `SessionOwnershipRecord` field for
 * field, plus two client-only convenience fields (`displayName`/
 * `sessionName`) the real contract deliberately omits (A02: it is not sent
 * anywhere, so it does not need to be — see `session.ts`'s
 * `ownershipFromAccepted`). Kept as a local superset rather than a second
 * storage key so a resume card can say who/where without an extra
 * projection fetch just to render that one line.
 */
export interface LocalOwnershipRecord {
  readonly roomId: RoomId;
  readonly roomCode: string;
  readonly memberId: string;
  readonly capability: Capability;
  readonly recoveryCode: string | null;
  readonly displayName: string;
  readonly sessionName: string;
}

export function ownershipFromAcceptedWithNames(
  accepted: RoomAdmissionAccepted,
  displayName: string,
  sessionName: string,
): LocalOwnershipRecord {
  return {
    roomId: accepted.roomId,
    roomCode: accepted.roomCode,
    memberId: accepted.memberId,
    capability: accepted.capability,
    // Recovery credentials are display-once secrets. Persisting them would
    // turn any script or later user of this browser into a seat takeover.
    recoveryCode: null,
    displayName,
    sessionName,
  };
}

export function readOwnershipRecord(): LocalOwnershipRecord | null {
  try {
    const raw = window.localStorage.getItem(OWNERSHIP_STORAGE_KEY);
    if (!raw) return null;
    const record = JSON.parse(raw) as LocalOwnershipRecord;
    if (record.recoveryCode !== null) {
      const scrubbed = { ...record, recoveryCode: null };
      window.localStorage.setItem(OWNERSHIP_STORAGE_KEY, JSON.stringify(scrubbed));
      return scrubbed;
    }
    return record;
  } catch {
    return null;
  }
}

export function writeOwnershipRecord(record: LocalOwnershipRecord): void {
  try {
    window.localStorage.setItem(
      OWNERSHIP_STORAGE_KEY,
      JSON.stringify({ ...record, recoveryCode: null }),
    );
  } catch {
    // Storage unavailable (private browsing, quota) — resume simply won't be offered.
  }
}

export function ownershipFromRecoverySeat(
  accepted: RecoverSeatAccepted,
  roomCode: string,
  displayName: string,
  sessionName: string,
): LocalOwnershipRecord {
  return {
    roomId: asRoomId(accepted.roomId),
    roomCode,
    memberId: accepted.memberId,
    capability: accepted.capability,
    recoveryCode: null,
    displayName,
    sessionName,
  };
}

export function clearOwnershipRecord(): void {
  try {
    window.localStorage.removeItem(OWNERSHIP_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** One `requestId` per pending create-session form instance (docs/ETR_SESSION_FLOW.md section 3, step 1). */
export function getOrMintCreateRequestId(): string {
  try {
    const existing = window.sessionStorage.getItem(CREATE_REQUEST_ID_KEY);
    if (existing) return existing;
    const minted = newUuid();
    window.sessionStorage.setItem(CREATE_REQUEST_ID_KEY, minted);
    return minted;
  } catch {
    return newUuid();
  }
}

export function clearCreateRequestId(): void {
  try {
    window.sessionStorage.removeItem(CREATE_REQUEST_ID_KEY);
  } catch {
    // ignore
  }
}
