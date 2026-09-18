import { describe, expect, it } from "vitest";
import type { EatTheReichEvent } from "@digitable/template-eat-the-reich";
import type { PresentationItem } from "../../src/session/useRoomProjection.js";
import {
  isHeldForResolution,
  isOwnResolutionItem,
  selectOwnResolution,
} from "../../src/session/presentationQueue.js";

type ActionResolved = Extract<EatTheReichEvent, { type: "ActionResolved" }>;

const resolved = (rollId: string, characterId: string): ActionResolved => ({
  type: "ActionResolved",
  rollId,
  characterId,
  allocations: [],
  objectiveDeltas: [],
  threatDeltas: [],
  bloodDelta: 0,
  itemRestoreDeltas: [],
  injuryClearedCount: 0,
  remainingAttackSuccessesAfterAllocation: 0,
  attackBumpThreatId: null,
  injuryMark: null,
  injuryChoicePendingMode: null,
});

function item(
  payload: EatTheReichEvent,
  options: {
    readonly eventId?: string;
    readonly sequence?: number;
    readonly roomRevision?: number;
    readonly attackSuccessesRolled?: number | null;
  } = {},
): PresentationItem {
  const sequence = options.sequence ?? 1;
  return {
    eventId: options.eventId ?? `event-${sequence}`,
    commandId: `cmd-${sequence}`,
    sequence,
    roomRevision: options.roomRevision ?? sequence,
    payload,
    partitions: ["shared"],
    attackSuccessesRolled: options.attackSuccessesRolled ?? null,
  };
}

describe("selectOwnResolution", () => {
  it("returns the lowest-sequence own resolution", () => {
    const queue = [
      item(resolved("roll-a", "rook"), { eventId: "e1", sequence: 1 }),
      item(resolved("roll-b", "rook"), { eventId: "e2", sequence: 2 }),
    ];
    expect(selectOwnResolution(queue, "rook")?.event.rollId).toBe("roll-a");
  });

  it("ignores another character's resolution", () => {
    const queue = [
      item(resolved("roll-a", "vesper"), { eventId: "e1", sequence: 1 }),
      item(resolved("roll-b", "rook"), { eventId: "e2", sequence: 2 }),
    ];
    expect(selectOwnResolution(queue, "rook")?.event.rollId).toBe("roll-b");
    expect(selectOwnResolution(queue, "nobody")).toBeNull();
  });

  it("merges a later InjuryCategoryChosen for the same roll and character", () => {
    const queue = [
      item(resolved("roll-a", "rook"), { eventId: "e1", sequence: 1 }),
      item(
        {
          type: "InjuryCategoryChosen",
          rollId: "roll-a",
          characterId: "rook",
          mark: { categoryId: "flesh", boxIndexes: [0], downed: false, rescueObjective: null },
        },
        { eventId: "e2", sequence: 2 },
      ),
    ];
    const selection = selectOwnResolution(queue, "rook");
    expect(selection?.event.injuryMark).toEqual({
      categoryId: "flesh",
      boxIndexes: [0],
      downed: false,
      rescueObjective: null,
    });
    expect(selection?.event.injuryChoicePendingMode).toBeNull();
    expect(selection?.eventIds).toEqual(["e1", "e2"]);
  });

  it("does not merge a different roll's or another character's choice", () => {
    const queue = [
      item(resolved("roll-a", "rook"), { eventId: "e1", sequence: 1 }),
      item(
        {
          type: "InjuryCategoryChosen",
          rollId: "roll-other",
          characterId: "rook",
          mark: { categoryId: "flesh", boxIndexes: [0], downed: false, rescueObjective: null },
        },
        { eventId: "e2", sequence: 2 },
      ),
    ];
    expect(selectOwnResolution(queue, "rook")?.eventIds).toEqual(["e1"]);
  });

  it("returns null on an empty queue", () => {
    expect(selectOwnResolution([], "rook")).toBeNull();
  });

  it("treats a null attackSuccessesRolled as 0", () => {
    const queue = [item(resolved("roll-a", "rook"), { attackSuccessesRolled: null })];
    expect(selectOwnResolution(queue, "rook")?.attackSuccessesRolled).toBe(0);
  });

  it("carries the item's attackSuccessesRolled through", () => {
    const queue = [item(resolved("roll-a", "rook"), { attackSuccessesRolled: 3 })];
    expect(selectOwnResolution(queue, "rook")?.attackSuccessesRolled).toBe(3);
  });
});

describe("isOwnResolutionItem", () => {
  it("is true for the character's resolved and injury-chosen items", () => {
    expect(isOwnResolutionItem(item(resolved("roll-a", "rook")), "rook")).toBe(true);
    expect(
      isOwnResolutionItem(
        item({
          type: "InjuryCategoryChosen",
          rollId: "roll-a",
          characterId: "rook",
          mark: { categoryId: "flesh", boxIndexes: [0], downed: false, rescueObjective: null },
        }),
        "rook",
      ),
    ).toBe(true);
  });

  it("is false for another character or another event type", () => {
    expect(isOwnResolutionItem(item(resolved("roll-a", "vesper")), "rook")).toBe(false);
    expect(isOwnResolutionItem(item({ type: "Paused" }), "rook")).toBe(false);
  });
});

describe("isHeldForResolution", () => {
  const chosen = (rollId: string, characterId = "rook"): EatTheReichEvent => ({
    type: "InjuryCategoryChosen",
    rollId,
    characterId,
    mark: { categoryId: "flesh", boxIndexes: [0], downed: false, rescueObjective: null },
  });

  it("holds an own ActionResolved", () => {
    const own = item(resolved("roll-a", "rook"), { eventId: "e1", sequence: 1 });
    expect(isHeldForResolution([own], own, "rook")).toBe(true);
  });

  it("holds an own InjuryCategoryChosen only while its ActionResolved is queued", () => {
    const summary = item(resolved("roll-a", "rook"), { eventId: "e1", sequence: 1 });
    const mark = item(chosen("roll-a"), { eventId: "e2", sequence: 2 });
    expect(isHeldForResolution([summary, mark], mark, "rook")).toBe(true);
    // The summary was dismissed earlier: nothing will merge this, so it is released.
    expect(isHeldForResolution([mark], mark, "rook")).toBe(false);
  });

  it("does not let another roll's ActionResolved hold an orphaned InjuryCategoryChosen", () => {
    const other = item(resolved("roll-b", "rook"), { eventId: "e1", sequence: 1 });
    const mark = item(chosen("roll-a"), { eventId: "e2", sequence: 2 });
    expect(isHeldForResolution([other, mark], mark, "rook")).toBe(false);
  });

  it("never holds another character's or unrelated items", () => {
    const theirs = item(resolved("roll-a", "vesper"), { eventId: "e1", sequence: 1 });
    const paused = item({ type: "Paused" }, { eventId: "e2", sequence: 2 });
    expect(isHeldForResolution([theirs, paused], theirs, "rook")).toBe(false);
    expect(isHeldForResolution([theirs, paused], paused, "rook")).toBe(false);
  });
});
