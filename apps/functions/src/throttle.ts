import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import {
  parseAdmissionThrottleDocument,
  type AdmissionThrottleDocument,
} from "@digitable/contracts";

/**
 * Fixed-window admission rate limits. `docs/PHASE_2_PLAN.md` names per-IP/
 * per-room throttling as part of PR 3's join flow, and the independent
 * reviews require it to be meaningful — it must bound attempts, not merely
 * record them. Three buckets, all consumed in one transaction before the
 * admission transaction (second pass, T1/C1/C6):
 *
 * - `code`: per (submitted room code, caller IP) — passphrase brute force
 *   against one code.
 * - `ip`: per caller IP across every code — room-code enumeration from one
 *   address.
 * - `uid`: per verified anonymous UID — an unspoofable bound that holds even
 *   where the resolved IP is not trustworthy (residual R2); a scripted
 *   attacker must mint a fresh anonymous identity every `uid` cap attempts,
 *   which App Check enforcement later gates.
 *
 * A fixed window (not a token bucket or sliding log) is deliberately the
 * simplest structure that is still correct under Firestore's transaction
 * retry semantics: one document per bucket, one read-modify-write each, no
 * cleanup job (a stale window is reset the next time it is read after
 * expiry; a TTL policy on `expiresAt` reclaims abandoned documents).
 */
export const ADMISSION_THROTTLE_WINDOW_MS = 60_000;

export const ADMISSION_THROTTLE_LIMITS = {
  code: 20,
  ip: 100,
  uid: 60,
} as const;

export type ThrottleBucket = keyof typeof ADMISSION_THROTTLE_LIMITS;

/** Kept for one extra window past expiry so an in-flight reset never races the TTL. */
const TTL_GRACE_MS = ADMISSION_THROTTLE_WINDOW_MS;

export interface ThrottleDecision {
  readonly allowed: boolean;
  /** The document to persist, or `null` when the request is denied and nothing changes. */
  readonly next: AdmissionThrottleDocument | null;
}

/**
 * Pure window arithmetic for one bucket, separated from Firestore so the
 * boundary conditions (exactly at the cap, exactly at window expiry) are
 * unit-tested without an emulator.
 */
export function decideThrottle(
  existing: AdmissionThrottleDocument | null,
  now: number,
  maxAttempts: number,
): ThrottleDecision {
  if (existing === null || now - existing.windowStartMs >= ADMISSION_THROTTLE_WINDOW_MS) {
    return { allowed: true, next: { windowStartMs: now, count: 1 } };
  }
  if (existing.count >= maxAttempts) {
    return { allowed: false, next: null };
  }
  return {
    allowed: true,
    next: { windowStartMs: existing.windowStartMs, count: existing.count + 1 },
  };
}

/**
 * Fixed-length, path-safe document ID for an untrusted value: SHA-256 hex.
 * No submitted room code or caller address is ever stored as a document ID,
 * an oversized header cannot exceed Firestore's ID limit, and no value can
 * form an invalid path segment (second pass, T5).
 */
