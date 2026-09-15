import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { hashSecret } from "@digitable/engine";
import {
  MAX_PARTICIPANT_SEATS,
  type AdmitMemberInput,
  type ClaimSeatInput,
} from "@digitable/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { admitMember, claimSeat, type AdmissionResult } from "../src/admissionAuthority.js";
import {
  createAdmissionCallables,
  type AdmissionCallable,
  type AdmissionLogger,
} from "../src/callables.js";
import {
  ADMISSION_THROTTLE_LIMITS,
  ADMISSION_THROTTLE_WINDOW_MS,
  throttleDocumentPaths,
} from "../src/throttle.js";

const PASSPHRASE = "correct horse battery staple";
const TABLE_CODE = "table code for the big screen";
/**
 * Per-run suffix for every fixture ID: all emulator test files share one
 * emulator instance, and a developer may run this file repeatedly against
 * an already-started emulator, so deterministic IDs would let stale
 * bindings/throttle counters from a previous run leak into this one (second
 * pass, C5).
 */
const RUN = Date.now().toString(36);
/** A run-unique UID for a test identity. */
const uid = (name: string): string => `uid-${name}-${RUN}`;

type Accepted = Extract<AdmissionResult, { ok: true }>["accepted"];

function accepted(result: AdmissionResult): Accepted {
  expect(result.ok).toBe(true);
  return (result as Extract<AdmissionResult, { ok: true }>).accepted;
}

/**
 * Phase 2 PR 3's admission-authority proof, now run against the *real*
 * trusted boundary (`apps/functions`): the Admin SDK talks to the Firestore
 * emulator exactly as a deployed Function would (`FIRESTORE_EMULATOR_HOST`
 * and `GCLOUD_PROJECT` are exported by `firebase emulators:exec`; see
 * `vitest.emulator.config.ts`). Callable-boundary tests invoke the same
 * `onCall` handlers a deployed HTTPS request reaches, via `.run()`.
 */
