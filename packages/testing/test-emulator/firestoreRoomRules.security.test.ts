import { assertFails, assertSucceeds, type RulesTestContext } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createEmulatorTestEnvironment, type RulesTestEnvironment } from "../src/emulator.js";
import {
  GM_MEMBER_ID,
  GM_RECEIPT_ID,
  GM_UID,
  OUTSIDER_UID,
  PLAYER_ONE_EVENT_PARTITION,
  PLAYER_ONE_MEMBER_ID,
  PLAYER_ONE_RECEIPT_ID,
  PLAYER_ONE_UID,
  PLAYER_TWO_EVENT_PARTITION,
  PLAYER_TWO_MEMBER_ID,
  PLAYER_TWO_UID,
  ROOM_ID,
  TABLE_UID,
  seedRoomFixtures,
} from "./roomRulesFixtures.js";

/**
 * The Phase 2 PR 2 Firestore rules allow/deny matrix
 * (docs/PHASE_2_PLAN.md, "Rule unit tests (allow/deny matrix) against the
 * emulator from PR 1: every path × every role"), implementing
 * docs/ARCHITECTURE.md section 8's uidBindings-based authorization
 * (third-pass review R1). No Function exists yet (Phase 2 PR 4), so every
 * write in this suite is expected to fail for every client role, service
 * included — only `withSecurityRulesDisabled` (used by
 * `seedRoomFixtures`) may write.
 */
