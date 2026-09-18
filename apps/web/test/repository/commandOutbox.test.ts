import { beforeEach, describe, expect, it } from "vitest";
import { asCommandId, asMemberId, asRoomId, type RoomCommandRequest } from "@digitable/contracts";
import type { EatTheReichCommand } from "@digitable/template-eat-the-reich";
import { CommandOutbox } from "../../src/repository/commandOutbox.js";
import { MemoryStorage } from "../memoryStorage.js";

describe("durable command outbox", () => {
  let storage: MemoryStorage;
  const room = asRoomId("room");
  const member = asMemberId("member");
  const request = (): RoomCommandRequest<EatTheReichCommand> => ({
    commandId: asCommandId(crypto.randomUUID()),
    payload: { type: "ClaimCharacter" as const, characterId: "rook" },
    expectedRevision: 7,
  });
  const queue = (
    uid = "uid",
    project = "project",
    roomId = room,
    memberId = member,
  ): CommandOutbox => new CommandOutbox(storage, project, uid, roomId, memberId);
  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("survives a new instance and preserves IDs, payload, revisions and template versions", () => {
    const original = queue().remember(request());
    expect(queue().read()).toEqual([original]);
    expect(original.templateVersion).toBeTruthy();
  });
  it("isolates project, identity, room and seat", () => {
    queue().remember(request());
    expect(queue("replacement").read()).toEqual([]);
    expect(queue("uid", "other-project").read()).toEqual([]);
    expect(queue("uid", "project", asRoomId("other-room")).read()).toEqual([]);
    expect(queue("uid", "project", room, asMemberId("other-member")).read()).toEqual([]);
  });
  it("retains commands from another tab when one command is acknowledged", () => {
    const first = request();
    const second = request();
    queue().remember(first);
    queue().remember(second);
    queue().forget(first.commandId);
    expect(
      queue()
        .read()
        .map((entry) => entry.request),
    ).toEqual([second]);
  });
  it("refuses changed payloads under the same ID", () => {
    const original = request();
    queue().remember(original);
    expect(() =>
      queue().remember({ ...original, payload: { type: "ClaimCharacter", characterId: "vesper" } }),
    ).toThrow();
    expect(queue().read()[0]?.request).toEqual(original);
  });
  it("fails closed on damaged storage instead of silently forgetting commands", () => {
    queue().remember(request());
    storage.setItem(storage.key(0)!, "broken-json");
    expect(() => queue().read()).toThrow();
    expect(storage.length).toBe(1);
  });
});
