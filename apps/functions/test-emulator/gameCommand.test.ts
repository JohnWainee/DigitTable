import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { eatTheReichTemplate, ORIGINAL_MISSION } from "@digitable/template-eat-the-reich";
import { asMemberId, asRoomId, type RoomCommandResult } from "@digitable/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { submitRoomCommand } from "../src/gameCommandAuthority.js";
import { createGameCallables, type SubmitRoomCommandCallable } from "../src/gameCallables.js";
import type { GameCommandLogger } from "../src/gameCommandAuthority.js";

const TEMPLATE_ID = eatTheReichTemplate.manifest.templateId;
const TEMPLATE_VERSION = eatTheReichTemplate.manifest.templateVersion;

/** The one roster character every test claims; the roster is B02's original content. */
const CHARACTER_ID = "rook";
/** A note only the GM and the actor may ever see (`ActionDeclared` is redacted for the shared partition). */
const PRIVATE_NOTE = "private-declaration-note-never-logged";

/**
 * Board task A04's game-command authority proof, run against the real
 * Firestore emulator the same way `admission.test.ts`/`createRoom.test.ts`
 * prove their transactions: the Admin SDK talks to the emulator exactly as
 * a deployed Function would.
 *
 * Issue #14 integration: these fixtures were originally written against
 * the placeholder template, whose `BeginAction` rolled dice immediately
 * against a pre-assigned character. B02-B05's real template splits declare
 * (`BeginAction`, player, no dice) from roll (`ReviewAction`, GM-only,
 * server-seeded dice) and requires a claimed character and an active scene
 * first, so `seedRoom` now runs the real `LoadScene` + `ClaimCharacter`
 * commands through this same authority before each scenario. Every
 * revision/sequence expectation is relative to that prepared baseline.
 */
