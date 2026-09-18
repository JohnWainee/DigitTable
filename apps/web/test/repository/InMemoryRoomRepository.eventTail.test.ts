import {
  asCommandId,
  asMemberId,
  asRoomId,
  type EventTailCursor,
  type EventTailRecord,
  type ViewerContext,
} from "@digitable/contracts";
import {
  ORIGINAL_MISSION,
  type EatTheReichCommand,
  type EatTheReichEvent,
} from "@digitable/template-eat-the-reich";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryRoomRepository } from "../../src/repository/InMemoryRoomRepository.js";

const ROOM = asRoomId("room-fixture");
const GM = asMemberId("member-gm");
const PLAYER_ONE = asMemberId("member-one");
const PLAYER_TWO = asMemberId("member-two");
const TABLE = asMemberId("member-table");

const PLAYER_ONE_VIEWER: ViewerContext = {
  roomId: ROOM,
  viewerId: PLAYER_ONE,
  capability: "player",
};
const GM_VIEWER: ViewerContext = { roomId: ROOM, viewerId: "gm", capability: "gm" };
const TABLE_VIEWER: ViewerContext = { roomId: ROOM, viewerId: "table", capability: "table" };
const ZERO: EventTailCursor = { shared: 0, gm: 0, member: 0 };

const DROP_FORECOURT = ORIGINAL_MISSION[0]!;

type ActionDeclaredEvent = Extract<EatTheReichEvent, { type: "ActionDeclared" }>;

function actionDeclared(record: EventTailRecord<EatTheReichEvent>): ActionDeclaredEvent | null {
  return record.payload.type === "ActionDeclared" ? record.payload : null;
}

