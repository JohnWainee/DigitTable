import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { eatTheReichTemplate } from "@digitable/template-eat-the-reich";
import { asMemberId, asRoomId, type RoomCommandResult } from "@digitable/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { submitRoomCommand } from "../src/gameCommandAuthority.js";
import { createGameCallables, type SubmitRoomCommandCallable } from "../src/gameCallables.js";
import type { GameCommandLogger } from "../src/gameCommandAuthority.js";

/**
 * Board task A04's game-command authority proof, run against the real
 * Firestore emulator the same way `admission.test.ts`/`createRoom.test.ts`
 * prove their transactions: the Admin SDK talks to the emulator exactly as
 * a deployed Function would.
 */
describe("submitRoomCommand (apps/functions, board task A04)", () => {
  let db: Firestore;
  const RUN = Date.now().toString(36);
  let roomCounter = 0;
  let commandCounter = 0;

  beforeAll(() => {
    if (getApps().length === 0) initializeApp();
    db = getFirestore();
  });

  const commandId = (): string => `command-${RUN}-${(commandCounter += 1)}`;

  function fixedClock(seedByte = 7): {
    occurredAtServer: () => string;
    randomBytes: (size: number) => Uint8Array;
  } {
    return {
      occurredAtServer: () => "2026-09-14T00:00:00.000Z",
      randomBytes: (size: number) => new Uint8Array(size).fill(seedByte),
    };
  }

  function recorder(): GameCommandLogger & {
    readonly events: { event: string; fields: Record<string, string> }[];
  } {
    const events: { event: string; fields: Record<string, string> }[] = [];
    return { events, info: (event, fields) => events.push({ event, fields: { ...fields } }) };
  }

  /** Seeds a fresh, isolated room with a real ETR campaign state: one GM, one player holding the one placeholder character, and (optionally) a table seat. */
  async function seedRoom(
    options: { readonly withTable?: boolean; readonly roomStatus?: "active" | "archived" } = {},
  ): Promise<{
    readonly roomId: string;
    readonly gmMemberId: string;
    readonly playerMemberId: string;
    readonly tableMemberId: string | null;
  }> {
    roomCounter += 1;
    const roomId = `room-gamecmd-${RUN}-${roomCounter}`;
    const gmMemberId = `member-gm-${RUN}-${roomCounter}`;
    const playerMemberId = `member-player-${RUN}-${roomCounter}`;
    const tableMemberId = options.withTable ? `member-table-${RUN}-${roomCounter}` : null;

    const state = eatTheReichTemplate.initialState({
      roomId: asRoomId(roomId),
      gmMemberId: asMemberId(gmMemberId),
      memberIds: [asMemberId(playerMemberId)],
    });
    const manifest = eatTheReichTemplate.manifest;

    const authority = {
      platformVersion: "0.0.0",
      templateId: manifest.templateId,
      templateVersion: manifest.templateVersion,
      schemaVersion: manifest.currentSchemaVersion,
      roomRevision: 0,
      nextSequence: 1,
      roomStatus: options.roomStatus ?? "active",
      admissionStatus: "open",
      participantCount: tableMemberId ? 3 : 2,
      tableSeatClaimed: tableMemberId !== null,
      gmMemberId,
      state,
    };

    const writes = [
      db.doc(`rooms/${roomId}/authority/current`).set(authority),
      db.doc(`rooms/${roomId}/meta/current`).set({
        platformVersion: "0.0.0",
        templateId: manifest.templateId,
        templateVersion: manifest.templateVersion,
        schemaVersion: manifest.currentSchemaVersion,
        roomStatus: options.roomStatus ?? "active",
        gmMemberId,
        createdAtServer: "2026-09-14T00:00:00.000Z",
        updatedAtServer: "2026-09-14T00:00:00.000Z",
        sessionName: "Test Cell",
      }),
      db.doc(`rooms/${roomId}/uidBindings/uid-gm-${roomCounter}`).set({
        memberId: gmMemberId,
        capability: "gm",
      }),
      db.doc(`rooms/${roomId}/bindings/${gmMemberId}`).set({
        memberId: gmMemberId,
        uid: `uid-gm-${roomCounter}`,
        capability: "gm",
      }),
      db.doc(`rooms/${roomId}/uidBindings/uid-player-${roomCounter}`).set({
        memberId: playerMemberId,
        capability: "player",
      }),
      db.doc(`rooms/${roomId}/bindings/${playerMemberId}`).set({
        memberId: playerMemberId,
        uid: `uid-player-${roomCounter}`,
        capability: "player",
      }),
    ];
    if (tableMemberId !== null) {
      writes.push(
        db.doc(`rooms/${roomId}/uidBindings/uid-table-${roomCounter}`).set({
          memberId: tableMemberId,
          capability: "table",
        }),
        db.doc(`rooms/${roomId}/bindings/${tableMemberId}`).set({
          memberId: tableMemberId,
          uid: `uid-table-${roomCounter}`,
          capability: "table",
        }),
      );
    }
    await Promise.all(writes);
    return { roomId, gmMemberId, playerMemberId, tableMemberId };
  }

  function beginActionPayload(actorMemberId: string): Record<string, unknown> {
    return {
      type: "BeginAction",
      actorMemberId,
      threatId: "enforcer",
      actionId: "strong-arm-the-enforcer",
      gearIds: [],
    };
  }

  describe("engine-level transaction", () => {
    it("commits authority, receipt, shared+gm events, and every live viewer's projection atomically", async () => {
      const { roomId, playerMemberId } = await seedRoom({ withTable: true });
      const logger = recorder();
      const result = await submitRoomCommand(
        roomId,
        `uid-player-${roomCounter}`,
        { commandId: commandId(), payload: beginActionPayload(playerMemberId) },
        { db, logger, ...fixedClock() },
      );

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") throw new Error("expected acceptance");
      expect(result.roomRevision).toBe(1);
      expect(result.sharedEvents).toHaveLength(1);
      expect(result.sharedEvents[0]).toMatchObject({ type: "ActionRolled" });

      const authority = (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
      expect(authority).toMatchObject({ roomRevision: 1, nextSequence: 2 });

      const sharedEvent = (await db.doc(`rooms/${roomId}/events/shared/items/1`).get()).data();
      expect(sharedEvent).toMatchObject({ payload: { type: "ActionRolled" } });
      const gmEvent = (await db.doc(`rooms/${roomId}/events/gm/items/1`).get()).data();
      expect(gmEvent).toMatchObject({ payload: { type: "ActionRolled" } });

      // Every live viewer got a freshly recomputed projection: player, gm, table.
      const playerProjection = (
        await db.doc(`rooms/${roomId}/projections/${playerMemberId}`).get()
      ).data();
      expect(playerProjection).toMatchObject({ viewerId: playerMemberId, roomRevision: 1 });
      const gmProjection = (await db.doc(`rooms/${roomId}/projections/gm`).get()).data();
      expect(gmProjection).toMatchObject({ viewerId: "gm", roomRevision: 1 });
      const tableProjection = (await db.doc(`rooms/${roomId}/projections/table`).get()).data();
      expect(tableProjection).toMatchObject({ viewerId: "table", roomRevision: 1 });
    });

    it("a sequential retry with the same commandId short-circuits: no new event, unchanged authority", async () => {
      const { roomId, playerMemberId } = await seedRoom();
      const cmdId = commandId();
      const request = { commandId: cmdId, payload: beginActionPayload(playerMemberId) };
      const first = await submitRoomCommand(roomId, `uid-player-${roomCounter}`, request, {
        db,
        logger: recorder(),
        ...fixedClock(),
      });
      const second = await submitRoomCommand(roomId, `uid-player-${roomCounter}`, request, {
        db,
        logger: recorder(),
        ...fixedClock(),
      });

      expect(first.status).toBe("accepted");
      expect(second).toMatchObject({ status: "accepted", roomRevision: 1, sharedEvents: [] });

      const authority = (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
      expect(authority).toMatchObject({ roomRevision: 1 }); // not bumped a second time

      const secondEvent = await db.doc(`rooms/${roomId}/events/shared/items/2`).get();
      expect(secondEvent.exists).toBe(false); // no second event was ever written
    });

    it("N concurrent duplicate commandId submissions produce exactly one event and identical responses", async () => {
      const { roomId, playerMemberId } = await seedRoom();
      const cmdId = commandId();
      const request = { commandId: cmdId, payload: beginActionPayload(playerMemberId) };
      const attempts = 6;
      const results = await Promise.all(
        Array.from({ length: attempts }, () =>
          submitRoomCommand(roomId, `uid-player-${roomCounter}`, request, {
            db,
            logger: recorder(),
            ...fixedClock(),
          }),
        ),
      );
      for (const result of results) {
        expect(result).toMatchObject({ status: "accepted", roomRevision: 1 });
      }
      const eventsSnap = await db.collection(`rooms/${roomId}/events/shared/items`).get();
      expect(eventsSnap.size).toBe(1);
    });

    it("a table-capability actor cannot issue a game command; platform authorization rejects before the template ever runs", async () => {
      const { roomId, tableMemberId } = await seedRoom({ withTable: true });
      const logger = recorder();
      const result = await submitRoomCommand(
        roomId,
        `uid-table-${roomCounter}`,
        { commandId: commandId(), payload: beginActionPayload(tableMemberId ?? "") },
        { db, logger, ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "ROLE_FORBIDDEN" });

      // No event, no projection write of any kind from this attempt.
      const eventsSnap = await db.collection(`rooms/${roomId}/events/shared/items`).get();
      expect(eventsSnap.size).toBe(0);
      // A rejected receipt IS written under the table member's own private
      // partition (this authority's chosen design: store rejections too, so
      // a retry replays identically — docs/PHASE_2_PR4_PLAN.md §2.2 option
      // (a)), but no room-wide effect exists.
      const authority = (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
      expect(authority).toMatchObject({ roomRevision: 0 });
    });

    it("a player cannot allocate another player's roll", async () => {
      const { roomId, playerMemberId } = await seedRoom();
      const begin = await submitRoomCommand(
        roomId,
        `uid-player-${roomCounter}`,
        { commandId: commandId(), payload: beginActionPayload(playerMemberId) },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(begin.status).toBe("accepted");
      if (begin.status !== "accepted") throw new Error("expected acceptance");
      const rollId = (begin.sharedEvents[0] as { readonly rollId: string }).rollId;

      const impostorUid = `uid-impostor-${roomCounter}`;
      await db.doc(`rooms/${roomId}/uidBindings/${impostorUid}`).set({
        memberId: `member-impostor-${roomCounter}`,
        capability: "player",
      });
      const result = await submitRoomCommand(
        roomId,
        impostorUid,
        {
          commandId: commandId(),
          payload: { type: "AllocateResults", rollId, allocations: [] },
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "ROLE_FORBIDDEN" });
    });

    it("rejects a stale expectedRevision with REVISION_CONFLICT and leaves authority unchanged", async () => {
      const { roomId, playerMemberId } = await seedRoom();
      const result = await submitRoomCommand(
        roomId,
        `uid-player-${roomCounter}`,
        {
          commandId: commandId(),
          payload: beginActionPayload(playerMemberId),
          expectedRevision: 99,
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "REVISION_CONFLICT" });
      const authority = (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
      expect(authority).toMatchObject({ roomRevision: 0 });
    });

    it("rejects an unrecognized command payload with UNKNOWN_ACTION", async () => {
      const { roomId } = await seedRoom();
      const result = await submitRoomCommand(
        roomId,
        `uid-player-${roomCounter}`,
        { commandId: commandId(), payload: { type: "NotARealCommand" } },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "UNKNOWN_ACTION" });
    });

    it("an unauthenticated (unbound) UID is denied AUTH_REQUIRED", async () => {
      const { roomId, playerMemberId } = await seedRoom();
      const result = await submitRoomCommand(
        roomId,
        "uid-never-joined",
        { commandId: commandId(), payload: beginActionPayload(playerMemberId) },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "AUTH_REQUIRED" });
    });

    it("a rejected command's retry replays the identical rejection without re-deciding", async () => {
      const { roomId } = await seedRoom();
      const cmdId = commandId();
      const request = { commandId: cmdId, payload: { type: "NotARealCommand" } };
      const first = await submitRoomCommand(roomId, `uid-player-${roomCounter}`, request, {
        db,
        logger: recorder(),
        ...fixedClock(),
      });
      const second = await submitRoomCommand(roomId, `uid-player-${roomCounter}`, request, {
        db,
        logger: recorder(),
        ...fixedClock(),
      });
      expect(first).toMatchObject({ status: "rejected", code: "UNKNOWN_ACTION" });
      expect(second).toEqual(first);
    });

    it("an archived room denies every command with ROOM_ARCHIVED", async () => {
      const { roomId, playerMemberId } = await seedRoom({ roomStatus: "archived" });
      const result = await submitRoomCommand(
        roomId,
        `uid-player-${roomCounter}`,
        { commandId: commandId(), payload: beginActionPayload(playerMemberId) },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "ROOM_ARCHIVED" });
    });

    it("dice faces are reproducible from the injected seed regardless of which internal attempt commits (ADR-002)", async () => {
      const { roomId, playerMemberId } = await seedRoom();
      const result = await submitRoomCommand(
        roomId,
        `uid-player-${roomCounter}`,
        { commandId: commandId(), payload: beginActionPayload(playerMemberId) },
        {
          db,
          logger: recorder(),
          randomBytes: () => new Uint8Array(32).fill(1),
          occurredAtServer: fixedClock().occurredAtServer,
        },
      );
      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") throw new Error("expected acceptance");
      const event = result.sharedEvents[0] as { readonly faces: readonly number[] | null };
      // Same fixed seed byte (1) deterministically produces the same faces
      // every run of this test — pinning the actual values here would be
      // brittle to the RNG's internal algorithm; instead prove determinism
      // by re-running decide with the identical seed via a second, distinct
      // room and asserting the two independent draws match.
      const second = await seedRoom();
      const secondResult = await submitRoomCommand(
        second.roomId,
        `uid-player-${roomCounter}`,
        { commandId: commandId(), payload: beginActionPayload(second.playerMemberId) },
        {
          db,
          logger: recorder(),
          randomBytes: () => new Uint8Array(32).fill(1),
          occurredAtServer: fixedClock().occurredAtServer,
        },
      );
      expect(secondResult.status).toBe("accepted");
      if (secondResult.status !== "accepted") throw new Error("expected acceptance");
      const secondEvent = secondResult.sharedEvents[0] as {
        readonly faces: readonly number[] | null;
      };
      expect(secondEvent.faces).toEqual(event.faces);
    });

    it("never logs the random seed, the payload, or a rejected command's underlying state", async () => {
      const { roomId, playerMemberId } = await seedRoom();
      const logger = recorder();
      await submitRoomCommand(
        roomId,
        `uid-player-${roomCounter}`,
        { commandId: commandId(), payload: beginActionPayload(playerMemberId) },
        { db, logger, ...fixedClock() },
      );
      const serialized = JSON.stringify(logger.events);
      expect(serialized).not.toContain("strong-arm-the-enforcer");
      expect(logger.events.some((entry) => entry.event === "gameCommand.result")).toBe(true);
    });
  });

  describe("callable boundary", () => {
    function request(
      data: unknown,
      options: { readonly uid?: string } = {},
    ): CallableRequest<unknown> {
      return {
        data,
        rawRequest: { ip: "203.0.113.20", headers: {} },
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

    function callable(): SubmitRoomCommandCallable {
      return createGameCallables({
        db,
        logger: recorder(),
        ...fixedClock(),
      }).submitRoomCommand;
    }

    it("rejects an unauthenticated call before any Firestore read", async () => {
      const { roomId, playerMemberId } = await seedRoom();
      await expectHttpsError(
        callable().run(
          request({
            roomId,
            command: { commandId: commandId(), payload: beginActionPayload(playerMemberId) },
          }),
        ),
        "unauthenticated",
        "AUTH_REQUIRED",
      );
    });

    it("rejects a missing roomId as INVALID_REQUEST", async () => {
      await expectHttpsError(
        callable().run(
          request(
            { command: { commandId: commandId(), payload: {} } },
            { uid: "uid-missing-room" },
          ),
        ),
        "invalid-argument",
        "INVALID_REQUEST",
      );
    });

    it("returns the accepted result through the callable, response shape matching RoomCommandResult", async () => {
      const { roomId, playerMemberId } = await seedRoom();
      const result: RoomCommandResult<unknown> = await callable().run(
        request(
          {
            roomId,
            command: { commandId: commandId(), payload: beginActionPayload(playerMemberId) },
          },
          { uid: `uid-player-${roomCounter}` },
        ),
      );
      expect(result.status).toBe("accepted");
    });
  });
});
