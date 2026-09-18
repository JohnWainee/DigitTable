import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  asCommandId,
  asMemberId,
  asRoomId,
  type RoomCommandRequest,
  type ViewerContext,
} from "@digitable/contracts";
import type { EatTheReichCommand } from "@digitable/template-eat-the-reich";
import { FirebaseRoomRepository } from "../../src/repository/FirebaseRoomRepository.js";
import { MemoryStorage } from "../memoryStorage.js";

const mocks = vi.hoisted(() => {
  const user: { currentUser: { uid: string } | null } = { currentUser: { uid: "uid-original" } };
  return {
    user,
    read: vi.fn(),
    getDocsFromServer: vi.fn(),
    send: vi.fn(),
    FunctionsError: class extends Error {
      constructor(public details: unknown) {
        super("Rejected by server");
      }
    },
  };
});
vi.mock("firebase/auth", () => ({ getAuth: () => mocks.user }));
vi.mock("firebase/functions", () => ({ FunctionsError: mocks.FunctionsError }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => path,
  getDoc: mocks.read,
  getDocFromServer: mocks.read,
  getDocsFromServer: mocks.getDocsFromServer,
  onSnapshot: vi.fn(),
  collection: (_db: unknown, path: string) => ({ kind: "collection", path }),
  query: (collection: unknown, ...constraints: unknown[]) => ({
    kind: "query",
    collection,
    constraints,
  }),
  where: (field: string, op: string, value: unknown) => ({ kind: "where", field, op, value }),
  orderBy: (field: string, direction: string) => ({ kind: "orderBy", field, direction }),
  limit: (value: number) => ({ kind: "limit", value }),
}));
vi.mock("../../src/firebase/functions.js", () => ({
  getRoomFunctions: vi.fn(),
  callable: () => mocks.send,
}));
vi.mock("../../src/firebase/firestore.js", () => ({ getRoomFirestore: vi.fn() }));

interface QueryCall {
  readonly collection: { readonly path: string };
  readonly constraints: readonly { readonly kind: string; readonly value?: unknown }[];
}

interface MockSnapshot {
  readonly docs: readonly { readonly id: string; readonly data: () => unknown }[];
}

const snapshot = (data?: unknown): { exists: () => boolean; data: () => unknown } => ({
  exists: () => data !== undefined,
  data: () => data,
});

const documents = (
  docs: readonly { readonly id: string; readonly data: unknown }[],
): MockSnapshot => ({
  docs: docs.map((entry) => ({ id: entry.id, data: () => entry.data })),
});

const storedEvent = (
  id: string,
  overrides: Record<string, unknown> = {},
): { id: string; data: Record<string, unknown> } => ({
  id,
  data: {
    eventId: `event-${id}`,
    commandId: `command-${id}`,
    sequence: Number(id),
    roomRevision: 1,
    actor: { kind: "anonymous" },
    occurredAtServer: "2026-09-17T00:00:00.000Z",
    payload: { type: "Paused" },
    ...overrides,
  },
});

const pathOf = (call: QueryCall): string => call.collection.path;
const whereOf = (call: QueryCall): number => {
  const constraint = call.constraints.find((entry) => entry.kind === "where");
  return constraint?.value as number;
};