describe("submitRoomCommand (apps/functions, board task A04)", () => {
  let db: Firestore;
  const RUN = Date.now().toString(36);
  let roomCounter = 0;

  beforeAll(() => {
    if (getApps().length === 0) initializeApp();
    db = getFirestore();
  });

  // Must be a real UUID now that gameCommandAuthority.ts validates commandId
  // shape (independent review finding).
  const commandId = (): string => crypto.randomUUID();

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

  function loadScenePayload(): Record<string, unknown> {
    const [opening] = ORIGINAL_MISSION;
    if (!opening) throw new Error("ORIGINAL_MISSION has no opening scene");
    // Same mapping `apps/web`'s GM console uses: the GM-facing briefing is
    // source-only and never part of the command.
    const { gmBriefing: _gmBriefing, ...payload } = opening;
    return { type: "LoadScene", ...payload };
  }

  interface SeededRoom {
    readonly roomId: string;
    readonly gmMemberId: string;
    readonly playerMemberId: string;
    readonly tableMemberId: string | null;
    readonly gmUid: string;
    readonly playerUid: string;
    readonly tableUid: string | null;
    /** `roomRevision` after the prepared `LoadScene` + `ClaimCharacter` commands (0 when `prepare: false`). */
    readonly roomRevision: number;
    /** The next event sequence the room will assign (1 when `prepare: false`). */
    readonly nextSequence: number;
    /** Shared-partition event count after preparation. */
    readonly sharedEventCount: number;
  }

  /**
   * Seeds a fresh, isolated room with a real ETR campaign state: one GM, one
   * player, and (optionally) a table seat. Unless `prepare: false`, the GM
   * then loads the opening scene and the player claims a character through
   * the real authority, so `BeginAction` is legal afterwards.
   */
  async function seedRoom(
    options: {
      readonly withTable?: boolean;
      readonly roomStatus?: "active" | "archived";
      readonly prepare?: boolean;
    } = {},
  ): Promise<SeededRoom> {
    roomCounter += 1;
    const roomId = `room-gamecmd-${RUN}-${roomCounter}`;
    const gmMemberId = `member-gm-${RUN}-${roomCounter}`;
    const playerMemberId = `member-player-${RUN}-${roomCounter}`;
    const tableMemberId = options.withTable ? `member-table-${RUN}-${roomCounter}` : null;
    const gmUid = `uid-gm-${roomCounter}`;
    const playerUid = `uid-player-${roomCounter}`;
    const tableUid = options.withTable ? `uid-table-${roomCounter}` : null;

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
      db.doc(`rooms/${roomId}/uidBindings/${gmUid}`).set({
        memberId: gmMemberId,
        capability: "gm",
      }),
      db.doc(`rooms/${roomId}/bindings/${gmMemberId}`).set({
        memberId: gmMemberId,
        uid: gmUid,
        capability: "gm",
      }),
      db.doc(`rooms/${roomId}/uidBindings/${playerUid}`).set({
        memberId: playerMemberId,
        capability: "player",
      }),
      db.doc(`rooms/${roomId}/bindings/${playerMemberId}`).set({
        memberId: playerMemberId,
        uid: playerUid,
        capability: "player",
      }),
    ];
    if (tableMemberId !== null && tableUid !== null) {
      writes.push(
        db.doc(`rooms/${roomId}/uidBindings/${tableUid}`).set({
          memberId: tableMemberId,
          capability: "table",
        }),
        db.doc(`rooms/${roomId}/bindings/${tableMemberId}`).set({
          memberId: tableMemberId,
          uid: tableUid,
          capability: "table",
        }),
      );
    }
    await Promise.all(writes);

    if (options.prepare !== false) {
      const loaded = await submitRoomCommand(
        roomId,
        gmUid,
        {
          commandId: commandId(),
          payload: loadScenePayload(),
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      if (loaded.status !== "accepted") {
        throw new Error(`seedRoom: LoadScene rejected: ${loaded.code} ${loaded.message}`);
      }
      const claimed = await submitRoomCommand(
        roomId,
        playerUid,
        {
          commandId: commandId(),
          payload: { type: "ClaimCharacter", characterId: CHARACTER_ID },
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      if (claimed.status !== "accepted") {
        throw new Error(`seedRoom: ClaimCharacter rejected: ${claimed.code} ${claimed.message}`);
      }
    }

    const prepared = (await db.doc(`rooms/${roomId}/authority/current`).get()).data() as {
      readonly roomRevision: number;
      readonly nextSequence: number;
    };
    const sharedEvents = await db.collection(`rooms/${roomId}/events/shared/items`).get();
    return {
      roomId,
      gmMemberId,
      playerMemberId,
      tableMemberId,
      gmUid,
      playerUid,
      tableUid,
      roomRevision: prepared.roomRevision,
      nextSequence: prepared.nextSequence,
      sharedEventCount: sharedEvents.size,
    };
  }

  /** The real B03 declaration shape: a stat-only pool, no items/abilities/bonus claims/engaged Threats. */
  function beginActionPayload(): Record<string, unknown> {
    return {
      type: "BeginAction",
      characterId: CHARACTER_ID,
      stat: "SNEAK",
      itemIds: [],
      abilityIds: [],
      bonusClaimIds: [],
      engagedThreatIds: [],
      note: PRIVATE_NOTE,
    };
  }

  function reviewActionPayload(rollId: string): Record<string, unknown> {
    return { type: "ReviewAction", rollId, approvedClaimIds: [], engagedThreatIds: [] };
  }

  async function declare(
    room: SeededRoom,
    deps: Parameters<typeof submitRoomCommand>[3] = { db, logger: recorder(), ...fixedClock() },
  ): Promise<string> {
    const begin = await submitRoomCommand(
      room.roomId,
      room.playerUid,
      {
        commandId: commandId(),
        payload: beginActionPayload(),
        templateId: TEMPLATE_ID,
        templateVersion: TEMPLATE_VERSION,
      },
      deps,
    );
    expect(begin.status).toBe("accepted");
    if (begin.status !== "accepted") throw new Error("expected acceptance");
    const declared = begin.sharedEvents[0] as { readonly rollId: string } | undefined;
    if (!declared) throw new Error("BeginAction emitted no shared event");
    return declared.rollId;
  }

  describe("engine-level transaction", () => {
    it("commits authority, receipt, shared+gm events, and every live viewer's projection atomically", async () => {
      const room = await seedRoom({ withTable: true });
      const { roomId, playerMemberId } = room;
      const logger = recorder();
      const result = await submitRoomCommand(
        roomId,
        room.playerUid,
        {
          commandId: commandId(),
          payload: beginActionPayload(),
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger, ...fixedClock() },
      );

      expect(result.status).toBe("accepted");
      if (result.status !== "accepted") throw new Error("expected acceptance");
      const revision = room.roomRevision + 1;
      expect(result.roomRevision).toBe(revision);
      expect(result.sharedEvents).toHaveLength(1);
      // The shared copy is the redacted one (B03): no stat, no note.
      expect(result.sharedEvents[0]).toMatchObject({
        type: "ActionDeclared",
        characterId: CHARACTER_ID,
        stat: "none",
        note: null,
      });

      const authority = (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
      expect(authority).toMatchObject({
        roomRevision: revision,
        nextSequence: room.nextSequence + 1,
      });

      const sequence = room.nextSequence;
      const sharedEvent = (
        await db.doc(`rooms/${roomId}/events/shared/items/${sequence}`).get()
      ).data();
      expect(sharedEvent).toMatchObject({ payload: { type: "ActionDeclared", note: null } });
      const gmEvent = (await db.doc(`rooms/${roomId}/events/gm/items/${sequence}`).get()).data();
      expect(gmEvent).toMatchObject({
        payload: { type: "ActionDeclared", stat: "SNEAK", note: PRIVATE_NOTE },
      });

      // Every live viewer got a freshly recomputed projection: player, gm, table.
      const playerProjection = (
        await db.doc(`rooms/${roomId}/projections/${playerMemberId}`).get()
      ).data();
      expect(playerProjection).toMatchObject({ viewerId: playerMemberId, roomRevision: revision });
      const gmProjection = (await db.doc(`rooms/${roomId}/projections/gm`).get()).data();
      expect(gmProjection).toMatchObject({ viewerId: "gm", roomRevision: revision });
      const tableProjection = (await db.doc(`rooms/${roomId}/projections/table`).get()).data();
      expect(tableProjection).toMatchObject({ viewerId: "table", roomRevision: revision });
      // The table's projection never carries the actor's private declaration.
      expect(JSON.stringify(tableProjection)).not.toContain(PRIVATE_NOTE);
    });

    it("a sequential retry with the same commandId short-circuits: no new event, unchanged authority", async () => {
      const room = await seedRoom();
      const { roomId } = room;
      const cmdId = commandId();
      const request = {
        commandId: cmdId,
        payload: beginActionPayload(),
        templateId: TEMPLATE_ID,
        templateVersion: TEMPLATE_VERSION,
      };
      const first = await submitRoomCommand(roomId, room.playerUid, request, {
        db,
        logger: recorder(),
        ...fixedClock(),
      });
      const second = await submitRoomCommand(roomId, room.playerUid, request, {
        db,
        logger: recorder(),
        ...fixedClock(),
      });

      const revision = room.roomRevision + 1;
      expect(first.status).toBe("accepted");
      expect(second).toMatchObject({
        status: "accepted",
        roomRevision: revision,
        sharedEvents: [],
      });

      const authority = (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
      expect(authority).toMatchObject({ roomRevision: revision }); // not bumped a second time

      const secondEvent = await db
        .doc(`rooms/${roomId}/events/shared/items/${room.nextSequence + 1}`)
        .get();
      expect(secondEvent.exists).toBe(false); // no second event was ever written
    });

    it("N concurrent duplicate commandId submissions produce exactly one event and identical responses", async () => {
      const room = await seedRoom();
      const { roomId } = room;
      const cmdId = commandId();
      const request = {
        commandId: cmdId,
        payload: beginActionPayload(),
        templateId: TEMPLATE_ID,
        templateVersion: TEMPLATE_VERSION,
      };
      const attempts = 6;
      const results = await Promise.all(
        Array.from({ length: attempts }, () =>
          submitRoomCommand(roomId, room.playerUid, request, {
            db,
            logger: recorder(),
            ...fixedClock(),
          }),
        ),
      );
      for (const result of results) {
        expect(result).toMatchObject({ status: "accepted", roomRevision: room.roomRevision + 1 });
      }
      const eventsSnap = await db.collection(`rooms/${roomId}/events/shared/items`).get();
      expect(eventsSnap.size).toBe(room.sharedEventCount + 1);
    });

    it("a table-capability actor cannot issue a game command; platform authorization rejects before the template ever runs", async () => {
      const room = await seedRoom({ withTable: true });
      const { roomId } = room;
      const logger = recorder();
      const result = await submitRoomCommand(
        roomId,
        room.tableUid ?? "",
        {
          commandId: commandId(),
          payload: beginActionPayload(),
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger, ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "ROLE_FORBIDDEN" });

      // No event, no projection write of any kind from this attempt.
      const eventsSnap = await db.collection(`rooms/${roomId}/events/shared/items`).get();
      expect(eventsSnap.size).toBe(room.sharedEventCount);
      // A rejected receipt IS written under the table member's own private
      // partition (this authority's chosen design: store rejections too, so
      // a retry replays identically — docs/PHASE_2_PR4_PLAN.md §2.2 option
      // (a)), but no room-wide effect exists.
      const authority = (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
      expect(authority).toMatchObject({ roomRevision: room.roomRevision });
    });

    it("a player cannot allocate another player's roll", async () => {
      const room = await seedRoom();
      const { roomId } = room;
      const rollId = await declare(room);

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
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "ROLE_FORBIDDEN" });
    });

    it("a player cannot roll their own declaration: ReviewAction is GM-only (B03)", async () => {
      const room = await seedRoom();
      const rollId = await declare(room);
      const result = await submitRoomCommand(
        room.roomId,
        room.playerUid,
        {
          commandId: commandId(),
          payload: reviewActionPayload(rollId),
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "ROLE_FORBIDDEN" });
    });

    it("rejects a declaration with no active scene (the real template's own precondition)", async () => {
      const room = await seedRoom({ prepare: false });
      const claimed = await submitRoomCommand(
        room.roomId,
        room.playerUid,
        {
          commandId: commandId(),
          payload: { type: "ClaimCharacter", characterId: CHARACTER_ID },
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(claimed.status).toBe("accepted");
      const result = await submitRoomCommand(
        room.roomId,
        room.playerUid,
        {
          commandId: commandId(),
          payload: beginActionPayload(),
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "UNKNOWN_ACTION" });
    });

    it("rejects a stale expectedRevision with REVISION_CONFLICT and leaves authority unchanged", async () => {
      const room = await seedRoom();
      const { roomId } = room;
      const result = await submitRoomCommand(
        roomId,
        room.playerUid,
        {
          commandId: commandId(),
          payload: beginActionPayload(),
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
          expectedRevision: 99,
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "REVISION_CONFLICT" });
      const authority = (await db.doc(`rooms/${roomId}/authority/current`).get()).data();
      expect(authority).toMatchObject({ roomRevision: room.roomRevision });
    });

    it("rejects an unrecognized command payload with UNKNOWN_ACTION", async () => {
      const room = await seedRoom();
      const result = await submitRoomCommand(
        room.roomId,
        room.playerUid,
        {
          commandId: commandId(),
          payload: { type: "NotARealCommand" },
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "UNKNOWN_ACTION" });
    });

    it("an unauthenticated (unbound) UID is denied AUTH_REQUIRED", async () => {
      const room = await seedRoom();
      const result = await submitRoomCommand(
        room.roomId,
        "uid-never-joined",
        {
          commandId: commandId(),
          payload: beginActionPayload(),
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "AUTH_REQUIRED" });
    });

    it("a rejected command's retry replays the identical rejection without re-deciding", async () => {
      const room = await seedRoom();
      const cmdId = commandId();
      const request = {
        commandId: cmdId,
        payload: { type: "NotARealCommand" },
        templateId: TEMPLATE_ID,
        templateVersion: TEMPLATE_VERSION,
      };
      const first = await submitRoomCommand(room.roomId, room.playerUid, request, {
        db,
        logger: recorder(),
        ...fixedClock(),
      });
      const second = await submitRoomCommand(room.roomId, room.playerUid, request, {
        db,
        logger: recorder(),
        ...fixedClock(),
      });
      expect(first).toMatchObject({ status: "rejected", code: "UNKNOWN_ACTION" });
      expect(second).toEqual(first);
    });

    it("an archived room denies every command with ROOM_ARCHIVED", async () => {
      // No preparation: the platform guard rejects before the template
      // could ever load a scene or claim a character in an archived room.
      const room = await seedRoom({ roomStatus: "archived", prepare: false });
      const result = await submitRoomCommand(
        room.roomId,
        room.playerUid,
        {
          commandId: commandId(),
          payload: beginActionPayload(),
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "ROOM_ARCHIVED" });
    });

    it("rejects a client-asserted templateVersion that doesn't match the room's own (independent review finding: this guard was previously unreachable)", async () => {
      const room = await seedRoom();
      const result = await submitRoomCommand(
        room.roomId,
        room.playerUid,
        {
          commandId: commandId(),
          payload: beginActionPayload(),
          templateId: TEMPLATE_ID,
          templateVersion: "0.0.0-stale-client-build",
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "TEMPLATE_VERSION_MISMATCH" });
    });

    it("AUTH_REQUIRED fires before any authority/bindings data is read, even against a room with corrupted data (independent review finding)", async () => {
      const room = await seedRoom();
      // Corrupt the room's authority document *after* seeding it validly —
      // if capability resolution ran after this read (the pre-fix order),
      // an unauthenticated-for-this-room caller would get ROOM_DATA_INVALID
      // instead of AUTH_REQUIRED, disclosing that the room exists and is
      // corrupted to a caller who isn't even a member.
      await db
        .doc(`rooms/${room.roomId}/authority/current`)
        .update({ roomStatus: "not-a-real-status" });
      const result = await submitRoomCommand(
        room.roomId,
        "uid-never-joined-corrupted-room",
        {
          commandId: commandId(),
          payload: beginActionPayload(),
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger: recorder(), ...fixedClock() },
      );
      expect(result).toMatchObject({ status: "rejected", code: "AUTH_REQUIRED" });
    });

    it("dice faces are reproducible from the injected seed regardless of which internal attempt commits (ADR-002)", async () => {
      // B03: the dice are drawn by the GM's `ReviewAction`, not the
      // player's declaration. Same fixed seed byte (1) deterministically
      // produces the same faces every run — pinning the actual values here
      // would be brittle to the RNG's internal algorithm; instead prove
      // determinism by re-running the identical declare -> review pair in a
      // second, distinct room and asserting the two independent draws match.
      async function declareAndRoll(room: SeededRoom): Promise<readonly number[]> {
        const rollId = await declare(room);
        const reviewed = await submitRoomCommand(
          room.roomId,
          room.gmUid,
          {
            commandId: commandId(),
            payload: reviewActionPayload(rollId),
            templateId: TEMPLATE_ID,
            templateVersion: TEMPLATE_VERSION,
          },
          {
            db,
            logger: recorder(),
            randomBytes: () => new Uint8Array(32).fill(1),
            occurredAtServer: fixedClock().occurredAtServer,
          },
        );
        expect(reviewed.status).toBe("accepted");
        if (reviewed.status !== "accepted") throw new Error("expected acceptance");
        const rolled = reviewed.sharedEvents[0] as
          { readonly type: string; readonly playerFaces: readonly number[] } | undefined;
        if (!rolled) throw new Error("ReviewAction emitted no shared event");
        expect(rolled.type).toBe("ActionRolled");
        expect(rolled.playerFaces.length).toBeGreaterThan(0);
        return rolled.playerFaces;
      }

      const first = await declareAndRoll(await seedRoom());
      const second = await declareAndRoll(await seedRoom());
      expect(second).toEqual(first);
    });

    it("never logs the payload of an accepted or a rejected command", async () => {
      const room = await seedRoom();
      const logger = recorder();
      await submitRoomCommand(
        room.roomId,
        room.playerUid,
        {
          commandId: commandId(),
          payload: beginActionPayload(),
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger, ...fixedClock() },
      );
      // Integration review finding: the rejected path logs through the same
      // sink and must be just as opaque — a rejection line carries the
      // stable code, never the command that earned it.
      const rejected = await submitRoomCommand(
        room.roomId,
        room.playerUid,
        {
          commandId: commandId(),
          payload: { type: "NotARealCommand", note: PRIVATE_NOTE },
          templateId: TEMPLATE_ID,
          templateVersion: TEMPLATE_VERSION,
        },
        { db, logger, ...fixedClock() },
      );
      expect(rejected).toMatchObject({ status: "rejected", code: "UNKNOWN_ACTION" });

      const serialized = JSON.stringify(logger.events);
      expect(serialized).not.toContain(PRIVATE_NOTE);
      expect(serialized).not.toContain("SNEAK");
      expect(serialized).not.toContain("NotARealCommand");
      const results = logger.events.filter((entry) => entry.event === "gameCommand.result");
      expect(results.map((entry) => entry.fields.status)).toEqual(["accepted", "rejected"]);
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
      const room = await seedRoom();
      await expectHttpsError(
        callable().run(
          request({
            roomId: room.roomId,
            command: {
              commandId: commandId(),
              payload: beginActionPayload(),
              templateId: TEMPLATE_ID,
              templateVersion: TEMPLATE_VERSION,
            },
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
      const room = await seedRoom();
      const result: RoomCommandResult<unknown> = await callable().run(
        request(
          {
            roomId: room.roomId,
            command: {
              commandId: commandId(),
              payload: beginActionPayload(),
              templateId: TEMPLATE_ID,
              templateVersion: TEMPLATE_VERSION,
            },
          },
          { uid: room.playerUid },
        ),
      );
      expect(result.status).toBe("accepted");
    });
  });
});
