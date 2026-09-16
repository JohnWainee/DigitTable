import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { verifySecret } from "@digitable/engine";
import type { CreateRoomInput } from "@digitable/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { createRoom, type CreateRoomResult } from "../src/createRoomAuthority.js";
import { admitMember, claimSeat } from "../src/admissionAuthority.js";
import {
  createAdmissionCallables,
  type AdmissionLogger,
  type CreateRoomCallable,
} from "../src/callables.js";
import { CREATE_ROOM_THROTTLE_LIMITS } from "../src/throttle.js";

/**
 * Board task A03's `createRoom` proof, run against the real trusted
 * boundary the same way `admission.test.ts` proves `admitMember`/
 * `claimSeat`: the Admin SDK talks to the Firestore emulator exactly as a
 * deployed Function would.
 */
describe("createRoom (apps/functions, board task A03)", () => {
  let db: Firestore;

  const RUN = Date.now().toString(36);
  let requestCounter = 0;
  const requestId = (): string => `req-${RUN}-${(requestCounter += 1)}`;

  beforeAll(() => {
    if (getApps().length === 0) initializeApp();
    db = getFirestore();
  });

  function createInput(overrides: Partial<CreateRoomInput> = {}): CreateRoomInput {
    return {
      requestId: requestId(),
      sessionName: "Paris Cell",
      passphrase: "correct horse battery staple",
      creatorDisplayName: "Rook",
      ...overrides,
    };
  }

  function accepted(result: CreateRoomResult): Extract<CreateRoomResult, { ok: true }>["accepted"] {
    expect(result.ok).toBe(true);
    return (result as Extract<CreateRoomResult, { ok: true }>).accepted;
  }

  async function docExists(path: string): Promise<boolean> {
    return (await db.doc(path).get()).exists;
  }

  describe("engine-level provisioning", () => {
    it("atomically provisions authority, meta, the GM seat, and the GM's own projection", async () => {
      const input = createInput();
      const result = await createRoom(db, "uid-create-1", input);
      const seat = accepted(result);

      expect(seat.capability).toBe("gm");
      expect(seat.recoveryCode).not.toBeNull();
      expect(seat.tableCode).not.toBeNull();
      expect(seat.roomRevision).toBe(0);

      const authority = (await db.doc(`rooms/${seat.roomId}/authority/current`).get()).data();
      expect(authority).toMatchObject({
        roomStatus: "active",
        admissionStatus: "open",
        participantCount: 1,
        tableSeatClaimed: false,
        gmMemberId: seat.memberId,
        templateId: "eat-the-reich",
      });

      const meta = (await db.doc(`rooms/${seat.roomId}/meta/current`).get()).data();
      expect(meta).toMatchObject({
        roomStatus: "active",
        gmMemberId: seat.memberId,
        sessionName: "Paris Cell",
      });

      const binding = (await db.doc(`rooms/${seat.roomId}/uidBindings/uid-create-1`).get()).data();
      expect(binding).toEqual({ memberId: seat.memberId, capability: "gm" });

      const member = (await db.doc(`rooms/${seat.roomId}/members/${seat.memberId}`).get()).data();
      expect(member).toMatchObject({ capability: "gm", displayName: "Rook" });

      const projection = (await db.doc(`rooms/${seat.roomId}/projections/gm`).get()).data();
      // "gm" (the reserved viewer ID), not the GM's own memberId — matches
      // the established InMemoryRoomRepository convention and firestore.rules'
      // `projections/gm` path.
      expect(projection).toMatchObject({ viewerId: "gm", roomRevision: 0 });
      expect(projection?.view).toBeDefined();

      const roomCodeDoc = (await db.doc(`roomCodes/${seat.roomCode}`).get()).data();
      expect(roomCodeDoc).toEqual({ roomId: seat.roomId });
    });

    it("stores only a hash of the creator-supplied passphrase, never plaintext", async () => {
      const input = createInput({ passphrase: "totally-secret-phrase" });
      const seat = accepted(await createRoom(db, "uid-create-2", input));
      const secretDoc = (await db.doc(`rooms/${seat.roomId}/admission/secret`).get()).data() as {
        hash: string;
        salt: string;
        iterations: number;
      };
      expect(secretDoc.hash).not.toContain("totally-secret-phrase");
      expect(await verifySecret("totally-secret-phrase", secretDoc)).toBe(true);
      expect(await verifySecret("wrong phrase", secretDoc)).toBe(false);
    });

    it("mints a distinct table credential, separate from the room passphrase, verifiable via admission/tableSecret", async () => {
      const input = createInput({ passphrase: "room passphrase here" });
      const seat = accepted(await createRoom(db, "uid-create-3", input));
      expect(seat.tableCode).not.toBeNull();
      expect(seat.tableCode).not.toBe(input.passphrase);

      const tableSecretDoc = (
        await db.doc(`rooms/${seat.roomId}/admission/tableSecret`).get()
      ).data() as { hash: string; salt: string; iterations: number };
      expect(await verifySecret(seat.tableCode ?? "", tableSecretDoc)).toBe(true);
      expect(await verifySecret(input.passphrase, tableSecretDoc)).toBe(false);
    });

    it("a separate joiner cannot seize the creator's GM seat with the room passphrase (integration with admitMember/claimSeat)", async () => {
      const input = createInput({ passphrase: "shared secret" });
      const seat = accepted(await createRoom(db, "uid-create-4", input));

      const claimResult = await claimSeat(db, "uid-other-claimer", {
        roomCode: seat.roomCode,
        passphrase: "shared secret",
        displayName: "Impostor",
      });
      expect(claimResult).toMatchObject({ ok: false, code: "GM_SEAT_TAKEN" });

      const joinResult = await admitMember(db, "uid-other-player", {
        roomCode: seat.roomCode,
        passphrase: "shared secret",
        requestedCapability: "player",
        displayName: "Player One",
      });
      expect(joinResult).toMatchObject({ ok: true });
      if (joinResult.ok) {
        expect(joinResult.accepted.capability).toBe("player");
        expect(joinResult.accepted.memberId).not.toBe(seat.memberId);
      }
    });
  });

  describe("idempotent retry (board task A03: 'same request concurrent/retried')", () => {
    it("a sequential retry with the same requestId replays the original outcome without provisioning a second room", async () => {
      const input = createInput();
      const first = accepted(await createRoom(db, "uid-retry-1", input));
      const second = accepted(await createRoom(db, "uid-retry-1", input));

      expect(second.roomId).toBe(first.roomId);
      expect(second.roomCode).toBe(first.roomCode);
      expect(second.memberId).toBe(first.memberId);
      // Secrets are shown once; a replay never re-exposes them.
      expect(second.recoveryCode).toBeNull();
      expect(second.tableCode).toBeNull();

      // Exactly one room-code index entry and one GM binding exist — no orphan.
      const codeDoc = await db.doc(`roomCodes/${first.roomCode}`).get();
      expect(codeDoc.exists).toBe(true);
      const membersSnap = await db.collection(`rooms/${first.roomId}/members`).get();
      expect(membersSnap.size).toBe(1);
    });

    it("N concurrent identical requests (same requestId, same identity) all resolve to the same single room", async () => {
      // A real double-click/network-retry always comes from the *same*
      // authenticated identity's browser tab; a different UID sharing a
      // requestId is not a retry at all (see the "different identity"
      // ROLE_FORBIDDEN test above, added after an independent review found
      // the original version of this test — which used a distinct uid per
      // attempt — was inadvertently exercising an insecure cross-identity
      // replay as if it were the happy path).
      const input = createInput();
      const attempts = 8;
      const results = await Promise.all(
        Array.from({ length: attempts }, () => createRoom(db, "uid-concurrent-same", input)),
      );
      const seats = results.map((result) => accepted(result));
      const roomIds = new Set(seats.map((seat) => seat.roomId));
      const memberIds = new Set(seats.map((seat) => seat.memberId));
      expect(roomIds.size).toBe(1);
      expect(memberIds.size).toBe(1);
      // Exactly one of the concurrent attempts saw the real, non-null secrets.
      const withRecoveryCode = seats.filter((seat) => seat.recoveryCode !== null);
      expect(withRecoveryCode).toHaveLength(1);

      const membersSnap = await db.collection(`rooms/${[...roomIds][0]}/members`).get();
      expect(membersSnap.size).toBe(1);
    });

    it("a different requestId with the same input creates a genuinely separate room", async () => {
      const input = createInput();
      const first = accepted(await createRoom(db, "uid-distinct-1", input));
      const second = accepted(
        await createRoom(db, "uid-distinct-2", { ...input, requestId: requestId() }),
      );
      expect(second.roomId).not.toBe(first.roomId);
      expect(second.roomCode).not.toBe(first.roomCode);
    });

    it("denies ROLE_FORBIDDEN when a different identity reuses another identity's requestId (independent review finding)", async () => {
      const input = createInput();
      const first = accepted(await createRoom(db, "uid-owner", input));

      const result = await createRoom(db, "uid-attacker", input);
      expect(result).toMatchObject({ ok: false, code: "ROLE_FORBIDDEN" });

      // Nothing changed: still exactly the original room and its one member.
      const membersSnap = await db.collection(`rooms/${first.roomId}/members`).get();
      expect(membersSnap.size).toBe(1);
      expect(await docExists(`rooms/${first.roomId}/uidBindings/uid-attacker`)).toBe(false);
    });

    it("a sequential replay returns the room's live roomRevision, not a hardcoded 0 (independent review finding)", async () => {
      const input = createInput();
      const first = accepted(await createRoom(db, "uid-revision-1", input));
      expect(first.roomRevision).toBe(0);

      // Simulate a later game command having advanced the room (board task
      // A04 is what actually does this outside this test).
      await db.doc(`rooms/${first.roomId}/authority/current`).update({ roomRevision: 5 });

      const replay = accepted(await createRoom(db, "uid-revision-1", input));
      expect(replay.roomRevision).toBe(5);
    });
  });

  describe("collision safety (board task A03: 'collision')", () => {
    it("regenerates the room code when the first candidate is already taken", async () => {
      const takenCode = `TAKEN-${RUN}`;
      await db.doc(`roomCodes/${takenCode}`).set({ roomId: "some-other-room" });

      let calls = 0;
      const codes = [takenCode, `FREE1-${RUN}`];
      const generateCode = (): string => codes[calls++] ?? `FALLBACK-${RUN}-${calls}`;

      const result = await createRoom(db, "uid-collision-1", createInput(), generateCode);
      const seat = accepted(result);
      expect(seat.roomCode).toBe(`FREE1-${RUN}`);
      expect(calls).toBe(2);
    });

    it("denies ROOM_CREATION_FAILED when every candidate collides, without writing anything", async () => {
      const generateCode = (): string => `ALWAYS-TAKEN-${RUN}`;
      await db.doc(`roomCodes/ALWAYS-TAKEN-${RUN}`).set({ roomId: "occupied" });

      const input = createInput();
      const result = await createRoom(db, "uid-collision-2", input, generateCode);
      expect(result).toMatchObject({ ok: false, code: "ROOM_CREATION_FAILED" });

      // Nothing was provisioned: no receipt, no new room-code entry beyond the seeded one.
      expect(await docExists(`createRoomReceipts/${input.requestId}`)).toBe(false);
    });
  });

  describe("partial failure (board task A03: 'partial failure')", () => {
    it("a malformed existing receipt denies ROOM_DATA_INVALID and writes nothing new", async () => {
      const input = createInput();
      await db.doc(`createRoomReceipts/${input.requestId}`).set({ roomId: 12345 });

      const result = await createRoom(db, "uid-partial-1", input);
      expect(result).toMatchObject({ ok: false, code: "ROOM_DATA_INVALID" });

      // The malformed receipt is untouched (not silently repaired), and no
      // room-code index entry was created for this attempt.
      const receipt = (await db.doc(`createRoomReceipts/${input.requestId}`).get()).data();
      expect(receipt).toEqual({ roomId: 12345 });
    });
  });

  describe("callable boundary", () => {
    const CLIENT_IP = "203.0.113.9";

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

    function callable(clock: { now: number }): CreateRoomCallable {
      return createAdmissionCallables({ db, logger: recorder(), now: () => clock.now }).createRoom;
    }

    it("rejects an unauthenticated call before any Firestore read (board task A03: 'unauthorized call')", async () => {
      const createRoomCallable = callable({ now: 1 });
      await expectHttpsError(
        createRoomCallable.run(request(createInput())),
        "unauthenticated",
        "AUTH_REQUIRED",
      );
    });

    it("rejects a malformed payload as INVALID_REQUEST before any Firestore read", async () => {
      const createRoomCallable = callable({ now: 1 });
      await expectHttpsError(
        createRoomCallable.run(request("not an object", { uid: "uid-malformed" })),
        "invalid-argument",
        "INVALID_REQUEST",
      );
      await expectHttpsError(
        createRoomCallable.run(
          request({ ...createInput(), passphrase: "abc" }, { uid: "uid-malformed" }),
        ),
        "invalid-argument",
        "INVALID_REQUEST",
      );
    });

    it("ignores any extraneous or spoofed field in the payload — the creator always becomes exactly 'gm' with a server-minted memberId (board task A03: 'privilege escalation')", async () => {
      const createRoomCallable = callable({ now: 1 });
      const uid = "uid-escalation-1";
      const spoofed = {
        ...createInput(),
        capability: "table",
        gmMemberId: "attacker-chosen-id",
        memberId: "attacker-chosen-id",
        roomId: "attacker-chosen-room",
      };
      const result = await createRoomCallable.run(request(spoofed, { uid }));
      expect(result.capability).toBe("gm");
      expect(result.memberId).not.toBe("attacker-chosen-id");
      expect(result.roomId).not.toBe("attacker-chosen-room");
    });

    it("returns the accepted room, GM seat, and one-time credentials through the callable", async () => {
      const createRoomCallable = callable({ now: 1 });
      const result = await createRoomCallable.run(
        request(createInput(), { uid: "uid-callable-1" }),
      );
      expect(result).toMatchObject({ capability: "gm" });
      expect(result.recoveryCode).not.toBeNull();
      expect(result.tableCode).not.toBeNull();
    });

    it("throttles per UID and per IP, independently of the admission throttle buckets (board task A03: 'private secret reads' stay behind the same throttle)", async () => {
      const clock = { now: 100 };
      const createRoomCallable = callable(clock);
      const uid = "uid-throttled-1";
      for (let attempt = 0; attempt < CREATE_ROOM_THROTTLE_LIMITS.uid; attempt += 1) {
        await createRoomCallable.run(request(createInput(), { uid }));
      }
      await expectHttpsError(
        createRoomCallable.run(request(createInput(), { uid })),
        "resource-exhausted",
        "RATE_LIMITED",
      );
    });

    it("never returns or logs the creator's plaintext passphrase", async () => {
      const events: { event: string; fields: Record<string, string> }[] = [];
      const logger: AdmissionLogger = {
        warn: (event, fields) => events.push({ event, fields: { ...fields } }),
        info: (event, fields) => events.push({ event, fields: { ...fields } }),
      };
      const { createRoom: createRoomCallable } = createAdmissionCallables({
        db,
        logger,
        now: () => 1,
      });
      const input = createInput({ passphrase: "never-should-leak-this" });
      const result = await createRoomCallable.run(request(input, { uid: "uid-secret-1" }));
      expect(JSON.stringify(result)).not.toContain("never-should-leak-this");
      expect(JSON.stringify(events)).not.toContain("never-should-leak-this");
    });
  });
});
