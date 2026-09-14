import { assertFails, assertSucceeds, type RulesTestContext } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, describe, it } from "vitest";
import { createEmulatorTestEnvironment, type RulesTestEnvironment } from "../src/emulator.js";

const ROOM_ID = "room-rtdb-fixture";
const OWN_UID = "uid-presence-owner";
const OTHER_UID = "uid-presence-other";

/**
 * The Phase 2 PR 2 RTDB rules allow/deny matrix (docs/ARCHITECTURE.md
 * section 8: "RTDB rules enforce `$uid === auth.uid` for presence writes").
 * RTDB cannot verify a Firestore binding, so read access is deliberately
 * limited to "authenticated and knows the room ID", not room membership —
 * this suite proves exactly that documented (not stronger, not weaker)
 * boundary, plus the universal denial of every path outside `presence`.
 */
describe("RTDB presence rules (Phase 2 PR 2)", () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    testEnv = await createEmulatorTestEnvironment();
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

  it("lets any authenticated client read a room's presence subtree", async () => {
    await assertSucceeds(context(OTHER_UID).database().ref(`presence/${ROOM_ID}`).once("value"));
  });

  it("denies an unauthenticated client reading presence", async () => {
    await assertFails(unauthed().database().ref(`presence/${ROOM_ID}`).once("value"));
  });

  it("lets a client write only its own UID's presence node", async () => {
    await assertSucceeds(
      context(OWN_UID)
        .database()
        .ref(`presence/${ROOM_ID}/${OWN_UID}/connection-1`)
        .set({ online: true }),
    );
  });

  it("denies a client writing another UID's presence node", async () => {
    await assertFails(
      context(OWN_UID)
        .database()
        .ref(`presence/${ROOM_ID}/${OTHER_UID}/connection-1`)
        .set({ online: true }),
    );
  });

  it("denies an unauthenticated client writing any presence node", async () => {
    await assertFails(
      unauthed()
        .database()
        .ref(`presence/${ROOM_ID}/${OWN_UID}/connection-1`)
        .set({ online: true }),
    );
  });

  it("denies reads and writes outside the presence subtree for every role", async () => {
    await assertFails(context(OWN_UID).database().ref("otherData/anything").once("value"));
    await assertFails(context(OWN_UID).database().ref("otherData/anything").set({ hacked: true }));
    await assertFails(unauthed().database().ref("otherData/anything").once("value"));
  });
});
