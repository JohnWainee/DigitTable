import { deleteApp, initializeApp, type FirebaseApp } from "firebase/app";
import { asCommandId, asMemberId, asRoomId } from "@digitable/contracts";
import { ORIGINAL_MISSION, type EatTheReichCommand } from "@digitable/template-eat-the-reich";
import { createEmulatorTestEnvironment, type RulesTestEnvironment } from "@digitable/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  FirebaseSessionClient,
  type SessionEmulatorConfig,
} from "../src/session/FirebaseSessionClient.js";
import { FirebaseRoomRepository } from "../src/repository/FirebaseRoomRepository.js";
import { CommandOutbox } from "../src/repository/commandOutbox.js";
import { MemoryStorage } from "../test/memoryStorage.js";

/**
 * Board task A05's required proof: the client's real callable HTTP/SDK
 * transport (Firebase JS SDK talking to the Functions/Firestore/Auth
 * emulators over the network), not `apps/functions`'s own handler-level
 * `.run()` calls — those already prove the trusted transaction logic;
 * this proves the client can actually reach it the way a browser would.
 * Run via `npm run test:emulator` at the repo root, which now starts
 * `auth,firestore,database,functions` (previously `functions` was never
 * started for any test in this repository).
 */
describe("FirebaseSessionClient + FirebaseRoomRepository (apps/web, board task A05)", () => {
  const RUN = Date.now().toString(36);
  const emulator: SessionEmulatorConfig = {
    auth: { url: "http://127.0.0.1:9099" },
    functions: { host: "127.0.0.1", port: 5001 },
    firestore: { host: "127.0.0.1", port: 8080 },
  };

  // Two independent Firebase apps simulate two independent browser tabs
  // (two anonymous identities) in one test process — Firebase Auth's
  // default app can only ever be signed in as one user at a time, and this
  // proves `FirebaseSessionClient`/`FirebaseRoomRepository` are actually
  // bound to the `app` instance they were constructed with rather than an
  // ambient default (see `anonymousAuth.ts`'s doc comment for the bug this
  // fixes).
  let gmApp: FirebaseApp;
  let playerApp: FirebaseApp;
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const config = {
      apiKey: "demo-api-key",
      authDomain: "demo-digitable.firebaseapp.com",
      projectId: "demo-digitable",
      appId: "demo-app-id",
    };
    gmApp = initializeApp(config, `gm-${RUN}`);
    playerApp = initializeApp(config, `player-${RUN}`);
    testEnv = await createEmulatorTestEnvironment();
  });

  afterAll(async () => {
    await Promise.all([deleteApp(gmApp), deleteApp(playerApp), testEnv.cleanup()]);
  });

  it("creates a room, joins a player, dispatches a real command through the callable transport, and both viewers see updated projections", async () => {
    const gmSession = new FirebaseSessionClient(gmApp, emulator);
    const playerSession = new FirebaseSessionClient(playerApp, emulator);

    const created = await gmSession.createRoom({
      requestId: `req-${RUN}-create`,
      sessionName: "A05 Integration Cell",
      passphrase: "correct horse battery staple",
      creatorDisplayName: "Director",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(`createRoom failed: ${created.code} ${created.message}`);
    expect(created.recoveryCode).not.toBeNull();
    expect(created.tableCode).not.toBeNull();

    const joined = await playerSession.joinRoom({
      requestId: `req-${RUN}-join`,
      roomCode: created.roomCode,
      passphrase: "correct horse battery staple",
      requestedCapability: "player",
      displayName: "Rook",
    });
    expect(joined.ok).toBe(true);
    if (!joined.ok) throw new Error(`joinRoom failed: ${joined.code} ${joined.message}`);
    expect(joined.roomId).toBe(created.roomId);

    const roomId = asRoomId(created.roomId);
    const storage = new MemoryStorage();
    const playerRepo = new FirebaseRoomRepository(
      playerApp,
      roomId,
      "player",
      {
        functions: emulator.functions,
        firestore: emulator.firestore,
      },
      storage,
    );

    const playerMemberId = asMemberId(joined.memberId);
    const outbox = new CommandOutbox(
      storage,
      "demo-digitable:127.0.0.1:8080",
      await playerSession.ensureSignedIn(),
      roomId,
      playerMemberId,
    );

    // B02-B05's real roster/action loop (C06): a character is claimed via
    // `ClaimCharacter`, not pre-assigned at room creation (see
    // `templates/eat-the-reich/src/engine.ts`'s `initialState` doc
    // comment) — claim one of the real roster characters before the real
    // `BeginAction` shape (stat/itemIds/abilityIds/bonusClaimIds/
    // engagedThreatIds/note) can be dispatched for it.
    const claimRequest = {
      commandId: asCommandId(crypto.randomUUID()),
      payload: { type: "ClaimCharacter", characterId: "rook" } satisfies EatTheReichCommand,
    };
    // Failure injection: model a command persisted immediately before the
    // browser lost its response. With no receipt yet, reconnect retries the
    // exact ID and the authority accepts it once.
    outbox.remember(claimRequest);
    await playerRepo.reconcilePending(playerMemberId);
    expect(outbox.read()).toEqual([]);
    const afterClaim = await playerRepo.getProjection({
      roomId,
      viewerId: playerMemberId,
      capability: "player",
    });
    expect(afterClaim.roomRevision).toBe(1);

    // Failure injection: model a lost response after commit by restoring
    // the already-accepted request to the browser outbox. Reconciliation
    // finds the private receipt and clears it without another revision.
    outbox.remember(claimRequest);
    await playerRepo.reconcilePending(playerMemberId);
    expect(outbox.read()).toEqual([]);
    const afterReceiptReconciliation = await playerRepo.getProjection({
      roomId,
      viewerId: playerMemberId,
      capability: "player",
    });
    expect(afterReceiptReconciliation.roomRevision).toBe(1);

    const gmRepo = new FirebaseRoomRepository(
      gmApp,
      roomId,
      "gm",
      {
        functions: emulator.functions,
        firestore: emulator.firestore,
      },
      storage,
    );
    expect(
      (
        await gmRepo.dispatch(asMemberId(created.memberId), {
          commandId: asCommandId(crypto.randomUUID()),
          payload: { type: "LoadScene", ...ORIGINAL_MISSION[0]! },
        })
      ).status,
    ).toBe("accepted");

    const beginAction: EatTheReichCommand = {
      type: "BeginAction",
      characterId: "rook",
      stat: "BRAWL",
      itemIds: [],
      abilityIds: [],
      bonusClaimIds: [],
      engagedThreatIds: [],
      note: null,
    };
    const dispatchResult = await playerRepo.dispatch(playerMemberId, {
      commandId: asCommandId(crypto.randomUUID()),
      payload: beginAction,
    });
    expect(dispatchResult.status).toBe("accepted");
    if (dispatchResult.status !== "accepted") {
      throw new Error(`dispatch failed: ${dispatchResult.code} ${dispatchResult.message}`);
    }
    expect(dispatchResult.roomRevision).toBe(3);
    expect(dispatchResult.sharedEvents).toHaveLength(1);

    // The player reads their own updated projection through the real
    // Firestore SDK transport — never reconstructed from an event tail.
    const playerProjection = await playerRepo.getProjection({
      roomId,
      viewerId: playerMemberId,
      capability: "player",
    });
    expect(playerProjection.roomRevision).toBe(3);

    // The GM reads the same room's GM projection through its own
    // independent identity/session, proving both viewers see the one
    // atomically-committed update.
    const gmProjection = await gmRepo.getProjection({ roomId, viewerId: "gm", capability: "gm" });
    expect(gmProjection.roomRevision).toBe(3);
  });

  it("rejects an unrecognized room code through the real callable boundary with a stable error code", async () => {
    const session = new FirebaseSessionClient(playerApp, emulator);
    const result = await session.joinRoom({
      requestId: `req-${RUN}-bad-code`,
      roomCode: `NO-SUCH-ROOM-${RUN}`,
      passphrase: "whatever-passphrase",
      requestedCapability: "player",
      displayName: "Nobody",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected rejection");
    expect(result.code).toBe("ROOM_NOT_FOUND");
  });

  it("live-subscribes to projection updates via a real Firestore onSnapshot listener", async () => {
    const gmSession = new FirebaseSessionClient(gmApp, emulator);
    const created = await gmSession.createRoom({
      requestId: `req-${RUN}-live`,
      sessionName: "Live Subscription Cell",
      passphrase: "another-correct-passphrase",
      creatorDisplayName: "Director",
    });
    if (!created.ok) throw new Error(`createRoom failed: ${created.code}`);

    const roomId = asRoomId(created.roomId);
    const gmRepo = new FirebaseRoomRepository(gmApp, roomId, "gm", {
      functions: emulator.functions,
      firestore: emulator.firestore,
    });

    const seen: number[] = [];
    const unsubscribe = gmRepo.subscribeToProjection(
      { roomId, viewerId: "gm", capability: "gm" },
      (projection) => {
        seen.push(projection.roomRevision);
      },
    );

    // Force a projection write by joining and acting is unnecessary here —
    // the GM's own projection was already written at creation (board task
    // A03); this subscription's very first delivered snapshot (from the
    // existing document, not a fresh write) is what we assert on, proving
    // the listener actually attaches to real Firestore and delivers data.
    await new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const poll = (): void => {
        if (seen.length > 0) return resolve();
        if (Date.now() - start > 10_000) return reject(new Error("no snapshot delivered in time"));
        setTimeout(poll, 100);
      };
      poll();
    });

    unsubscribe();
    expect(seen[0]).toBe(0);
  });
});
