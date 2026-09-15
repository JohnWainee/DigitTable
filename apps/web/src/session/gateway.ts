import { FixtureSessionGateway } from "./FixtureSessionGateway.js";

/**
 * One shared gateway instance for the whole app (module singleton), so the
 * create/join/claim/table-join screens all see the same in-memory "server".
 * TEMPORARY — replace every import of this with A05's `FirebaseRoomRepository`
 * once it lands (see `FixtureSessionGateway`'s class doc).
 */
export const fixtureSessionGateway = new FixtureSessionGateway();
