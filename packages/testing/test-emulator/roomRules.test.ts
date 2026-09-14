import { assertFails, assertSucceeds, type RulesTestContext } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createEmulatorTestEnvironment, type RulesTestEnvironment } from "../src/emulator.js";

const room = "room-1";
const playerUid = "uid-player";
const otherUid = "uid-other";
const gmUid = "uid-gm";
const tableUid = "uid-table";

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
        set(`rooms/${room}/events/shared/items/1`, { sequence: 1 }),
        set(`rooms/${room}/events/gm/items/1`, { sequence: 1 }),
        set(`rooms/${room}/events/member-player-a/items/1`, { sequence: 1 }),
        set(`rooms/${room}/authority/current`, { roomStatus: "active" }),
      ]);
    });
  });

  afterAll(async (): Promise<void> => {
    await testEnv.cleanup();
  });

  const context = (uid: string): RulesTestContext => testEnv.authenticatedContext(uid);
  const get = (uid: string, path: string): Promise<unknown> =>
    context(uid).firestore().doc(path).get();

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

  it("lets any room member read the client mirror, roster, and shared event stream only", async () => {
    await assertSucceeds(get(playerUid, `rooms/${room}/meta/current`));
    await assertSucceeds(get(playerUid, `rooms/${room}/members/player-a`));
    await assertSucceeds(get(playerUid, `rooms/${room}/events/shared/items/1`));
    await assertFails(get(playerUid, `rooms/${room}/authority/current`));
    await assertFails(get(playerUid, `rooms/${room}/uidBindings/${playerUid}`));
    await assertFails(get("outsider", `rooms/${room}/meta/current`));
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
  });

  it("allows authenticated UID-owned RTDB presence writes and rejects every other UID", async () => {
    const own = context(playerUid).database().ref(`presence/${room}/${playerUid}/connection-1`);
    const other = context(playerUid).database().ref(`presence/${room}/${otherUid}/connection-1`);
    await assertSucceeds(own.set({ online: true }));
    await assertFails(other.set({ online: true }));
    await assertSucceeds(context(gmUid).database().ref(`presence/${room}`).once("value"));
    await assertFails(
      testEnv.unauthenticatedContext().database().ref(`presence/${room}`).once("value"),
    );
  });
});
