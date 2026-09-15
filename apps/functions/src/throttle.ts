import type { Firestore } from "firebase-admin/firestore";
import {
  parseAdmissionThrottleDocument,
  type AdmissionThrottleDocument,
} from "@digitable/contracts";

/**
 * Fixed-window per-IP/per-room-code admission rate limit. `docs/PHASE_2_PLAN.md`
 * names per-IP/per-room throttling as part of PR 3's join flow, and the
 * independent review requires it to be meaningful — it must bound attempts,
 * not merely record them.
 *
 * A fixed window (not a token bucket or sliding log) is deliberately the
 * simplest structure that is still correct under Firestore's transaction
 * retry semantics: one document, one read-modify-write, and no cleanup job
 * for expired entries (a stale window is simply reset the next time it is
 * read after expiry).
 */
export const ADMISSION_THROTTLE_WINDOW_MS = 60_000;
export const ADMISSION_THROTTLE_MAX_ATTEMPTS = 20;

export interface ThrottleDecision {
  readonly allowed: boolean;
  /** Attempts left in the window after this one (0 when denied). */
  readonly remaining: number;
  /** The document to persist, or `null` when the request is denied and nothing changes. */
  readonly next: AdmissionThrottleDocument | null;
}

/**
 * Pure window arithmetic, separated from Firestore so the boundary
 * conditions (exactly at the cap, exactly at window expiry) are unit-tested
 * without an emulator.
 */
export function decideThrottle(
  existing: AdmissionThrottleDocument | null,
  now: number,
): ThrottleDecision {
  if (existing === null || now - existing.windowStartMs >= ADMISSION_THROTTLE_WINDOW_MS) {
    return {
      allowed: true,
      remaining: ADMISSION_THROTTLE_MAX_ATTEMPTS - 1,
      next: { windowStartMs: now, count: 1 },
    };
  }
  if (existing.count >= ADMISSION_THROTTLE_MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, next: null };
  }
  const count = existing.count + 1;
  return {
    allowed: true,
    remaining: ADMISSION_THROTTLE_MAX_ATTEMPTS - count,
    next: { windowStartMs: existing.windowStartMs, count },
  };
}

/**
 * Makes an untrusted string safe as a single Firestore document-ID segment:
 * no `/` (a path separator), not solely `.`/`..`, and not the reserved
 * `__name__` form. The room code is bounds-checked upstream
 * (`parseAdmitMemberInput`), but its characters are not otherwise
 * constrained; the IP comes from request metadata. A malformed value must
 * never become an invalid path that throws mid-request (which would fail
 * open by skipping the throttle).
 */
export function throttleSegment(value: string): string {
  const flattened = value.replace(/\//g, "_");
  if (flattened.length === 0) return "empty";
  if (/^\.{1,2}$/.test(flattened) || /^__.*__$/.test(flattened)) return `x_${flattened}`;
  return flattened;
}

/** Service-only path; explicitly denied to clients in `firestore.rules`. */
export function throttleDocumentPath(roomCode: string, ip: string): string {
  return `admissionThrottle/${throttleSegment(roomCode)}/byIp/${throttleSegment(ip)}`;
}

/**
 * Checks and atomically consumes one admission attempt for `(roomCode, ip)`.
 * Keyed by the room *code* the caller submitted rather than a resolved room
 * ID, so throttling also bounds guessing against codes that resolve to no
 * room (docs/ARCHITECTURE.md section 11, "Room-code guessing"). Runs in its
 * own transaction, before the admission transaction, so a throttled request
 * never reads `authority/current` or a secret hash at all.
 */
export async function checkAndConsumeAdmissionThrottle(
  db: Firestore,
  roomCode: string,
  ip: string,
  now: number,
): Promise<ThrottleDecision> {
  const ref = db.doc(throttleDocumentPath(roomCode, ip));
  return db.runTransaction(async (txn) => {
    const snapshot = await txn.get(ref);
    // A malformed counter fails closed via RoomDataError (→ ROOM_DATA_INVALID at
    // the callable), never as a fresh window.
    const existing = snapshot.exists ? parseAdmissionThrottleDocument(snapshot.data()) : null;
    const decision = decideThrottle(existing, now);
    if (decision.next !== null) txn.set(ref, decision.next);
    return decision;
  });
}