describe("FirebaseRoomRepository authorized event tail", () => {
  const room = asRoomId("room");
  const member = asMemberId("member");
  const app = { name: "test", options: { projectId: "project" } } as ConstructorParameters<
    typeof FirebaseRoomRepository
  >[0];
  const player: ViewerContext = { roomId: room, viewerId: member, capability: "player" };
  const gm: ViewerContext = { roomId: room, viewerId: "gm", capability: "gm" };
  const table: ViewerContext = { roomId: room, viewerId: "table", capability: "table" };
  const empty = { shared: 0, gm: 0, member: 0 };
  let storage: MemoryStorage;
  let repo: FirebaseRoomRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.currentUser = { uid: "uid-original" };
    storage = new MemoryStorage();
    repo = new FirebaseRoomRepository(app, room, "player", undefined, storage);
  });

  const queriedPaths = (): string[] =>
    mocks.getDocsFromServer.mock.calls.map(([call]) => pathOf(call as QueryCall));

  it("a player reads exactly shared and their own member partition", async () => {
    mocks.getDocsFromServer.mockResolvedValue(documents([]));
    await repo.readEventTail(member, player, empty);
    expect(queriedPaths().sort()).toEqual([
      "rooms/room/events/member-member/items",
      "rooms/room/events/shared/items",
    ]);
    expect(queriedPaths()).not.toContain("rooms/room/events/gm/items");
    expect(queriedPaths()).not.toContain("rooms/room/events/member-other-member/items");
  });

  it("a GM reads shared, gm, and their own member partition", async () => {
    mocks.getDocsFromServer.mockResolvedValue(documents([]));
    await repo.readEventTail(member, gm, empty);
    expect(queriedPaths().sort()).toEqual([
      "rooms/room/events/gm/items",
      "rooms/room/events/member-member/items",
      "rooms/room/events/shared/items",
    ]);
  });

  it("a table viewer reads shared only", async () => {
    mocks.getDocsFromServer.mockResolvedValue(documents([]));
    await repo.readEventTail(member, table, empty);
    expect(queriedPaths()).toEqual(["rooms/room/events/shared/items"]);
  });

  it("bounds each partition query by that partition's cursor", async () => {
    mocks.getDocsFromServer.mockResolvedValue(documents([]));
    await repo.readEventTail(member, gm, { shared: 5, gm: 2, member: 7 });
    const byPath = new Map(
      mocks.getDocsFromServer.mock.calls.map(([call]) => [
        pathOf(call as QueryCall),
        call as QueryCall,
      ]),
    );
    expect(whereOf(byPath.get("rooms/room/events/shared/items")!)).toBe(5);
    expect(whereOf(byPath.get("rooms/room/events/gm/items")!)).toBe(2);
    expect(whereOf(byPath.get("rooms/room/events/member-member/items")!)).toBe(7);
  });

  it("merges partition results and advances the cursor per partition", async () => {
    mocks.getDocsFromServer.mockImplementation((call: QueryCall): MockSnapshot => {
      switch (pathOf(call)) {
        case "rooms/room/events/shared/items":
          return documents([storedEvent("1"), storedEvent("4")]);
        case "rooms/room/events/gm/items":
          return documents([storedEvent("2")]);
        case "rooms/room/events/member-member/items":
          return documents([storedEvent("5")]);
        default:
          return documents([]);
      }
    });
    const page = await repo.readEventTail(member, gm, empty, 10);
    expect(page.records.map((r) => r.sequence)).toEqual([1, 2, 4, 5]);
    expect(page.cursor).toEqual({ shared: 4, gm: 2, member: 5 });
    expect(page.hasMore).toBe(false);
  });

  it("rejects when a stored document is malformed", async () => {
    mocks.getDocsFromServer.mockImplementation((call: QueryCall): MockSnapshot => {
      if (pathOf(call) === "rooms/room/events/shared/items") {
        return documents([storedEvent("1", { sequence: 2 })]);
      }
      return documents([]);
    });
    await expect(repo.readEventTail(member, player, empty)).rejects.toThrow(/mismatch/);
  });

  it("rejects with Identity changed and returns no records when the identity is replaced mid-read", async () => {
    mocks.getDocsFromServer.mockImplementation((): MockSnapshot => {
      mocks.user.currentUser = { uid: "replacement" };
      return documents([storedEvent("1")]);
    });
    await expect(repo.readEventTail(member, player, empty)).rejects.toThrow("Identity changed");
  });

  it("readEventTailHead returns per-partition latest sequences", async () => {
    mocks.getDocsFromServer.mockImplementation((call: QueryCall): MockSnapshot => {
      switch (pathOf(call)) {
        case "rooms/room/events/shared/items":
          return documents([storedEvent("9")]);
        case "rooms/room/events/gm/items":
          return documents([storedEvent("4")]);
        case "rooms/room/events/member-member/items":
          return documents([storedEvent("12")]);
        default:
          return documents([]);
      }
    });
    expect(await repo.readEventTailHead(member, gm)).toEqual({ shared: 9, gm: 4, member: 12 });
  });

  it("readEventTailHead reports 0 for empty (and unauthorized) partitions", async () => {
    mocks.getDocsFromServer.mockResolvedValue(documents([]));
    expect(await repo.readEventTailHead(member, player)).toEqual({ shared: 0, gm: 0, member: 0 });
    expect(queriedPaths()).not.toContain("rooms/room/events/gm/items");
  });
});

describe("FirebaseRoomRepository presentationScope", () => {
  const app = { name: "test", options: { projectId: "project" } } as ConstructorParameters<
    typeof FirebaseRoomRepository
  >[0];
  const room = asRoomId("room");
  const member = asMemberId("member");
  let storage: MemoryStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.currentUser = { uid: "uid-original" };
    storage = new MemoryStorage();
  });

  it("differs across uid, room, and member", () => {
    const repo = new FirebaseRoomRepository(app, room, "player", undefined, storage);
    const scope = repo.presentationScope(member);
    expect(repo.presentationScope(asMemberId("member-two"))).not.toBe(scope);

    mocks.user.currentUser = { uid: "uid-two" };
    const otherUid = new FirebaseRoomRepository(app, room, "player", undefined, storage);
    expect(otherUid.presentationScope(member)).not.toBe(scope);

    const otherRoom = new FirebaseRoomRepository(
      app,
      asRoomId("room-two"),
      "player",
      undefined,
      storage,
    );
    expect(otherRoom.presentationScope(member)).not.toBe(scope);
  });

  it("throws when the identity is missing", () => {
    mocks.user.currentUser = null;
    const repo = new FirebaseRoomRepository(app, room, "player", undefined, storage);
    expect(() => repo.presentationScope(member)).toThrow("Identity changed");
  });
});

describe("FirebaseRoomRepository reconcile acceptedSequence", () => {
  const app = { name: "test", options: { projectId: "project" } } as ConstructorParameters<
    typeof FirebaseRoomRepository
  >[0];
  const room = asRoomId("room");
  const member = asMemberId("member");
  let storage: MemoryStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.currentUser = { uid: "uid-original" };
    storage = new MemoryStorage();
  });

  it("surfaces the receipt's acceptedSequence on the accepted result", async () => {
    const repo = new FirebaseRoomRepository(app, room, "player", undefined, storage);
    const commandId = "11111111-1111-4111-8111-111111111111";
    const command: RoomCommandRequest<EatTheReichCommand> = {
      commandId: asCommandId(commandId),
      payload: { type: "ClaimCharacter", characterId: "rook" },
    };
    mocks.send.mockRejectedValueOnce(new Error("offline"));
    void repo.dispatch(member, command);
    await new Promise((resolve) => setTimeout(resolve, 0));

    mocks.read
      .mockResolvedValueOnce(
        snapshot({
          receiptId: `member_${command.commandId}`,
          memberId: member,
          commandId: command.commandId,
          status: "accepted",
          acceptedSequence: 1,
          roomRevision: 4,
        }),
      )
      .mockResolvedValueOnce(
        snapshot({
          commandId: command.commandId,
          payload: { type: "CharacterClaimed", characterId: "rook", memberId: member },
        }),
      );

    const results = await repo.reconcilePending(member);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      status: "accepted",
      roomRevision: 4,
      acceptedSequence: 1,
    });
  });
});