export function throttleKey(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export interface ThrottleSubject {
  readonly roomCode: string;
  readonly ip: string;
  readonly uid: string;
}

/** Service-only paths; the whole `admissionThrottle` tree is denied to clients in `firestore.rules`. */
export function throttleDocumentPaths(
  subject: ThrottleSubject,
): Readonly<Record<ThrottleBucket, string>> {
  const ip = throttleKey(subject.ip);
  return {
    code: `admissionThrottle/code-${throttleKey(subject.roomCode)}/byIp/${ip}`,
    ip: `admissionThrottle/ip-${ip}/scope/all`,
    uid: `admissionThrottle/uid-${throttleKey(subject.uid)}/scope/all`,
  };
}

export interface ThrottleResult<TBucket extends string = ThrottleBucket> {
  readonly allowed: boolean;
  /** Which bucket denied the request, when one did. */
  readonly limitedBy: TBucket | null;
}

const BUCKETS: readonly ThrottleBucket[] = ["code", "ip", "uid"];

/**
 * Checks and atomically consumes one admission attempt across all three
 * buckets. Denied by any bucket → nothing is written (the attempt is not
 * consumed elsewhere). Runs in its own transaction, before the admission
 * transaction, so a throttled request never reads `authority/current` or a
 * secret hash at all.
 */
export async function checkAndConsumeAdmissionThrottle(
  db: Firestore,
  subject: ThrottleSubject,
  now: number,
): Promise<ThrottleResult> {
  const paths = throttleDocumentPaths(subject);
  const refs = BUCKETS.map((bucket) => db.doc(paths[bucket]));
  return db.runTransaction(async (txn) => {
    const snapshots = await txn.getAll(...refs);
    const decisions = BUCKETS.map((bucket, index) => {
      const snapshot = snapshots[index];
      // A malformed counter fails closed via RoomDataError (→ ROOM_DATA_INVALID
      // at the callable), never as a fresh window.
      const existing =
        snapshot !== undefined && snapshot.exists
          ? parseAdmissionThrottleDocument(snapshot.data())
          : null;
      return { bucket, decision: decideThrottle(existing, now, ADMISSION_THROTTLE_LIMITS[bucket]) };
    });
    const denied = decisions.find(({ decision }) => !decision.allowed);
    if (denied !== undefined) {
      return { allowed: false, limitedBy: denied.bucket };
    }
    decisions.forEach(({ decision }, index) => {
      const ref = refs[index];
      if (decision.next === null || ref === undefined) return;
      txn.set(ref, {
        ...decision.next,
        expiresAt: Timestamp.fromMillis(
          decision.next.windowStartMs + ADMISSION_THROTTLE_WINDOW_MS + TTL_GRACE_MS,
        ),
      });
    });
    return { allowed: true, limitedBy: null };
  });
}

/**
 * Board task A03: `createRoom` has no room code yet (it is about to mint
 * one), so it cannot use the `code` bucket above — only `uid` (unspoofable)
 * and `ip` (best-effort, same caveat as admission's `clientIpFrom`). Kept in
 * its own `createRoomThrottle` tree, not `admissionThrottle`, so the two
 * limits are tuned and reasoned about independently; creation is rarer than
 * joining, so its limits are tighter.
 */
export const CREATE_ROOM_THROTTLE_LIMITS = {
  uid: 10,
  ip: 30,
} as const;

export type CreateRoomThrottleBucket = keyof typeof CREATE_ROOM_THROTTLE_LIMITS;

const CREATE_ROOM_BUCKETS: readonly CreateRoomThrottleBucket[] = ["uid", "ip"];

export interface CreateRoomThrottleSubject {
  readonly uid: string;
  readonly ip: string;
}

/** Service-only paths; the whole `createRoomThrottle` tree is denied to clients in `firestore.rules`. */
export function createRoomThrottleDocumentPaths(
  subject: CreateRoomThrottleSubject,
): Readonly<Record<CreateRoomThrottleBucket, string>> {
  return {
    uid: `createRoomThrottle/uid-${throttleKey(subject.uid)}/scope/all`,
    ip: `createRoomThrottle/ip-${throttleKey(subject.ip)}/scope/all`,
  };
}

/** Same shape and transaction discipline as `checkAndConsumeAdmissionThrottle`, over the `createRoom`-only bucket set. */
export async function checkAndConsumeCreateRoomThrottle(
  db: Firestore,
  subject: CreateRoomThrottleSubject,
  now: number,
): Promise<ThrottleResult> {
  const paths = createRoomThrottleDocumentPaths(subject);
  const refs = CREATE_ROOM_BUCKETS.map((bucket) => db.doc(paths[bucket]));
  return db.runTransaction(async (txn) => {
    const snapshots = await txn.getAll(...refs);
    const decisions = CREATE_ROOM_BUCKETS.map((bucket, index) => {
      const snapshot = snapshots[index];
      const existing =
        snapshot !== undefined && snapshot.exists
          ? parseAdmissionThrottleDocument(snapshot.data())
          : null;
      return {
        bucket,
        decision: decideThrottle(existing, now, CREATE_ROOM_THROTTLE_LIMITS[bucket]),
      };
    });
    const denied = decisions.find(({ decision }) => !decision.allowed);
    if (denied !== undefined) {
      return { allowed: false, limitedBy: denied.bucket };
    }
    decisions.forEach(({ decision }, index) => {
      const ref = refs[index];
      if (decision.next === null || ref === undefined) return;
      txn.set(ref, {
        ...decision.next,
        expiresAt: Timestamp.fromMillis(
          decision.next.windowStartMs + ADMISSION_THROTTLE_WINDOW_MS + TTL_GRACE_MS,
        ),
      });
    });
    return { allowed: true, limitedBy: null };
  });
}

/**
 * Board task A06: `recoverSeat` redemption, rate-limited "per room and
 * source IP" with a brief lockout after a small number of failures
 * (docs/ARCHITECTURE.md section 8) — tighter than admission's throttle
 * since a successful redemption is rare and a burst of attempts against
 * one room is the recovery-code brute-force threat this exists to bound.
 * Kept in its own `recoveryThrottle` tree, independent of admission's and
 * createRoom's, so each is tuned and reasoned about on its own.
 */
export const RECOVERY_THROTTLE_LIMITS = {
  roomIp: 10,
  ip: 30,
} as const;

export type RecoveryThrottleBucket = keyof typeof RECOVERY_THROTTLE_LIMITS;

const RECOVERY_BUCKETS: readonly RecoveryThrottleBucket[] = ["roomIp", "ip"];

export interface RecoveryThrottleSubject {
  readonly roomCode: string;
  readonly ip: string;
}

/** Service-only paths; the whole `recoveryThrottle` tree is denied to clients in `firestore.rules`. */
export function recoveryThrottleDocumentPaths(
  subject: RecoveryThrottleSubject,
): Readonly<Record<RecoveryThrottleBucket, string>> {
  const ip = throttleKey(subject.ip);
  return {
    roomIp: `recoveryThrottle/room-${throttleKey(subject.roomCode)}/byIp/${ip}`,
    ip: `recoveryThrottle/ip-${ip}/scope/all`,
  };
}

/** Same shape and transaction discipline as `checkAndConsumeCreateRoomThrottle`, over the `recoverSeat`-only bucket set. */
export async function checkAndConsumeRecoveryThrottle(
  db: Firestore,
  subject: RecoveryThrottleSubject,
  now: number,
): Promise<ThrottleResult<RecoveryThrottleBucket>> {
  const paths = recoveryThrottleDocumentPaths(subject);
  const refs = RECOVERY_BUCKETS.map((bucket) => db.doc(paths[bucket]));
  return db.runTransaction(async (txn) => {
    const snapshots = await txn.getAll(...refs);
    const decisions = RECOVERY_BUCKETS.map((bucket, index) => {
      const snapshot = snapshots[index];
      const existing =
        snapshot !== undefined && snapshot.exists
          ? parseAdmissionThrottleDocument(snapshot.data())
          : null;
      return {
        bucket,
        decision: decideThrottle(existing, now, RECOVERY_THROTTLE_LIMITS[bucket]),
      };
    });
    const denied = decisions.find(({ decision }) => !decision.allowed);
    if (denied !== undefined) {
      return { allowed: false, limitedBy: denied.bucket };
    }
    decisions.forEach(({ decision }, index) => {
      const ref = refs[index];
      if (decision.next === null || ref === undefined) return;
      txn.set(ref, {
        ...decision.next,
        expiresAt: Timestamp.fromMillis(
          decision.next.windowStartMs + ADMISSION_THROTTLE_WINDOW_MS + TTL_GRACE_MS,
        ),
      });
    });
    return { allowed: true, limitedBy: null };
  });
}