describe("Firestore room rules (Phase 2 PR 2)", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await createEmulatorTestEnvironment();
    await seedRoomFixtures(testEnv);
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  function context(uid: string): RulesTestContext {
    return testEnv.authenticatedContext(uid);
  }

  function unauthed(): RulesTestContext {
    return testEnv.unauthenticatedContext();
  }

  type FirestoreDocRef = ReturnType<ReturnType<RulesTestContext["firestore"]>["doc"]>;

  function roomDoc(ctx: RulesTestContext, path: string): FirestoreDocRef {
    return ctx.firestore().doc(`rooms/${ROOM_ID}/${path}`);
  }

  describe("service-only documents: authority, bindings, uidBindings, snapshots", () => {
    const servicePaths = [
      "authority/current",
      `bindings/${PLAYER_ONE_MEMBER_ID}`,
      `uidBindings/${PLAYER_ONE_UID}`,
      "snapshots/1",
    ];

    for (const path of servicePaths) {
      it(`denies every client read of ${path}, including the document's own subject`, async () => {
        await assertFails(roomDoc(context(PLAYER_ONE_UID), path).get());
        await assertFails(roomDoc(context(GM_UID), path).get());
        await assertFails(roomDoc(unauthed(), path).get());
      });

      it(`denies every client write of ${path}, including the document's own subject`, async () => {
        await assertFails(roomDoc(context(PLAYER_ONE_UID), path).set({ hacked: true }));
        await assertFails(roomDoc(context(GM_UID), path).set({ hacked: true }));
        await assertFails(roomDoc(unauthed(), path).set({ hacked: true }));
      });
    }
  });

  describe("roomCodes/{code}: service-only, top-level", () => {
    it("denies every client read", async () => {
      await assertFails(context(PLAYER_ONE_UID).firestore().doc("roomCodes/ROOMCODE1").get());
      await assertFails(unauthed().firestore().doc("roomCodes/ROOMCODE1").get());
    });

    it("denies every client write", async () => {
      await assertFails(
        context(PLAYER_ONE_UID)
          .firestore()
          .doc("roomCodes/ROOMCODE1")
          .set({ roomId: ROOM_ID, kind: "player", createdAt: "now" }),
      );
    });
  });

  describe("meta/current: denormalized client-readable mirror", () => {
    it("is readable by every bound member regardless of capability", async () => {
      await assertSucceeds(roomDoc(context(PLAYER_ONE_UID), "meta/current").get());
      await assertSucceeds(roomDoc(context(GM_UID), "meta/current").get());
      await assertSucceeds(roomDoc(context(TABLE_UID), "meta/current").get());
    });

    it("denies a signed-in non-member and an unauthenticated client", async () => {
      await assertFails(roomDoc(context(OUTSIDER_UID), "meta/current").get());
      await assertFails(roomDoc(unauthed(), "meta/current").get());
    });

    it("denies every client write", async () => {
      await assertFails(
        roomDoc(context(GM_UID), "meta/current").set({ roomStatus: "archived" }, { merge: true }),
      );
    });
  });

  describe("members/{memberId}: shared roster", () => {
    it("lets any bound member read any other member's roster entry", async () => {
      await assertSucceeds(roomDoc(context(PLAYER_ONE_UID), `members/${GM_MEMBER_ID}`).get());
      await assertSucceeds(roomDoc(context(TABLE_UID), `members/${PLAYER_TWO_MEMBER_ID}`).get());
    });

    it("denies a signed-in non-member and an unauthenticated client", async () => {
      await assertFails(roomDoc(context(OUTSIDER_UID), `members/${PLAYER_ONE_MEMBER_ID}`).get());
      await assertFails(roomDoc(unauthed(), `members/${PLAYER_ONE_MEMBER_ID}`).get());
    });

    it("denies every client write", async () => {
      await assertFails(
        roomDoc(context(PLAYER_ONE_UID), `members/${PLAYER_ONE_MEMBER_ID}`).set(
          { displayName: "hacked" },
          { merge: true },
        ),
      );
    });
  });

  describe("projections/{viewerId}: own projection only, plus reserved gm/table", () => {
    it("lets a member read only their own projection", async () => {
      await assertSucceeds(
        roomDoc(context(PLAYER_ONE_UID), `projections/${PLAYER_ONE_MEMBER_ID}`).get(),
      );
      await assertFails(
        roomDoc(context(PLAYER_ONE_UID), `projections/${PLAYER_TWO_MEMBER_ID}`).get(),
      );
      await assertFails(
        roomDoc(context(PLAYER_TWO_UID), `projections/${PLAYER_ONE_MEMBER_ID}`).get(),
      );
    });

    it("lets only the bound GM read the reserved gm projection", async () => {
      await assertSucceeds(roomDoc(context(GM_UID), "projections/gm").get());
      await assertFails(roomDoc(context(PLAYER_ONE_UID), "projections/gm").get());
      await assertFails(roomDoc(context(TABLE_UID), "projections/gm").get());
    });

    it("lets only the bound table seat read the reserved table projection", async () => {
      await assertSucceeds(roomDoc(context(TABLE_UID), "projections/table").get());
      await assertFails(roomDoc(context(PLAYER_ONE_UID), "projections/table").get());
      await assertFails(roomDoc(context(GM_UID), "projections/table").get());
    });

    it("denies an unauthenticated client for every viewer", async () => {
      await assertFails(roomDoc(unauthed(), `projections/${PLAYER_ONE_MEMBER_ID}`).get());
      await assertFails(roomDoc(unauthed(), "projections/gm").get());
      await assertFails(roomDoc(unauthed(), "projections/table").get());
    });

    it("denies every client write", async () => {
      await assertFails(
        roomDoc(context(PLAYER_ONE_UID), `projections/${PLAYER_ONE_MEMBER_ID}`).set(
          { view: { hacked: true } },
          { merge: true },
        ),
      );
      await assertFails(
        roomDoc(context(GM_UID), "projections/gm").set({ view: { hacked: true } }, { merge: true }),
      );
    });
  });

  describe("receipts/{receiptId}: actor-private, memberId-keyed", () => {
    it("lets a member read their own receipt", async () => {
      await assertSucceeds(
        roomDoc(context(PLAYER_ONE_UID), `receipts/${PLAYER_ONE_RECEIPT_ID}`).get(),
      );
      await assertSucceeds(roomDoc(context(GM_UID), `receipts/${GM_RECEIPT_ID}`).get());
    });

    it("denies another player reading someone else's receipt", async () => {
      await assertFails(
        roomDoc(context(PLAYER_TWO_UID), `receipts/${PLAYER_ONE_RECEIPT_ID}`).get(),
      );
    });

    it("denies the GM reading another member's receipt (required proof)", async () => {
      await assertFails(roomDoc(context(GM_UID), `receipts/${PLAYER_ONE_RECEIPT_ID}`).get());
    });

    it("denies an unauthenticated client", async () => {
      await assertFails(roomDoc(unauthed(), `receipts/${PLAYER_ONE_RECEIPT_ID}`).get());
    });

    it("denies every client write", async () => {
      await assertFails(
        roomDoc(context(PLAYER_ONE_UID), `receipts/${PLAYER_ONE_RECEIPT_ID}`).set(
          { status: "accepted" },
          { merge: true },
        ),
      );
    });
  });

  describe("events/shared/items/{sequence}: readable by every bound member", () => {
    it("is readable by players, the GM, and the table seat alike", async () => {
      await assertSucceeds(roomDoc(context(PLAYER_ONE_UID), "events/shared/items/1").get());
      await assertSucceeds(roomDoc(context(GM_UID), "events/shared/items/1").get());
      await assertSucceeds(roomDoc(context(TABLE_UID), "events/shared/items/1").get());
    });

    it("denies a signed-in non-member and an unauthenticated client", async () => {
      await assertFails(roomDoc(context(OUTSIDER_UID), "events/shared/items/1").get());
      await assertFails(roomDoc(unauthed(), "events/shared/items/1").get());
    });

    it("denies every client write", async () => {
      await assertFails(
        roomDoc(context(GM_UID), "events/shared/items/1").set({ hacked: true }, { merge: true }),
      );
    });
  });

  describe("events/gm/items/{sequence}: GM-only partition", () => {
    it("is readable only by the bound GM", async () => {
      await assertSucceeds(roomDoc(context(GM_UID), "events/gm/items/1").get());
      await assertFails(roomDoc(context(PLAYER_ONE_UID), "events/gm/items/1").get());
      await assertFails(roomDoc(context(TABLE_UID), "events/gm/items/1").get());
    });

    it("denies every client write", async () => {
      await assertFails(
        roomDoc(context(GM_UID), "events/gm/items/1").set({ hacked: true }, { merge: true }),
      );
    });
  });

  describe("events/member-{memberId}/items/{sequence}: member-private partition", () => {
    it("is readable only by that member", async () => {
      await assertSucceeds(
        roomDoc(context(PLAYER_ONE_UID), `events/${PLAYER_ONE_EVENT_PARTITION}/items/1`).get(),
      );
      await assertFails(
        roomDoc(context(PLAYER_TWO_UID), `events/${PLAYER_ONE_EVENT_PARTITION}/items/1`).get(),
      );
      await assertFails(
        roomDoc(context(GM_UID), `events/${PLAYER_ONE_EVENT_PARTITION}/items/1`).get(),
      );
      await assertFails(
        roomDoc(context(TABLE_UID), `events/${PLAYER_ONE_EVENT_PARTITION}/items/1`).get(),
      );
    });

    it("keeps two players' member-private partitions isolated from each other", async () => {
      await assertSucceeds(
        roomDoc(context(PLAYER_TWO_UID), `events/${PLAYER_TWO_EVENT_PARTITION}/items/1`).get(),
      );
      await assertFails(
        roomDoc(context(PLAYER_ONE_UID), `events/${PLAYER_TWO_EVENT_PARTITION}/items/1`).get(),
      );
    });

    it("denies every client write", async () => {
      await assertFails(
        roomDoc(context(PLAYER_ONE_UID), `events/${PLAYER_ONE_EVENT_PARTITION}/items/1`).set(
          { hacked: true },
          { merge: true },
        ),
      );
    });
  });

  it("denies a table-capability client any command-family write path (no game/safety commands for table)", async () => {
    // The data model has no client-writable command path at all yet (Phase 2
    // PR 4 adds the trusted Function); this asserts the table seat is not
    // somehow privileged relative to that universal denial.
    await assertFails(
      roomDoc(context(TABLE_UID), "authority/current").set({ hacked: true }, { merge: true }),
    );
  });
});