describe("Phase 2 admission authority (apps/functions)", () => {
  let db: Firestore;
  let roomCounter = 0;

  beforeAll(() => {
    if (getApps().length === 0) initializeApp();
    db = getFirestore();
  });

  /** Seeds a fresh, isolated room with an open GM seat, a known passphrase, and a separate table code. */
  async function seedRoom(
    overrides: {
      readonly admissionStatus?: "open" | "closed";
      readonly participantCount?: number;
      readonly tableSeatClaimed?: boolean;
      readonly gmMemberId?: string | null;
      readonly roomStatus?: "active" | "archived";
      readonly tableSecret?: boolean;
      readonly roomRevision?: number;
    } = {},
  ): Promise<{ readonly roomId: string; readonly roomCode: string }> {
    roomCounter += 1;
    // Prefixed distinctly from other emulator test files' fixture IDs/codes: every
    // emulator test file shares one running emulator instance.
    const roomId = `room-functions-admission-${RUN}-${roomCounter}`;
    const roomCode = `FA-${RUN}-${roomCounter}`;
    const [hashed, hashedTable] = await Promise.all([
      hashSecret(PASSPHRASE),
      hashSecret(TABLE_CODE),
    ]);

    await Promise.all([
      db.doc(`roomCodes/${roomCode}`).set({ roomId }),
      db.doc(`rooms/${roomId}/admission/secret`).set(hashed),
      overrides.tableSecret === false
        ? Promise.resolve()
        : db.doc(`rooms/${roomId}/admission/tableSecret`).set(hashedTable),
      db.doc(`rooms/${roomId}/authority/current`).set({
        roomStatus: overrides.roomStatus ?? "active",
        admissionStatus: overrides.admissionStatus ?? "open",
        participantCount: overrides.participantCount ?? 0,
        tableSeatClaimed: overrides.tableSeatClaimed ?? false,
        gmMemberId: overrides.gmMemberId ?? null,
        roomRevision: overrides.roomRevision ?? 0,
      }),
      db.doc(`rooms/${roomId}/meta/current`).set({
        roomStatus: overrides.roomStatus ?? "active",
        gmMemberId: overrides.gmMemberId ?? null,
      }),
    ]);

    return { roomId, roomCode };
  }

  function admitInput(overrides: Partial<AdmitMemberInput> = {}): AdmitMemberInput {
    return {
      roomCode: "unset",
      passphrase: PASSPHRASE,
      requestedCapability: "player",
      displayName: "Player",
      ...overrides,
    };
  }

  function claimInput(overrides: Partial<ClaimSeatInput> = {}): ClaimSeatInput {
    return { roomCode: "unset", passphrase: PASSPHRASE, displayName: "Director", ...overrides };
  }

  async function authority(roomId: string): Promise<Record<string, unknown> | undefined> {
    return (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
  }

  async function memberCount(roomId: string): Promise<number> {
    return (await db.collection(`rooms/${roomId}/members`).get()).size;
  }

  describe("transaction authority", () => {
    it("claims an empty GM seat and mints a one-time recovery code", async () => {
      const { roomCode, roomId } = await seedRoom();
      const result = accepted(await claimSeat(db, uid("gm"), claimInput({ roomCode })));
      expect(result.capability).toBe("gm");
      expect(result.recoveryCode).toEqual(expect.any(String));
      expect(await authority(roomId)).toMatchObject({
        gmMemberId: result.memberId,
        participantCount: 1,
      });
      const meta = (await db.doc(`rooms/${roomId}/meta/current`).get()).data();
      expect(meta).toMatchObject({ gmMemberId: result.memberId, roomStatus: "active" });
      expect(meta?.updatedAtServer).toEqual(expect.any(String) as unknown);
    });

    it("admits a player with the room passphrase and the table with its separate code", async () => {
      const { roomCode, roomId } = await seedRoom({ participantCount: 1, gmMemberId: "member-gm" });
      accepted(await admitMember(db, uid("player"), admitInput({ roomCode })));
      accepted(
        await admitMember(
          db,
          uid("table"),
          admitInput({ roomCode, requestedCapability: "table", passphrase: TABLE_CODE }),
        ),
      );
      expect(await authority(roomId)).toMatchObject({
        participantCount: 2,
        tableSeatClaimed: true,
      });
    });

    it("denies admission policy violations: unknown code and wrong passphrase", async () => {
      const { roomCode } = await seedRoom();
      expect(
        await admitMember(db, uid("1"), admitInput({ roomCode: "NO-SUCH-CODE" })),
      ).toMatchObject({
        ok: false,
        code: "ROOM_NOT_FOUND",
      });
      expect(
        await admitMember(
          db,
          uid("2"),
          admitInput({ roomCode, passphrase: "wrong phrase entirely" }),
        ),
      ).toMatchObject({ ok: false, code: "INVALID_PASSPHRASE" });
    });

    it("enforces the 8-participant capacity limit and the single table seat", async () => {
      const { roomCode } = await seedRoom({
        participantCount: MAX_PARTICIPANT_SEATS - 1,
        gmMemberId: "member-gm",
      });
      accepted(await admitMember(db, uid("last-seat"), admitInput({ roomCode })));
      expect(await admitMember(db, uid("over-capacity"), admitInput({ roomCode }))).toMatchObject({
        ok: false,
        code: "ROOM_FULL",
      });
      const table = admitInput({ roomCode, requestedCapability: "table", passphrase: TABLE_CODE });
      accepted(await admitMember(db, uid("table-1"), table));
      expect(await admitMember(db, uid("table-2"), table)).toMatchObject({
        ok: false,
        code: "ROOM_FULL",
      });
    });

    it("closes admission to new members but still lets a bound member reclaim their seat", async () => {
      const { roomCode, roomId } = await seedRoom({ participantCount: 1, gmMemberId: "member-gm" });
      const admitted = accepted(await admitMember(db, uid("existing"), admitInput({ roomCode })));
      await db.doc(`rooms/${roomId}/authority/current`).update({ admissionStatus: "closed" });

      expect(await admitMember(db, uid("newcomer"), admitInput({ roomCode }))).toMatchObject({
        ok: false,
        code: "ADMISSION_CLOSED",
      });
      const reclaimed = accepted(await admitMember(db, uid("existing"), admitInput({ roomCode })));
      expect(reclaimed.memberId).toBe(admitted.memberId);
      // Reconnecting never re-mints or re-exposes a recovery credential.
      expect(reclaimed.recoveryCode).toBeNull();
    });

    it("reclaiming does not double-count the participant cap", async () => {
      const { roomCode, roomId } = await seedRoom({ participantCount: 1, gmMemberId: "member-gm" });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        accepted(await admitMember(db, uid("existing"), admitInput({ roomCode })));
      }
      expect((await authority(roomId))?.participantCount).toBe(2);
    });

    it("privilege escalation: a bound player cannot be reinterpreted as a table seat or claim the GM seat", async () => {
      const { roomCode } = await seedRoom({ participantCount: 1, gmMemberId: "member-gm" });
      accepted(await admitMember(db, uid("player"), admitInput({ roomCode })));
      expect(
        await admitMember(
          db,
          uid("player"),
          admitInput({ roomCode, requestedCapability: "table", passphrase: TABLE_CODE }),
        ),
      ).toMatchObject({ ok: false, code: "ROLE_FORBIDDEN" });
      expect(await claimSeat(db, uid("player"), claimInput({ roomCode }))).toMatchObject({
        ok: false,
        code: "ROLE_FORBIDDEN",
      });
    });

    it("denies a second GM claim once the seat is taken (GM-seat exclusivity)", async () => {
      const { roomCode } = await seedRoom();
      accepted(await claimSeat(db, uid("gm-1"), claimInput({ roomCode })));
      expect(await claimSeat(db, uid("gm-2"), claimInput({ roomCode }))).toMatchObject({
        ok: false,
        code: "GM_SEAT_TAKEN",
      });
    });

    it("GM-seat transaction race: exactly one of many concurrent claimants wins", async () => {
      const { roomCode, roomId } = await seedRoom();
      const claimantCount = 6;
      const results = await Promise.all(
        Array.from({ length: claimantCount }, (_, index) =>
          claimSeat(db, uid(`race-${index}`), claimInput({ roomCode })),
        ),
      );
      const winners = results.filter((result) => result.ok);
      const losers = results.filter((result) => !result.ok);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(claimantCount - 1);
      for (const loser of losers) expect(loser).toMatchObject({ code: "GM_SEAT_TAKEN" });
      expect(await authority(roomId)).toMatchObject({
        participantCount: 1,
        gmMemberId: accepted(winners[0] as AdmissionResult).memberId,
      });
    });

    it("capacity race: concurrent admits never exceed the 8-participant cap", async () => {
      const { roomCode, roomId } = await seedRoom({
        participantCount: MAX_PARTICIPANT_SEATS - 2,
        gmMemberId: "member-gm",
      });
      const applicantCount = 5;
      const results = await Promise.all(
        Array.from({ length: applicantCount }, (_, index) =>
          admitMember(db, uid(`capacity-race-${index}`), admitInput({ roomCode })),
        ),
      );
      expect(results.filter((result) => result.ok)).toHaveLength(2);
      const rejected = results.filter((result) => !result.ok);
      expect(rejected).toHaveLength(applicantCount - 2);
      for (const rejection of rejected) expect(rejection).toMatchObject({ code: "ROOM_FULL" });
      expect((await authority(roomId))?.participantCount).toBe(MAX_PARTICIPANT_SEATS);
    });
  });

  describe("separate table code (review finding 2)", () => {
    it("the general room passphrase never self-claims the table seat", async () => {
      const { roomCode, roomId } = await seedRoom({ participantCount: 1, gmMemberId: "member-gm" });
      expect(
        await admitMember(db, uid("table"), admitInput({ roomCode, requestedCapability: "table" })),
      ).toMatchObject({ ok: false, code: "INVALID_PASSPHRASE" });
      expect(await authority(roomId)).toMatchObject({ tableSeatClaimed: false });
      expect(await memberCount(roomId)).toBe(0);
    });

    it("the table code never admits a player or claims the GM seat", async () => {
      const { roomCode, roomId } = await seedRoom();
      expect(
        await admitMember(db, uid("player"), admitInput({ roomCode, passphrase: TABLE_CODE })),
      ).toMatchObject({ ok: false, code: "INVALID_PASSPHRASE" });
      expect(
        await claimSeat(db, uid("gm"), claimInput({ roomCode, passphrase: TABLE_CODE })),
      ).toMatchObject({ ok: false, code: "INVALID_PASSPHRASE" });
      expect(await memberCount(roomId)).toBe(0);
    });

    it("a room the GM has not issued a table code for admits no table seat at all", async () => {
      const { roomCode } = await seedRoom({ tableSecret: false });
      expect(
        await admitMember(
          db,
          uid("table"),
          admitInput({ roomCode, requestedCapability: "table", passphrase: TABLE_CODE }),
        ),
      ).toMatchObject({ ok: false, code: "INVALID_PASSPHRASE" });
    });
  });

  describe("secret required before reclaim (review finding 4)", () => {
    it("a bound player cannot reclaim with a wrong passphrase, and is locked out after rotation", async () => {
      const { roomCode, roomId } = await seedRoom({ participantCount: 1, gmMemberId: "member-gm" });
      accepted(await admitMember(db, uid("existing"), admitInput({ roomCode })));
      expect(
        await admitMember(
          db,
          uid("existing"),
          admitInput({ roomCode, passphrase: "not the passphrase" }),
        ),
      ).toMatchObject({ ok: false, code: "INVALID_PASSPHRASE" });

      await db.doc(`rooms/${roomId}/admission/secret`).set(await hashSecret("rotated passphrase"));
      expect(await admitMember(db, uid("existing"), admitInput({ roomCode }))).toMatchObject({
        ok: false,
        code: "INVALID_PASSPHRASE",
      });
      const reclaimed = accepted(
        await admitMember(
          db,
          uid("existing"),
          admitInput({ roomCode, passphrase: "rotated passphrase" }),
        ),
      );
      expect(reclaimed.recoveryCode).toBeNull();
    });

    it("the bound GM cannot reclaim the seat with a wrong passphrase", async () => {
      const { roomCode } = await seedRoom();
      accepted(await claimSeat(db, uid("gm"), claimInput({ roomCode })));
      expect(
        await claimSeat(db, uid("gm"), claimInput({ roomCode, passphrase: "wrong" })),
      ).toMatchObject({ ok: false, code: "INVALID_PASSPHRASE" });
    });

    it("the bound table seat cannot reclaim with the general passphrase", async () => {
      const { roomCode } = await seedRoom();
      const table = admitInput({ roomCode, requestedCapability: "table", passphrase: TABLE_CODE });
      accepted(await admitMember(db, uid("table"), table));
      expect(
        await admitMember(db, uid("table"), { ...table, passphrase: PASSPHRASE }),
      ).toMatchObject({ ok: false, code: "INVALID_PASSPHRASE" });
    });
  });

  describe("malformed persisted documents fail closed (review finding 3)", () => {
    const wellFormedAuthority = {
      roomStatus: "active",
      admissionStatus: "open",
      participantCount: 0,
      tableSeatClaimed: false,
      gmMemberId: null,
      roomRevision: 0,
    };
    const { tableSeatClaimed: _dropped, ...withoutTableSeatClaimed } = wellFormedAuthority;
    const { gmMemberId: _droppedGm, ...withoutGmMemberId } = wellFormedAuthority;

    it.each([
      ["unknown roomStatus", { ...wellFormedAuthority, roomStatus: "paused" }],
      ["unknown admissionStatus", { ...wellFormedAuthority, admissionStatus: "maybe" }],
      ["string participantCount", { ...wellFormedAuthority, participantCount: "0" }],
      ["missing tableSeatClaimed", withoutTableSeatClaimed],
      ["missing gmMemberId (must not reopen the GM seat; second pass T2/C4)", withoutGmMemberId],
      ["empty-string gmMemberId", { ...wellFormedAuthority, gmMemberId: "" }],
    ])(
      "denies ROOM_DATA_INVALID when authority/current has %s, writing nothing",
      async (_label, malformed) => {
        const { roomCode, roomId } = await seedRoom();
        await db.doc(`rooms/${roomId}/authority/current`).set(malformed, { merge: false });
        expect(await admitMember(db, uid("1"), admitInput({ roomCode }))).toMatchObject({
          ok: false,
          code: "ROOM_DATA_INVALID",
        });
        expect(await claimSeat(db, uid("2"), claimInput({ roomCode }))).toMatchObject({
          ok: false,
          code: "ROOM_DATA_INVALID",
        });
        expect(await memberCount(roomId)).toBe(0);
      },
    );

    it("a seated GM stays exclusive even when authority/current lost its gmMemberId key (second pass T2)", async () => {
      const { roomCode, roomId } = await seedRoom();
      const first = accepted(await claimSeat(db, uid("gm-first"), claimInput({ roomCode })));
      const { gmMemberId: _dropped, ...rest } = (await authority(roomId)) as Record<
        string,
        unknown
      >;
      await db.doc(`rooms/${roomId}/authority/current`).set(rest, { merge: false });
      expect(await claimSeat(db, uid("gm-second"), claimInput({ roomCode }))).toMatchObject({
        ok: false,
        code: "ROOM_DATA_INVALID",
      });
      const gmBindings = (await db.collection(`rooms/${roomId}/bindings`).get()).docs.filter(
        (doc) => doc.data().capability === "gm",
      );
      expect(gmBindings.map((doc) => doc.id)).toEqual([first.memberId]);
    });

    it("denies ROOM_DATA_INVALID when the client-readable meta/current mirror is missing (second pass T6)", async () => {
      const { roomCode, roomId } = await seedRoom();
      await db.doc(`rooms/${roomId}/meta/current`).delete();
      expect(await claimSeat(db, uid("gm"), claimInput({ roomCode }))).toMatchObject({
        ok: false,
        code: "ROOM_DATA_INVALID",
      });
      expect((await db.doc(`rooms/${roomId}/meta/current`).get()).exists).toBe(false);
      expect(await memberCount(roomId)).toBe(0);
    });

    it("denies ROOM_DATA_INVALID for a malformed room-code index entry", async () => {
      const { roomCode } = await seedRoom();
      await db.doc(`roomCodes/${roomCode}`).set({ roomId: "" });
      expect(await admitMember(db, uid("1"), admitInput({ roomCode }))).toMatchObject({
        ok: false,
        code: "ROOM_DATA_INVALID",
      });
    });

    it("denies ROOM_DATA_INVALID for a malformed uid binding rather than minting a second seat", async () => {
      const { roomCode, roomId } = await seedRoom({ participantCount: 1, gmMemberId: "member-gm" });
      await db
        .doc(`rooms/${roomId}/uidBindings/${uid("corrupt")}`)
        .set({ memberId: "", capability: "player" });
      expect(await admitMember(db, uid("corrupt"), admitInput({ roomCode }))).toMatchObject({
        ok: false,
        code: "ROOM_DATA_INVALID",
      });
      expect(await memberCount(roomId)).toBe(0);
      expect((await authority(roomId))?.participantCount).toBe(1);
    });

    it("denies ROOM_DATA_INVALID for a malformed secret hash rather than treating it as verified", async () => {
      const { roomCode, roomId } = await seedRoom();
      await db.doc(`rooms/${roomId}/admission/secret`).set({ hash: "", salt: "s", iterations: 1 });
      expect(await admitMember(db, uid("1"), admitInput({ roomCode }))).toMatchObject({
        ok: false,
        code: "ROOM_DATA_INVALID",
      });
      await db
        .doc(`rooms/${roomId}/admission/secret`)
        .set({ hash: "h", salt: "s", iterations: "many" });
      expect(await claimSeat(db, uid("2"), claimInput({ roomCode }))).toMatchObject({
        ok: false,
        code: "ROOM_DATA_INVALID",
      });
    });

    it("denies INVALID_PASSPHRASE (not ROOM_DATA_INVALID) when the secret document is simply absent", async () => {
      const { roomCode, roomId } = await seedRoom();
      await db.doc(`rooms/${roomId}/admission/secret`).delete();
      expect(await admitMember(db, uid("1"), admitInput({ roomCode }))).toMatchObject({
        ok: false,
        code: "INVALID_PASSPHRASE",
      });
    });
  });

  describe("callable boundary (review finding 1)", () => {
    const CLIENT_IP = "203.0.113.5";

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
      options: { readonly uid?: string; readonly ip?: string; readonly appCheck?: boolean } = {},
    ): CallableRequest<unknown> {
      return {
        data,
        rawRequest: { ip: options.ip ?? CLIENT_IP, headers: {} },
        ...(options.uid === undefined ? {} : { auth: { uid: options.uid, token: {} } }),
        ...(options.appCheck
          ? { app: { appId: "app-id", token: {}, alreadyConsumed: false } }
          : {}),
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

    function callables(clock: { now: number }): {
      readonly logger: ReturnType<typeof recorder>;
      readonly admitMember: AdmissionCallable;
      readonly claimSeat: AdmissionCallable;
    } {
      const logger = recorder();
      return { logger, ...createAdmissionCallables({ db, logger, now: () => clock.now }) };
    }

    it("admits through the callable and returns the accepted seat with its one-time recovery code", async () => {
      const { roomCode, roomId } = await seedRoom();
      const { claimSeat: claim, admitMember: admit, logger } = callables({ now: 1 });
      const gm = await claim.run(
        request(claimInput({ roomCode }), { uid: uid("gm"), appCheck: true }),
      );
      expect(gm).toMatchObject({ capability: "gm", recoveryCode: expect.any(String) as unknown });
      const player = await admit.run(
        request(admitInput({ roomCode }), { uid: uid("p"), appCheck: true }),
      );
      expect(player).toMatchObject({
        capability: "player",
        recoveryCode: expect.any(String) as unknown,
      });
      expect(await memberCount(roomId)).toBe(2);
      // A request that carried an App Check token logs no monitoring warning.
      expect(logger.events.filter((entry) => entry.event === "admission.appCheckMissing")).toEqual(
        [],
      );
    });

    it("requires a signed-in identity before reading anything", async () => {
      const { roomCode } = await seedRoom();
      const { admitMember: admit } = callables({ now: 1 });
      await expectHttpsError(
        admit.run(request(admitInput({ roomCode }))),
        "unauthenticated",
        "AUTH_REQUIRED",
      );
    });

    it("rejects a malformed payload, including a client-asserted GM capability, before any Firestore read", async () => {
      const { roomCode, roomId } = await seedRoom();
      const { admitMember: admit } = callables({ now: 1 });
      await expectHttpsError(
        admit.run(
          request({ ...admitInput({ roomCode }), requestedCapability: "gm" }, { uid: uid("x") }),
        ),
        "invalid-argument",
        "INVALID_REQUEST",
      );
      await expectHttpsError(
        admit.run(request("not an object", { uid: uid("x") })),
        "invalid-argument",
        "INVALID_REQUEST",
      );
      // A code that could form a hostile Firestore path never reaches one (second pass T3/C2).
      await expectHttpsError(
        admit.run(request(admitInput({ roomCode: "ab/../cd" }), { uid: uid("x") })),
        "invalid-argument",
        "INVALID_REQUEST",
      );
      expect(await memberCount(roomId)).toBe(0);
      const codeBucket = throttleDocumentPaths({ roomCode, ip: CLIENT_IP, uid: uid("x") }).code;
      expect((await db.doc(codeBucket).get()).exists).toBe(false);
    });

    it("surfaces stable denial codes in details, with the closest gRPC status", async () => {
      const { roomCode } = await seedRoom();
      const { admitMember: admit, logger } = callables({ now: 1 });
      await expectHttpsError(
        admit.run(request(admitInput({ roomCode, passphrase: "wrong wrong" }), { uid: uid("x") })),
        "permission-denied",
        "INVALID_PASSPHRASE",
      );
      await expectHttpsError(
        admit.run(request(admitInput({ roomCode: "NO-SUCH-ROOM" }), { uid: uid("x") })),
        "not-found",
        "ROOM_NOT_FOUND",
      );
      // Denials are logged content-free: function name and stable code only.
      for (const entry of logger.events.filter((event) => event.event === "admission.denied")) {
        expect(Object.keys(entry.fields).sort()).toEqual(["code", "function"]);
      }
    });

    it("App Check monitoring: a request without a token is logged, never blocked", async () => {
      const { roomCode } = await seedRoom();
      const { claimSeat: claim, logger } = callables({ now: 1 });
      await claim.run(request(claimInput({ roomCode }), { uid: uid("gm") }));
      expect(logger.events).toContainEqual({
        event: "admission.appCheckMissing",
        fields: { function: "claimSeat" },
      });
      const serialized = JSON.stringify(logger.events);
      expect(serialized).not.toContain(roomCode);
      expect(serialized).not.toContain(PASSPHRASE);
      expect(serialized).not.toContain(uid("gm"));
    });

    it("throttles per IP and per submitted room code, bounding guesses at codes that resolve to no room", async () => {
      const clock = { now: 1_000 };
      const { admitMember: admit } = callables(clock);
      const guessed = admitInput({ roomCode: `NOROOM-${RUN}-${roomCounter}` });

      for (let attempt = 0; attempt < ADMISSION_THROTTLE_LIMITS.code; attempt += 1) {
        await expectHttpsError(
          admit.run(request(guessed, { uid: uid("guesser") })),
          "not-found",
          "ROOM_NOT_FOUND",
        );
      }
      await expectHttpsError(
        admit.run(request(guessed, { uid: uid("guesser") })),
        "resource-exhausted",
        "RATE_LIMITED",
      );
      // A different source IP is a different bucket; a different code is too.
      await expectHttpsError(
        admit.run(request(guessed, { uid: uid("guesser"), ip: "198.51.100.9" })),
        "not-found",
        "ROOM_NOT_FOUND",
      );
      await expectHttpsError(
        admit.run(
          request({ ...guessed, roomCode: `${guessed.roomCode}-B` }, { uid: uid("guesser") }),
        ),
        "not-found",
        "ROOM_NOT_FOUND",
      );
      // The window expires, then attempts are allowed again.
      clock.now += ADMISSION_THROTTLE_WINDOW_MS;
      await expectHttpsError(
        admit.run(request(guessed, { uid: uid("guesser") })),
        "not-found",
        "ROOM_NOT_FOUND",
      );
    });

    it("a throttled caller never reaches the secret check, even with the right passphrase", async () => {
      const clock = { now: 5_000 };
      const { admitMember: admit } = callables(clock);
      const { roomCode, roomId } = await seedRoom({ participantCount: 1, gmMemberId: "member-gm" });
      const ip = "192.0.2.77";
      for (let attempt = 0; attempt < ADMISSION_THROTTLE_LIMITS.code; attempt += 1) {
        await expectHttpsError(
          admit.run(
            request(admitInput({ roomCode, passphrase: "guess" }), { uid: uid(`${attempt}`), ip }),
          ),
          "permission-denied",
          "INVALID_PASSPHRASE",
        );
      }
      await expectHttpsError(
        admit.run(request(admitInput({ roomCode }), { uid: uid("legit"), ip })),
        "resource-exhausted",
        "RATE_LIMITED",
      );
      expect(await memberCount(roomId)).toBe(0);
    });

    it("bounds room-code enumeration from one IP even across distinct codes and identities (second pass C1)", async () => {
      const clock = { now: 9_000 };
      const { admitMember: admit } = callables(clock);
      const ip = "198.51.100.42";
      for (let attempt = 0; attempt < ADMISSION_THROTTLE_LIMITS.ip; attempt += 1) {
        await expectHttpsError(
          admit.run(
            request(admitInput({ roomCode: `ENUM-${RUN}-${attempt}` }), {
              uid: uid(`enum-${attempt}`),
              ip,
            }),
          ),
          "not-found",
          "ROOM_NOT_FOUND",
        );
      }
      await expectHttpsError(
        admit.run(
          request(admitInput({ roomCode: `ENUM-${RUN}-last` }), { uid: uid("enum-last"), ip }),
        ),
        "resource-exhausted",
        "RATE_LIMITED",
      );
    });

    it("bounds one verified identity even when it rotates its IP and code (second pass T1/C6)", async () => {
      const clock = { now: 12_000 };
      const { admitMember: admit } = callables(clock);
      const identity = uid("rotating");
      for (let attempt = 0; attempt < ADMISSION_THROTTLE_LIMITS.uid; attempt += 1) {
        await expectHttpsError(
          admit.run(
            request(admitInput({ roomCode: `ROT-${RUN}-${attempt}` }), {
              uid: identity,
              ip: `10.0.${Math.floor(attempt / 250)}.${attempt % 250}`,
            }),
          ),
          "not-found",
          "ROOM_NOT_FOUND",
        );
      }
      await expectHttpsError(
        admit.run(
          request(admitInput({ roomCode: `ROT-${RUN}-last` }), { uid: identity, ip: "10.9.9.9" }),
        ),
        "resource-exhausted",
        "RATE_LIMITED",
      );
      // A denied attempt consumed nothing: a different identity from the same last IP is still fine.
      await expectHttpsError(
        admit.run(
          request(admitInput({ roomCode: `ROT-${RUN}-last` }), {
            uid: uid("fresh"),
            ip: "10.9.9.9",
          }),
        ),
        "not-found",
        "ROOM_NOT_FOUND",
      );
    });

    it("a malformed throttle counter fails closed rather than opening a fresh window", async () => {
      const { admitMember: admit } = callables({ now: 1 });
      // Must pass input validation (4–32 chars) so the throttle, not the parser, is what runs.
      const roomCode = `TC-${RUN}-${roomCounter}`;
      await db
        .doc(throttleDocumentPaths({ roomCode, ip: CLIENT_IP, uid: uid("x") }).code)
        .set({ windowStartMs: "0", count: 0 });
      await expectHttpsError(
        admit.run(request(admitInput({ roomCode }), { uid: uid("x") })),
        "internal",
        "ROOM_DATA_INVALID",
      );
    });
  });
});
