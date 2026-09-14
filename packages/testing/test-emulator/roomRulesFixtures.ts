import {
  asCommandId,
  asMemberId,
  asRoomId,
  memberEventPartitionId,
  type MemberId,
  type RoomId,
} from "@digitable/contracts";
import type { RulesTestContext, RulesTestEnvironment } from "@firebase/rules-unit-testing";

/**
 * Shared fixture data for the Phase 2 PR 2 Firestore rules allow/deny matrix
 * (docs/PHASE_2_PLAN.md, "Rule unit tests (allow/deny matrix) against the
 * emulator from PR 1: every path × every role"). One room with two players,
 * one GM, one table seat, and one signed-in outsider who is bound to no
 * seat in this room at all.
 */
export const ROOM_ID: RoomId = asRoomId("room-rules-fixture");

export const PLAYER_ONE_UID = "uid-player-one";
export const PLAYER_TWO_UID = "uid-player-two";
export const GM_UID = "uid-gm";
export const TABLE_UID = "uid-table";
/** Authenticated (has a Firebase identity) but bound to no seat in `ROOM_ID`. */
export const OUTSIDER_UID = "uid-outsider";

export const PLAYER_ONE_MEMBER_ID: MemberId = asMemberId("member-player-one");
export const PLAYER_TWO_MEMBER_ID: MemberId = asMemberId("member-player-two");
export const GM_MEMBER_ID: MemberId = asMemberId("member-gm");
export const TABLE_MEMBER_ID: MemberId = asMemberId("member-table");

export const PLAYER_ONE_COMMAND_ID = asCommandId("11111111-1111-4111-8111-111111111111");
export const GM_COMMAND_ID = asCommandId("22222222-2222-4222-8222-222222222222");

export const PLAYER_ONE_RECEIPT_ID = `${PLAYER_ONE_MEMBER_ID}_${PLAYER_ONE_COMMAND_ID}`;
export const GM_RECEIPT_ID = `${GM_MEMBER_ID}_${GM_COMMAND_ID}`;

export const PLAYER_ONE_EVENT_PARTITION = memberEventPartitionId(PLAYER_ONE_MEMBER_ID);
export const PLAYER_TWO_EVENT_PARTITION = memberEventPartitionId(PLAYER_TWO_MEMBER_ID);

/**
 * Writes every fixture document a trusted service (a future Function) would
 * have written, using `withSecurityRulesDisabled` — the supported,
 * testing-only escape hatch this repo already uses in
 * `emulatorHarness.smoke.test.ts`. Rules are then exercised for real by
 * separately authenticated/unauthenticated contexts reading this same data.
 */
