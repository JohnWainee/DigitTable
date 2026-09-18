import type { Capability, RoomAdmissionAccepted, RoomId } from "@digitable/contracts";

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
    recoveryCode: accepted.recoveryCode,
    displayName,
    sessionName,
  };
}

export function readOwnershipRecord(): LocalOwnershipRecord | null {
  try {
    const raw = window.localStorage.getItem(OWNERSHIP_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocalOwnershipRecord) : null;
  } catch {
    return null;
  }
}

export function writeOwnershipRecord(record: LocalOwnershipRecord): void {
  try {
    window.localStorage.setItem(OWNERSHIP_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage unavailable (private browsing, quota) — resume simply won't be offered.
  }
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
    const minted = globalThis.crypto.randomUUID();
    window.sessionStorage.setItem(CREATE_REQUEST_ID_KEY, minted);
    return minted;
  } catch {
    return globalThis.crypto.randomUUID();
  }
}

export function clearCreateRequestId(): void {
  try {
    window.sessionStorage.removeItem(CREATE_REQUEST_ID_KEY);
  } catch {
    // ignore
  }
}
