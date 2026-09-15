import { assertFails, assertSucceeds, type RulesTestContext } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createEmulatorTestEnvironment, type RulesTestEnvironment } from "../src/emulator.js";

const room = "room-1";
const playerUid = "uid-player";
const otherUid = "uid-other";
const gmUid = "uid-gm";
const tableUid = "uid-table";
/** Signed in, but bound to no seat in `room`. */
const outsiderUid = "uid-outsider";
/**
 * A deliberately mis-minted binding whose member ID collides with the
 * reserved `table` viewer ID while holding only player capability. Member IDs
 * are service-minted and must never equal a reserved viewer ID; the rules
 * still refuse to let such a binding reach the reserved projection.
 */
const collidingUid = "uid-colliding";

describe("Phase 2 Firestore and RTDB room rules", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await createEmulatorTestEnvironment();
    await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext): Promise<void> => {
      const db = context.firestore();
      const set = async (path: string, value: Record<string, unknown>): Promise<void> => {
        await db.doc(path).set(value);
      };
      await Promise.all([
        set(`rooms/${room}`, { createdAt: 1 }),
        set(`rooms/${room}/uidBindings/${playerUid}`, {
          memberId: "player-a",
          capability: "player",
        }),
        set(`rooms/${room}/uidBindings/${otherUid}`, {
          memberId: "player-b",
          capability: "player",
        }),
        set(`rooms/${room}/uidBindings/${gmUid}`, { memberId: "gm-seat", capability: "gm" }),
        set(`rooms/${room}/uidBindings/${tableUid}`, {
          memberId: "table-seat",
          capability: "table",
        }),
        set(`rooms/${room}/uidBindings/${collidingUid}`, {
          memberId: "table",
          capability: "player",
        }),
        set(`rooms/${room}/bindings/player-a`, { uid: playerUid }),
        set(`rooms/${room}/meta/current`, { roomStatus: "active", gmMemberId: "gm-seat" }),
        set(`rooms/${room}/members/player-a`, { displayName: "Player A" }),
        set(`rooms/${room}/projections/player-a`, { viewerId: "player-a" }),
        set(`rooms/${room}/projections/player-b`, { viewerId: "player-b" }),
        set(`rooms/${room}/projections/gm`, { viewerId: "gm" }),
        set(`rooms/${room}/projections/table`, { viewerId: "table" }),
        set(`rooms/${room}/receipts/player-a_command-1`, {
          memberId: "player-a",
          commandId: "command-1",
        }),
        set(`rooms/${room}/receipts/player-b_command-1`, {
          memberId: "player-b",
          commandId: "command-1",
        }),
        set(`rooms/${room}/snapshots/1`, { sequence: 1 }),
        set(`rooms/${room}/events/shared/items/1`, { sequence: 1 }),
        set(`rooms/${room}/events/gm/items/1`, { sequence: 1 }),
        set(`rooms/${room}/events/member-player-a/items/1`, { sequence: 1 }),
        set(`rooms/${room}/events/member-player-b/items/1`, { sequence: 1 }),
        set(`rooms/${room}/authority/current`, { roomStatus: "active" }),
        set(`roomCodes/CODE-1`, { roomId: room }),
        // Board task A03: createRoom's idempotency receipt and its own throttle tree.
        set(`createRoomReceipts/req-1`, { roomId: room, roomCode: "CODE-1", memberId: "gm-seat" }),
        set(`createRoomThrottle/uid-abc/scope/all`, { windowStartMs: 0, count: 1 }),
      ]);
    });
  });

  afterAll(async (): Promise<void> => {
    await testEnv.cleanup();
  });

  const context = (uid: string): RulesTestContext => testEnv.authenticatedContext(uid);
  const get = (uid: string, path: string): Promise<unknown> =>
    context(uid).firestore().doc(path).get();
  const list = (uid: string, path: string): Promise<unknown> =>
    context(uid).firestore().collection(path).get();

  it("permits only each member's own projection, receipt, and private events", async () => {
    await assertSucceeds(get(playerUid, `rooms/${room}/projections/player-a`));
    await assertFails(get(playerUid, `rooms/${room}/projections/player-b`));
    await assertFails(get(playerUid, `rooms/${room}/projections/gm`));
    await assertSucceeds(get(playerUid, `rooms/${room}/receipts/player-a_command-1`));
    await assertFails(get(playerUid, `rooms/${room}/receipts/player-b_command-1`));
    await assertSucceeds(get(playerUid, `rooms/${room}/events/member-player-a/items/1`));
    await assertFails(get(otherUid, `rooms/${room}/events/member-player-a/items/1`));
  });

  it("limits reserved projections and event partitions to their matching capability", async () => {
    await assertSucceeds(get(gmUid, `rooms/${room}/projections/gm`));
    await assertFails(get(playerUid, `rooms/${room}/projections/gm`));
    await assertSucceeds(get(tableUid, `rooms/${room}/projections/table`));
    await assertFails(get(playerUid, `rooms/${room}/projections/table`));
    await assertSucceeds(get(gmUid, `rooms/${room}/events/gm/items/1`));
    await assertFails(get(tableUid, `rooms/${room}/events/gm/items/1`));
  });

  it("denies the GM and table seats another member's projection, receipt, and private events", async () => {
    // docs/ARCHITECTURE.md section 13: "The GM cannot read another member's receipt."
    await assertFails(get(gmUid, `rooms/${room}/receipts/player-a_command-1`));
    await assertFails(get(gmUid, `rooms/${room}/projections/player-a`));
    await assertFails(get(gmUid, `rooms/${room}/events/member-player-a/items/1`));
    await assertFails(get(tableUid, `rooms/${room}/receipts/player-a_command-1`));
    await assertFails(get(tableUid, `rooms/${room}/projections/player-a`));
    await assertFails(get(tableUid, `rooms/${room}/events/member-player-a/items/1`));
    await assertFails(get(gmUid, `rooms/${room}/projections/table`));
    await assertFails(get(tableUid, `rooms/${room}/projections/gm`));
  });

  it("refuses a binding whose member ID collides with a reserved viewer ID", async () => {
    await assertFails(get(collidingUid, `rooms/${room}/projections/table`));
    await assertFails(get(collidingUid, `rooms/${room}/projections/gm`));
    // The colliding binding is still an ordinary member for shared reads.
    await assertSucceeds(get(collidingUid, `rooms/${room}/events/shared/items/1`));
  });

  it("lets any room member read the client mirror, roster, and shared event stream only", async () => {
    await assertSucceeds(get(playerUid, `rooms/${room}/meta/current`));
    await assertSucceeds(get(playerUid, `rooms/${room}/members/player-a`));
    await assertSucceeds(get(playerUid, `rooms/${room}/events/shared/items/1`));
    await assertSucceeds(get(tableUid, `rooms/${room}/meta/current`));
    await assertSucceeds(get(tableUid, `rooms/${room}/events/shared/items/1`));
    await assertFails(get(playerUid, `rooms/${room}/authority/current`));
    await assertFails(get(playerUid, `rooms/${room}/uidBindings/${playerUid}`));
    await assertFails(get(outsiderUid, `rooms/${room}/meta/current`));
  });

  it("keeps service-only paths unreadable for every capability", async () => {
    for (const uid of [playerUid, gmUid, tableUid]) {
      await assertFails(get(uid, `rooms/${room}`));
      await assertFails(get(uid, `rooms/${room}/authority/current`));
      await assertFails(get(uid, `rooms/${room}/bindings/player-a`));
      await assertFails(get(uid, `rooms/${room}/uidBindings/${uid}`));
      await assertFails(get(uid, `rooms/${room}/snapshots/1`));
      await assertFails(get(uid, `roomCodes/CODE-1`));
      // Phase 2 PR 3: room passphrase, separate table-code, and per-seat
      // recovery-code hashes, plus the per-IP/per-room-code throttle counters.
      await assertFails(get(uid, `rooms/${room}/admission/secret`));
      await assertFails(get(uid, `rooms/${room}/admission/tableSecret`));
      await assertFails(get(uid, `rooms/${room}/recovery/player-a`));
      await assertFails(get(uid, `admissionThrottle/code-abc/byIp/def`));
      await assertFails(get(uid, `admissionThrottle/ip-def/scope/all`));
      await assertFails(get(uid, `admissionThrottle/uid-ghi/scope/all`));
      // Board task A03.
      await assertFails(get(uid, `createRoomReceipts/req-1`));
      await assertFails(get(uid, `createRoomThrottle/uid-abc/scope/all`));
    }
  });

  it("denies signed-in non-members and unauthenticated clients every room read", async () => {
    for (const path of [
      `rooms/${room}/meta/current`,
      `rooms/${room}/members/player-a`,
      `rooms/${room}/projections/player-a`,
      `rooms/${room}/projections/gm`,
      `rooms/${room}/projections/table`,
      `rooms/${room}/receipts/player-a_command-1`,
      `rooms/${room}/events/shared/items/1`,
      `rooms/${room}/events/gm/items/1`,
      `rooms/${room}/events/member-player-a/items/1`,
    ]) {
      await assertFails(get(outsiderUid, path));
      await assertFails(testEnv.unauthenticatedContext().firestore().doc(path).get());
    }
  });

  it("scopes collection queries the same way as single-document reads", async () => {
    await assertFails(list(playerUid, `rooms/${room}/projections`));
    await assertFails(list(gmUid, `rooms/${room}/projections`));
    await assertFails(list(playerUid, `rooms/${room}/receipts`));
    await assertFails(list(gmUid, `rooms/${room}/receipts`));
    await assertSucceeds(
      context(playerUid)
        .firestore()
        .collection(`rooms/${room}/receipts`)
        .where("memberId", "==", "player-a")
        .get(),
    );
    await assertFails(
      context(gmUid)
        .firestore()
        .collection(`rooms/${room}/receipts`)
        .where("memberId", "==", "player-a")
        .get(),
    );
    await assertSucceeds(list(playerUid, `rooms/${room}/events/shared/items`));
    await assertSucceeds(list(playerUid, `rooms/${room}/events/member-player-a/items`));
    await assertFails(list(playerUid, `rooms/${room}/events/member-player-b/items`));
    await assertFails(list(playerUid, `rooms/${room}/events/gm/items`));
    await assertSucceeds(list(gmUid, `rooms/${room}/events/gm/items`));
    await assertFails(list(gmUid, `rooms/${room}/events/member-player-a/items`));
    await assertFails(list(outsiderUid, `rooms/${room}/events/shared/items`));
    await assertFails(list(gmUid, `rooms/${room}/uidBindings`));
    await assertFails(list(gmUid, `rooms/${room}/bindings`));
    await assertFails(list(gmUid, `rooms/${room}/snapshots`));
    await assertFails(list(gmUid, `roomCodes`));
  });

  it("denies all direct Firestore writes, including a table-attributed command surrogate", async () => {
    await assertFails(
      context(playerUid)
        .firestore()
        .doc(`rooms/${room}/projections/player-a`)
        .set({ forged: true }),
    );
    await assertFails(
      context(tableUid)
        .firestore()
        .doc(`rooms/${room}/events/shared/items/2`)
        .set({ forged: true }),
    );
    await assertFails(
      context(gmUid).firestore().doc(`rooms/${room}/members/player-a`).set({ capability: "gm" }),
    );
    await assertFails(
      context(gmUid).firestore().doc(`rooms/${room}/authority/current`).set({ roomRevision: 99 }),
    );
    await assertFails(
      context(gmUid)
        .firestore()
        .doc(`rooms/${room}/meta/current`)
        .update({ roomStatus: "archived" }),
    );
    await assertFails(
      context(playerUid)
        .firestore()
        .doc(`rooms/${room}/uidBindings/${playerUid}`)
        .set({ memberId: "player-a", capability: "gm" }),
    );
    await assertFails(
      context(playerUid).firestore().doc(`rooms/${room}/receipts/player-a_command-1`).delete(),
    );
    await assertFails(
      context(playerUid)
        .firestore()
        .doc(`rooms/${room}/admission/secret`)
        .set({ hash: "forged", salt: "forged", iterations: 1 }),
    );
    await assertFails(
      context(gmUid)
        .firestore()
        .doc(`rooms/${room}/recovery/player-a`)
        .set({ hash: "forged", salt: "forged", iterations: 1 }),
    );
    await assertFails(
      context(gmUid)
        .firestore()
        .doc(`rooms/${room}/admission/tableSecret`)
        .set({ hash: "forged", salt: "forged", iterations: 1 }),
    );
    // A client that could reset or delete a throttle counter could defeat the throttle.
    await assertFails(
      context(playerUid)
        .firestore()
        .doc(`admissionThrottle/code-abc/byIp/def`)
        .set({ windowStartMs: 0, count: 0 }),
    );
    await assertFails(
      context(playerUid).firestore().doc(`admissionThrottle/code-abc/byIp/def`).delete(),
    );
    await assertFails(
      context(playerUid)
        .firestore()
        .doc(`admissionThrottle/uid-${playerUid}/scope/all`)
        .set({ windowStartMs: 0, count: 0 }),
    );
    await assertFails(
      context(playerUid)
        .firestore()
        .doc(`rooms/${room}/receipts/player-a_command-2`)
        .set({ memberId: "player-a", commandId: "command-2" }),
    );
    await assertFails(context(gmUid).firestore().doc(`roomCodes/CODE-2`).set({ roomId: room }));
    // Board task A03: a client that could write its own receipt could forge
    // a room it never actually created; a client that could reset its own
    // create-room throttle counter could defeat that throttle too.
    await assertFails(
      context(gmUid)
        .firestore()
        .doc(`createRoomReceipts/req-2`)
        .set({ roomId: "forged", roomCode: "FORGED", memberId: "forged" }),
    );
    await assertFails(context(playerUid).firestore().doc(`createRoomReceipts/req-1`).delete());
    await assertFails(
      context(playerUid)
        .firestore()
        .doc(`createRoomThrottle/uid-abc/scope/all`)
        .set({ windowStartMs: 0, count: 0 }),
    );
    await assertFails(
      testEnv.unauthenticatedContext().firestore().doc(`rooms/${room}/meta/current`).set({}),
    );
  });

  it("allows authenticated UID-owned RTDB presence writes and rejects every other UID", async () => {
    const own = context(playerUid).database().ref(`presence/${room}/${playerUid}/connection-1`);
    const other = context(playerUid).database().ref(`presence/${room}/${otherUid}/connection-1`);
    await assertSucceeds(own.set({ online: true }));
    await assertFails(other.set({ online: true }));
    await assertFails(
      context(gmUid).database().ref(`presence/${room}/${playerUid}/connection-1`).set(null),
    );
    await assertFails(
      testEnv
        .unauthenticatedContext()
        .database()
        .ref(`presence/${room}/${playerUid}/connection-2`)
        .set({ online: true }),
    );
    await assertSucceeds(own.set(null));
  });

  it("preserves the documented RTDB presence-read residual and nothing wider", async () => {
    // docs/ARCHITECTURE.md section 8: room presence "is readable to an
    // authenticated user who knows the room ID" — including a non-member.
    await assertSucceeds(context(gmUid).database().ref(`presence/${room}`).once("value"));
    await assertSucceeds(context(outsiderUid).database().ref(`presence/${room}`).once("value"));
    await assertFails(
      testEnv.unauthenticatedContext().database().ref(`presence/${room}`).once("value"),
    );
    // Room IDs cannot be enumerated: the presence root itself stays unreadable.
    await assertFails(context(gmUid).database().ref(`presence`).once("value"));
    await assertFails(context(gmUid).database().ref(`/`).once("value"));
  });
});