export async function seedRoomFixtures(testEnv: RulesTestEnvironment): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context: RulesTestContext) => {
    const db = context.firestore();
    const doc = (path: string): ReturnType<typeof db.doc> => db.doc(`rooms/${ROOM_ID}/${path}`);

    await Promise.all([
      doc(`uidBindings/${PLAYER_ONE_UID}`).set({
        memberId: PLAYER_ONE_MEMBER_ID,
        capability: "player",
      }),
      doc(`uidBindings/${PLAYER_TWO_UID}`).set({
        memberId: PLAYER_TWO_MEMBER_ID,
        capability: "player",
      }),
      doc(`uidBindings/${GM_UID}`).set({ memberId: GM_MEMBER_ID, capability: "gm" }),
      doc(`uidBindings/${TABLE_UID}`).set({ memberId: TABLE_MEMBER_ID, capability: "table" }),

      doc(`bindings/${PLAYER_ONE_MEMBER_ID}`).set({
        memberId: PLAYER_ONE_MEMBER_ID,
        uid: PLAYER_ONE_UID,
        capability: "player",
      }),
      doc(`bindings/${PLAYER_TWO_MEMBER_ID}`).set({
        memberId: PLAYER_TWO_MEMBER_ID,
        uid: PLAYER_TWO_UID,
        capability: "player",
      }),
      doc(`bindings/${GM_MEMBER_ID}`).set({
        memberId: GM_MEMBER_ID,
        uid: GM_UID,
        capability: "gm",
      }),
      doc(`bindings/${TABLE_MEMBER_ID}`).set({
        memberId: TABLE_MEMBER_ID,
        uid: TABLE_UID,
        capability: "table",
      }),

      doc("authority/current").set({
        platformVersion: "0.0.0",
        templateId: "eat-the-reich",
        templateVersion: "0.0.0",
        schemaVersion: 1,
        roomRevision: 1,
        nextSequence: 2,
        roomStatus: "active",
        gmMemberId: GM_MEMBER_ID,
        state: { placeholder: true },
      }),

      doc("meta/current").set({
        platformVersion: "0.0.0",
        templateId: "eat-the-reich",
        templateVersion: "0.0.0",
        schemaVersion: 1,
        roomStatus: "active",
        gmMemberId: GM_MEMBER_ID,
        tableMemberId: TABLE_MEMBER_ID,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),

      doc(`members/${PLAYER_ONE_MEMBER_ID}`).set({
        memberId: PLAYER_ONE_MEMBER_ID,
        capability: "player",
        displayName: "Player One",
        joinedAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      }),
      doc(`members/${PLAYER_TWO_MEMBER_ID}`).set({
        memberId: PLAYER_TWO_MEMBER_ID,
        capability: "player",
        displayName: "Player Two",
        joinedAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      }),
      doc(`members/${GM_MEMBER_ID}`).set({
        memberId: GM_MEMBER_ID,
        capability: "gm",
        displayName: "The GM",
        joinedAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      }),
      doc(`members/${TABLE_MEMBER_ID}`).set({
        memberId: TABLE_MEMBER_ID,
        capability: "table",
        displayName: "Shared Table",
        joinedAt: "2026-01-01T00:00:00.000Z",
        lastSeenAt: "2026-01-01T00:00:00.000Z",
      }),

      doc(`projections/${PLAYER_ONE_MEMBER_ID}`).set({ viewerId: PLAYER_ONE_MEMBER_ID, view: {} }),
      doc(`projections/${PLAYER_TWO_MEMBER_ID}`).set({ viewerId: PLAYER_TWO_MEMBER_ID, view: {} }),
      doc("projections/gm").set({ viewerId: "gm", view: {} }),
      doc("projections/table").set({ viewerId: "table", view: {} }),

      doc(`receipts/${PLAYER_ONE_RECEIPT_ID}`).set({
        memberId: PLAYER_ONE_MEMBER_ID,
        commandId: PLAYER_ONE_COMMAND_ID,
        status: "accepted",
        roomRevision: 1,
        acceptedSequences: [1],
        errorCode: null,
      }),
      doc(`receipts/${GM_RECEIPT_ID}`).set({
        memberId: GM_MEMBER_ID,
        commandId: GM_COMMAND_ID,
        status: "accepted",
        roomRevision: 1,
        acceptedSequences: [1],
        errorCode: null,
      }),

      doc("snapshots/1").set({
        platformVersion: "0.0.0",
        templateId: "eat-the-reich",
        templateVersion: "0.0.0",
        schemaVersion: 1,
        sequence: 1,
        roomRevision: 1,
        state: { placeholder: true },
        checksum: "deadbeef",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),

      doc("events/shared/items/1").set({ eventId: "evt-shared-1", sequence: 1 }),
      doc("events/gm/items/1").set({ eventId: "evt-gm-1", sequence: 1 }),
      doc(`events/${PLAYER_ONE_EVENT_PARTITION}/items/1`).set({
        eventId: "evt-p1-1",
        sequence: 1,
      }),
      doc(`events/${PLAYER_TWO_EVENT_PARTITION}/items/1`).set({
        eventId: "evt-p2-1",
        sequence: 1,
      }),

      db
        .doc("roomCodes/ROOMCODE1")
        .set({ roomId: ROOM_ID, kind: "player", createdAt: "2026-01-01T00:00:00.000Z" }),
    ]);
  });
}
