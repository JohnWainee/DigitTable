import { beforeEach, describe, expect, it, vi } from "vitest";
import { asCommandId, asMemberId, asRoomId, type RoomCommandRequest } from "@digitable/contracts";
import type { EatTheReichCommand } from "@digitable/template-eat-the-reich";
import { FirebaseRoomRepository } from "../../src/repository/FirebaseRoomRepository.js";
import { MemoryStorage } from "../memoryStorage.js";

const mocks = vi.hoisted(() => ({
  user: { currentUser: { uid: "uid-original" } },
  send: vi.fn(),
  read: vi.fn(),
  FunctionsError: class extends Error {
    constructor(public details: unknown) {
      super("Rejected by server");
    }
  },
}));
vi.mock("firebase/auth", () => ({ getAuth: () => mocks.user }));
vi.mock("firebase/functions", () => ({ FunctionsError: mocks.FunctionsError }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => path,
  getDoc: mocks.read,
  getDocFromServer: mocks.read,
  onSnapshot: vi.fn(),
}));
vi.mock("../../src/firebase/functions.js", () => ({
  getRoomFunctions: vi.fn(),
  callable: () => mocks.send,
}));
vi.mock("../../src/firebase/firestore.js", () => ({ getRoomFirestore: vi.fn() }));

describe("Firebase command reconciliation", () => {
  const room = asRoomId("room");
  const member = asMemberId("member");
  const app = { name: "test", options: { projectId: "project" } } as ConstructorParameters<
    typeof FirebaseRoomRepository
  >[0];
  let storage: MemoryStorage;
  let repo: FirebaseRoomRepository;
  const request = (): RoomCommandRequest<EatTheReichCommand> => ({
    commandId: asCommandId(crypto.randomUUID()),
    payload: { type: "ClaimCharacter" as const, characterId: "rook" },
  });
  const snapshot = (data?: unknown): { exists: () => boolean; data: () => unknown } => ({
    exists: () => data !== undefined,
    data: () => data,
  });
  const flush = async (): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.currentUser = { uid: "uid-original" };
    storage = new MemoryStorage();
    repo = new FirebaseRoomRepository(app, room, "player", undefined, storage);
  });

  it("a lost response stays pending, then the receipt settles it without resubmitting", async () => {
    const command = request();
    mocks.send.mockRejectedValueOnce(new Error("response lost after commit"));
    const result = repo.dispatch(member, command);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);
    expect(repo.pendingCommands(member)).toEqual([command]);
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
    await repo.reconcilePending(member);
    expect(await result).toMatchObject({
      status: "accepted",
      roomRevision: 4,
      sharedEvents: [{ type: "CharacterClaimed" }],
    });
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(repo.pendingCommands(member)).toEqual([]);
  });

  it("reload retries only a missing receipt, preserving the exact original wire request", async () => {
    const command = request();
    mocks.send.mockRejectedValueOnce(new Error("offline"));
    void repo.dispatch(member, command);
    await flush();
    const reloaded = new FirebaseRoomRepository(app, room, "player", undefined, storage);
    mocks.read.mockResolvedValueOnce(snapshot());
    mocks.send.mockResolvedValueOnce({
      data: { status: "accepted", commandId: command.commandId, roomRevision: 1, sharedEvents: [] },
    });
    await reloaded.reconcilePending(member);
    expect(mocks.send.mock.calls[1]).toEqual(mocks.send.mock.calls[0]);
    expect(reloaded.pendingCommands(member)).toEqual([]);
  });

  it("replays a durable rejection to listeners and never re-decides it", async () => {
    const command = request();
    mocks.send.mockRejectedValueOnce(new Error("offline"));
    const result = repo.dispatch(member, command);
    await flush();
    const error = vi.fn();
    repo.subscribeToErrors(error);
    mocks.read.mockResolvedValueOnce(
      snapshot({
        receiptId: `member_${command.commandId}`,
        memberId: member,
        commandId: command.commandId,
        status: "rejected",
        acceptedSequence: null,
        roomRevision: 1,
        code: "CHARACTER_TAKEN",
        message: "Choose another character.",
      }),
    );
    await repo.reconcilePending(member);
    expect(await result).toMatchObject({ status: "rejected", code: "CHARACTER_TAKEN" });
    expect(error).toHaveBeenCalledWith(expect.objectContaining({ code: "CHARACTER_TAKEN" }));
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("a deliberate UNKNOWN_ACTION rejection is terminal, unlike a transport exception", async () => {
    mocks.send.mockRejectedValueOnce(new mocks.FunctionsError({ code: "UNKNOWN_ACTION" }));
    expect(await repo.dispatch(member, request())).toMatchObject({
      status: "rejected",
      code: "UNKNOWN_ACTION",
    });
    expect(repo.pendingCommands(member)).toEqual([]);
  });

  it("does not replay old commands under a new identity", async () => {
    mocks.send.mockRejectedValueOnce(new Error("offline"));
    void repo.dispatch(member, request());
    await flush();
    mocks.user.currentUser = { uid: "replacement" };
    await expect(repo.reconcilePending(member)).rejects.toThrow("Identity changed");
    const replacement = new FirebaseRoomRepository(app, room, "player", undefined, storage);
    expect(await replacement.reconcilePending(member)).toEqual([]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it("does not send if durable storage fails", async () => {
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(await repo.dispatch(member, request())).toMatchObject({
      status: "rejected",
      code: "INVALID_REQUEST",
    });
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
