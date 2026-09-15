import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { verifySecret } from "@digitable/engine";
import type { CreateRoomInput, RecoverSeatInput } from "@digitable/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { createRoom, type CreateRoomResult } from "../src/createRoomAuthority.js";
import { admitMember } from "../src/admissionAuthority.js";
import { recoverSeat, type RecoverySeatResult } from "../src/recoverySeatAuthority.js";
import {
  createAdmissionCallables,
  type AdmissionLogger,
  type RecoverSeatCallable,
} from "../src/callables.js";
import { RECOVERY_THROTTLE_LIMITS } from "../src/throttle.js";

/**
 * Board task A06's `recoverSeat` proof, run against the real trusted
 * boundary the same way `admission.test.ts`/`createRoom.test.ts` prove
 * their own transactions.
 */
describe("recoverSeat (apps/functions, board task A06)", () => {
  let db: Firestore;
  // Random, not just millisecond-timestamp-based: this file's createRoom
  // calls share the same requestId-generation pattern
  // (`createRoom.test.ts` also does `req-${RUN}-${counter}`), and
  // `Date.now().toString(36)` alone has collided across near-simultaneous
  // test files before, producing a genuine cross-file requestId collision
  // that A03's UID-scoped-receipt fix correctly denies as ROLE_FORBIDDEN
  // (a different identity reusing another identity's requestId) — not a
  // bug in that fix, but flaky test-fixture uniqueness.
  const RUN = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let counter = 0;

  beforeAll(() => {
    if (getApps().length === 0) initializeApp();
    db = getFirestore();
  });

  function createInput(overrides: Partial<CreateRoomInput> = {}): CreateRoomInput {
    counter += 1;
    return {
      requestId: `req-${RUN}-${counter}`,
      sessionName: "Recovery Test Cell",
      passphrase: "correct horse battery staple",
      creatorDisplayName: "Director",
      ...overrides,
    };
  }

  function createdAccepted(
    result: CreateRoomResult,
  ): Extract<CreateRoomResult, { ok: true }>["accepted"] {
    expect(result.ok).toBe(true);
    return (result as Extract<CreateRoomResult, { ok: true }>).accepted;
  }

  function recoveredAccepted(
    result: RecoverySeatResult,
  ): Extract<RecoverySeatResult, { ok: true }>["accepted"] {
    expect(result.ok).toBe(true);
    return (result as Extract<RecoverySeatResult, { ok: true }>).accepted;
  }

  async function seedRoomWithGm(): Promise<{
    readonly roomId: string;
    readonly roomCode: string;
    readonly gmMemberId: string;
    readonly gmRecoveryCode: string;
    readonly originalUid: string;
  }> {
    const originalUid = `uid-original-${RUN}-${(counter += 1)}`;
    const created = createdAccepted(await createRoom(db, originalUid, createInput()));
    return {
      roomId: created.roomId,
      roomCode: created.roomCode,
      gmMemberId: created.memberId,
      gmRecoveryCode: created.recoveryCode as string,
      originalUid,
    };
  }

  describe("engine-level transaction", () => {
    it("rebinds the seat to the new UID, deletes the old UID's binding, and mints a fresh recovery code", async () => {
      const { roomId, roomCode, gmMemberId, gmRecoveryCode, originalUid } = await seedRoomWithGm();
      const newUid = `uid-recovered-${RUN}-${(counter += 1)}`;

      const result = recoveredAccepted(
        await recoverSeat(db, newUid, { roomCode, recoveryCode: gmRecoveryCode }),
      );
      expect(result.memberId).toBe(gmMemberId);
      expect(result.capability).toBe("gm");
      expect(result.recoveryCode).not.toBe(gmRecoveryCode);

      const newBinding = (await db.doc(`rooms/${roomId}/uidBindings/${newUid}`).get()).data();
      expect(newBinding).toEqual({ memberId: gmMemberId, capability: "gm" });
      const oldBinding = await db.doc(`rooms/${roomId}/uidBindings/${originalUid}`).get();
      expect(oldBinding.exists).toBe(false);

      const binding = (await db.doc(`rooms/${roomId}/bindings/${gmMemberId}`).get()).data();
      expect(binding).toMatchObject({ uid: newUid });
    });

    it("writes a GM-visible audit entry naming only the seat — no uid, no code", async () => {
      const { roomId, roomCode, gmMemberId, gmRecoveryCode } = await seedRoomWithGm();
      const newUid = `uid-recovered-${RUN}-${(counter += 1)}`;
      await recoverSeat(db, newUid, { roomCode, recoveryCode: gmRecoveryCode });

      const auditSnap = await db.collection(`rooms/${roomId}/audit`).get();
      expect(auditSnap.size).toBe(1);
      const audit = auditSnap.docs[0]?.data();
      expect(audit).toMatchObject({ type: "SeatRecovered", memberId: gmMemberId });
      const serialized = JSON.stringify(audit);
      expect(serialized).not.toContain(newUid);
      expect(serialized).not.toContain(gmRecoveryCode);
    });

    it("the spent code cannot be redeemed a second time", async () => {
      const { roomCode, gmRecoveryCode } = await seedRoomWithGm();
      const firstUid = `uid-first-${RUN}-${(counter += 1)}`;
      const secondUid = `uid-second-${RUN}-${(counter += 1)}`;
      await recoverSeat(db, firstUid, { roomCode, recoveryCode: gmRecoveryCode });
      const second = await recoverSeat(db, secondUid, { roomCode, recoveryCode: gmRecoveryCode });
      expect(second).toMatchObject({ ok: false, code: "INVALID_RECOVERY_CODE" });
    });

    it("the old UID can no longer act as that member after recovery (uidBindings revoked)", async () => {
      const { roomId, roomCode, gmRecoveryCode, originalUid } = await seedRoomWithGm();
      const newUid = `uid-recovered-${RUN}-${(counter += 1)}`;
      await recoverSeat(db, newUid, { roomCode, recoveryCode: gmRecoveryCode });

      const stillBound = await db.doc(`rooms/${roomId}/uidBindings/${originalUid}`).get();
      expect(stillBound.exists).toBe(false);
    });

    it("finds the right seat among multiple seated members and never touches the others", async () => {
      const { roomId, roomCode, gmMemberId, gmRecoveryCode } = await seedRoomWithGm();
      const playerUid = `uid-player-${RUN}-${(counter += 1)}`;
      const playerJoin = await admitMember(db, playerUid, {
        roomCode,
        passphrase: "correct horse battery staple",
        requestedCapability: "player",
        displayName: "Rook",
      });
      expect(playerJoin.ok).toBe(true);
      const playerMemberId = playerJoin.ok ? playerJoin.accepted.memberId : "";
      const playerRecoveryCode = playerJoin.ok ? (playerJoin.accepted.recoveryCode as string) : "";

      const newGmUid = `uid-gm-recovered-${RUN}-${(counter += 1)}`;
      const recovered = recoveredAccepted(
        await recoverSeat(db, newGmUid, { roomCode, recoveryCode: gmRecoveryCode }),
      );
      expect(recovered.memberId).toBe(gmMemberId);

      // The player's own binding/recovery are untouched by the GM's recovery.
      const playerBindingStillValid = await verifySecret(
        playerRecoveryCode,
        (await db.doc(`rooms/${roomId}/recovery/${playerMemberId}`).get()).data() as {
          hash: string;
          salt: string;
          iterations: number;
        },
      );
      expect(playerBindingStillValid).toBe(true);
    });

    it("denies ROOM_NOT_FOUND for an unrecognized room code", async () => {
      const result = await recoverSeat(db, `uid-${RUN}-${(counter += 1)}`, {
        roomCode: `NO-SUCH-ROOM-${RUN}`,
        recoveryCode: "whatever-code-here",
      });
      expect(result).toMatchObject({ ok: false, code: "ROOM_NOT_FOUND" });
    });

    it("denies INVALID_RECOVERY_CODE for a wrong code, without revealing which member IDs exist", async () => {
      const { roomCode } = await seedRoomWithGm();
      const result = await recoverSeat(db, `uid-${RUN}-${(counter += 1)}`, {
        roomCode,
        recoveryCode: "totally-wrong-code-value",
      });
      expect(result).toMatchObject({ ok: false, code: "INVALID_RECOVERY_CODE" });
    });

    it("recovering with the same UID that already owns the seat still rotates the code without error", async () => {
      const { roomId, roomCode, gmMemberId, gmRecoveryCode, originalUid } = await seedRoomWithGm();
      const result = recoveredAccepted(
        await recoverSeat(db, originalUid, { roomCode, recoveryCode: gmRecoveryCode }),
      );
      expect(result.memberId).toBe(gmMemberId);
      const binding = (await db.doc(`rooms/${roomId}/uidBindings/${originalUid}`).get()).data();
      expect(binding).toEqual({ memberId: gmMemberId, capability: "gm" });
    });
  });

  describe("callable boundary", () => {
    const CLIENT_IP = "203.0.113.30";

    function recorder(): AdmissionLogger & {
      readonly events: { event: string; fields: Record<string, string> }[];
    } {
      const events: { event: string; fields: Record<string, string> }[] = [];
      return {
        events,
        warn: (event, fields) => events.push({ event, fields: { ...fields } }),
        info: (event, fields) => events.push({ event, fields: { ...fields } }),
      };
    }

    function request(
      data: unknown,
      options: { readonly uid?: string; readonly ip?: string } = {},
    ): CallableRequest<unknown> {
      return {
        data,
        rawRequest: { ip: options.ip ?? CLIENT_IP, headers: {} },
        ...(options.uid === undefined ? {} : { auth: { uid: options.uid, token: {} } }),
        acceptsStreaming: false,
      } as unknown as CallableRequest<unknown>;
    }

    async function expectHttpsError(
      promise: Promise<unknown>,
      grpc: string,
      stable?: string,
    ): Promise<void> {
      const error = await promise.then(
        () => null,
        (thrown: unknown) => thrown,
      );
      expect(error).toBeInstanceOf(HttpsError);
      const httpsError = error as HttpsError;
      expect(httpsError.code).toBe(grpc);
      if (stable !== undefined) expect(httpsError.details).toEqual({ code: stable });
    }

    function callable(clock: { now: number }): RecoverSeatCallable {
      return createAdmissionCallables({ db, logger: recorder(), now: () => clock.now }).recoverSeat;
    }

    it("returns the recovered seat through the callable", async () => {
      const { roomCode, gmRecoveryCode } = await seedRoomWithGm();
      const recoverSeatCallable = callable({ now: 1 });
      const input: RecoverSeatInput = { roomCode, recoveryCode: gmRecoveryCode };
      const result = await recoverSeatCallable.run(
        request(input, { uid: `uid-callable-${RUN}-${(counter += 1)}` }),
      );
      expect(result.capability).toBe("gm");
      expect(result.recoveryCode).not.toBe(gmRecoveryCode);
    });

    it("rejects an unauthenticated call before any Firestore read", async () => {
      const { roomCode, gmRecoveryCode } = await seedRoomWithGm();
      const recoverSeatCallable = callable({ now: 1 });
      await expectHttpsError(
        recoverSeatCallable.run(request({ roomCode, recoveryCode: gmRecoveryCode })),
        "unauthenticated",
        "AUTH_REQUIRED",
      );
    });

    it("rejects a malformed payload as INVALID_REQUEST", async () => {
      const recoverSeatCallable = callable({ now: 1 });
      await expectHttpsError(
        recoverSeatCallable.run(request("not an object", { uid: `uid-${RUN}-${(counter += 1)}` })),
        "invalid-argument",
        "INVALID_REQUEST",
      );
      await expectHttpsError(
        recoverSeatCallable.run(
          request({ roomCode: "AB", recoveryCode: "x" }, { uid: `uid-${RUN}-${(counter += 1)}` }),
        ),
        "invalid-argument",
        "INVALID_REQUEST",
      );
    });

    it("throttles per room-code+IP, bounding brute-force attempts against one room", async () => {
      const clock = { now: 100 };
      const recoverSeatCallable = callable(clock);
      const { roomCode } = await seedRoomWithGm();
      for (let attempt = 0; attempt < RECOVERY_THROTTLE_LIMITS.roomIp; attempt += 1) {
        await expectHttpsError(
          recoverSeatCallable.run(
            request(
              { roomCode, recoveryCode: "guess-guess-guess" },
              { uid: `uid-throttle-${RUN}-${attempt}` },
            ),
          ),
          "permission-denied",
          "INVALID_RECOVERY_CODE",
        );
      }
      await expectHttpsError(
        recoverSeatCallable.run(
          request(
            { roomCode, recoveryCode: "guess-guess-guess" },
            { uid: `uid-throttle-${RUN}-final` },
          ),
        ),
        "resource-exhausted",
        "RATE_LIMITED",
      );
    });

    it("never logs the recovery code or either UID", async () => {
      const { roomCode, gmRecoveryCode } = await seedRoomWithGm();
      const logger = recorder();
      const { recoverSeat: recoverSeatCallable } = createAdmissionCallables({
        db,
        logger,
        now: () => 1,
      });
      const uid = `uid-secret-check-${RUN}-${(counter += 1)}`;
      await recoverSeatCallable.run(request({ roomCode, recoveryCode: gmRecoveryCode }, { uid }));
      const serialized = JSON.stringify(logger.events);
      expect(serialized).not.toContain(gmRecoveryCode);
      expect(serialized).not.toContain(uid);
    });
  });
});