describe("InMemoryRoomRepository authorized event tail", () => {
  let repo: InMemoryRoomRepository;

  const accepted = async (
    commandId: string,
    memberId: typeof GM,
    payload: EatTheReichCommand,
  ): Promise<void> => {
    const result = await repo.dispatch(memberId, { commandId: asCommandId(commandId), payload });
    expect(result.status).toBe("accepted");
  };

  beforeEach(async () => {
    repo = new InMemoryRoomRepository(ROOM, GM);
    repo.registerMember(PLAYER_ONE, "player");
    repo.registerMember(PLAYER_TWO, "player");
    repo.registerMember(TABLE, "table");
    await accepted("cmd-load", GM, { type: "LoadScene", ...DROP_FORECOURT });
    await accepted("cmd-claim-one", PLAYER_ONE, { type: "ClaimCharacter", characterId: "rook" });
    await accepted("cmd-claim-two", PLAYER_TWO, { type: "ClaimCharacter", characterId: "vesper" });
    await accepted("cmd-begin-one", PLAYER_ONE, {
      type: "BeginAction",
      characterId: "rook",
      stat: "SNEAK",
      itemIds: [],
      abilityIds: [],
      bonusClaimIds: [],
      engagedThreatIds: [],
      note: "player one declares",
    });
    await accepted("cmd-begin-two", PLAYER_TWO, {
      type: "BeginAction",
      characterId: "vesper",
      stat: "SNEAK",
      itemIds: [],
      abilityIds: [],
      bonusClaimIds: [],
      engagedThreatIds: [],
      note: "player two declares",
    });
  });

  it("a player sees shared and their own member copies, never another player's or the GM's", async () => {
    const page = await repo.readEventTail(PLAYER_ONE, PLAYER_ONE_VIEWER, ZERO);
    expect(page.records.every((r) => r.partition === "shared" || r.partition === "member")).toBe(
      true,
    );
    expect(page.records.some((r) => r.partition === "gm")).toBe(false);
    expect(page.records.some((r) => actionDeclared(r)?.note === "player two declares")).toBe(false);
    expect(
      page.records.some(
        (r) => r.partition === "member" && actionDeclared(r)?.actorMemberId !== PLAYER_ONE,
      ),
    ).toBe(false);
  });

  it("the shared copy of a redacted event is redacted while the actor's own member copy is full", async () => {
    const page = await repo.readEventTail(PLAYER_ONE, PLAYER_ONE_VIEWER, ZERO);
    const sharedCopy = page.records.find(
      (r) => r.partition === "shared" && actionDeclared(r) !== null,
    );
    const memberCopy = page.records.find(
      (r) => r.partition === "member" && actionDeclared(r) !== null,
    );
    expect(sharedCopy && actionDeclared(sharedCopy)).toMatchObject({
      stat: "none",
      itemIds: [],
      note: null,
    });
    expect(memberCopy && actionDeclared(memberCopy)).toMatchObject({
      stat: "SNEAK",
      note: "player one declares",
    });
  });

  it("the GM sees shared and gm copies", async () => {
    const page = await repo.readEventTail(GM, GM_VIEWER, ZERO);
    expect(page.records.some((r) => r.partition === "gm")).toBe(true);
    expect(page.records.some((r) => r.partition === "shared")).toBe(true);
    const gmCopies = page.records
      .map((r) => actionDeclared(r))
      .filter((event): event is NonNullable<typeof event> => event !== null);
    expect(gmCopies.some((event) => event.actorMemberId === PLAYER_TWO)).toBe(true);
  });

  it("the table seat sees shared copies only", async () => {
    const page = await repo.readEventTail(TABLE, TABLE_VIEWER, ZERO);
    expect(page.records.every((r) => r.partition === "shared")).toBe(true);
    expect(page.records.some((r) => actionDeclared(r) !== null)).toBe(true);
  });

  it("pagination with limit 1 walks the whole tail exactly once via the returned cursor", async () => {
    const whole = await repo.readEventTail(PLAYER_ONE, PLAYER_ONE_VIEWER, ZERO);
    let cursor: EventTailCursor = { ...ZERO };
    const walked: EventTailRecord<EatTheReichEvent>[] = [];
    let guard = 0;
    for (;;) {
      const page = await repo.readEventTail(PLAYER_ONE, PLAYER_ONE_VIEWER, cursor, 1);
      walked.push(...page.records);
      cursor = page.cursor;
      if (!page.hasMore) break;
      guard += 1;
      if (guard > 100) throw new Error("pagination did not terminate");
    }
    const keys = (records: readonly EventTailRecord<EatTheReichEvent>[]): string[] =>
      records.map((r) => `${r.partition}:${r.sequence}`).sort();
    expect(keys(walked)).toEqual(keys(whole.records));
    expect(new Set(keys(walked)).size).toBe(walked.length);
  });

  it("readEventTailHead matches the last sequence per partition", async () => {
    const whole = await repo.readEventTail(PLAYER_ONE, PLAYER_ONE_VIEWER, ZERO);
    const head = await repo.readEventTailHead(PLAYER_ONE, PLAYER_ONE_VIEWER);
    const maxByPartition = (partition: "shared" | "member"): number =>
      whole.records
        .filter((r) => r.partition === partition)
        .reduce((max, r) => Math.max(max, r.sequence), 0);
    expect(head.shared).toBe(maxByPartition("shared"));
    expect(head.member).toBe(maxByPartition("member"));
    expect(head.gm).toBe(0);

    const tableHead = await repo.readEventTailHead(TABLE, TABLE_VIEWER);
    expect(tableHead).toEqual({ shared: maxByPartition("shared"), gm: 0, member: 0 });
  });

  it("a retried command adds no new log entries", async () => {
    const before = await repo.readEventTailHead(PLAYER_ONE, PLAYER_ONE_VIEWER);
    const beforeTail = await repo.readEventTail(PLAYER_ONE, PLAYER_ONE_VIEWER, ZERO);
    await accepted("cmd-begin-one", PLAYER_ONE, {
      type: "BeginAction",
      characterId: "rook",
      stat: "SNEAK",
      itemIds: [],
      abilityIds: [],
      bonusClaimIds: [],
      engagedThreatIds: [],
      note: "player one declares",
    });
    const after = await repo.readEventTailHead(PLAYER_ONE, PLAYER_ONE_VIEWER);
    const afterTail = await repo.readEventTail(PLAYER_ONE, PLAYER_ONE_VIEWER, ZERO);
    expect(after).toEqual(before);
    expect(afterTail.records).toHaveLength(beforeTail.records.length);
  });

  it("presentationScope is identity-scoped by fixture, room, and member", () => {
    const base = repo.presentationScope(PLAYER_ONE);
    expect(repo.presentationScope(PLAYER_TWO)).not.toBe(base);
    expect(base).toContain("room-fixture");
  });
});
