import {
  EVENT_TAIL_PAGE_LIMIT,
  asMemberId,
  asRoomId,
  type EventTailCursor,
  type EventTailPartition,
  type EventTailRecord,
} from "@digitable/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  assembleTailPage,
  authorizedPartitions,
  clampTailLimit,
  parseTailDocument,
  partitionCollectionPath,
} from "../../src/repository/eventTail.js";

const ROOM = asRoomId("room-1");
const MEMBER = asMemberId("member-1");

function record(
  partition: EventTailPartition,
  sequence: number,
  eventId = `event-${partition}-${sequence}`,
): EventTailRecord<{ type: "Ping"; value: number }> {
  return {
    eventId,
    commandId: `command-${partition}-${sequence}`,
    sequence,
    roomRevision: 1,
    partition,
    payload: { type: "Ping", value: sequence },
  };
}

const ZERO: EventTailCursor = { shared: 0, gm: 0, member: 0 };

describe("authorizedPartitions", () => {
  it("grants a player shared plus its own member partition", () => {
    expect(authorizedPartitions("player")).toEqual(["shared", "member"]);
  });

  it("grants the GM shared, gm, and its own member partition", () => {
    expect(authorizedPartitions("gm")).toEqual(["shared", "gm", "member"]);
  });

  it("grants the table seat shared only", () => {
    expect(authorizedPartitions("table")).toEqual(["shared"]);
  });
});

describe("partitionCollectionPath", () => {
  it("builds the three partition paths", () => {
    expect(partitionCollectionPath(ROOM, "shared", MEMBER)).toBe(
      "rooms/room-1/events/shared/items",
    );
    expect(partitionCollectionPath(ROOM, "gm", MEMBER)).toBe("rooms/room-1/events/gm/items");
    expect(partitionCollectionPath(ROOM, "member", MEMBER)).toBe(
      "rooms/room-1/events/member-member-1/items",
    );
  });
});

describe("parseTailDocument", () => {
  const valid = {
    eventId: "event-1",
    commandId: "command-1",
    sequence: 7,
    roomRevision: 3,
    actor: { kind: "member", memberId: MEMBER },
    occurredAtServer: "2026-09-17T00:00:00.000Z",
    payload: { type: "Ping" },
  };
  const parseEvent = (payload: unknown): { type: string } => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      (payload as { type?: unknown }).type !== "Ping"
    ) {
      throw new Error("bad payload");
    }
    return payload as { type: string };
  };

  it("accepts a valid document and strips envelope-only fields", () => {
    const parsed = parseTailDocument("shared", "7", valid, parseEvent);
    expect(parsed).toEqual({
      eventId: "event-1",
      commandId: "command-1",
      sequence: 7,
      roomRevision: 3,
      partition: "shared",
      payload: { type: "Ping" },
    });
  });

  it("never carries an actor field, even when the stored document had one", () => {
    const parsed = parseTailDocument("gm", "7", valid, parseEvent);
    expect("actor" in parsed).toBe(false);
    expect("occurredAtServer" in parsed).toBe(false);
    expect(Object.keys(parsed).sort()).toEqual([
      "commandId",
      "eventId",
      "partition",
      "payload",
      "roomRevision",
      "sequence",
    ]);
  });

  it("rejects a sequence/docId mismatch", () => {
    expect(() => parseTailDocument("shared", "8", valid, parseEvent)).toThrow(/mismatch/);
  });

  it("rejects a non-integer sequence", () => {
    expect(() =>
      parseTailDocument("shared", "1.5", { ...valid, sequence: 1.5 }, parseEvent),
    ).toThrow();
  });

  it("rejects a negative or zero sequence", () => {
    expect(() => parseTailDocument("shared", "0", { ...valid, sequence: 0 }, parseEvent)).toThrow();
    expect(() =>
      parseTailDocument("shared", "-1", { ...valid, sequence: -1 }, parseEvent),
    ).toThrow();
  });

  it("rejects empty eventId and commandId", () => {
    expect(() => parseTailDocument("shared", "7", { ...valid, eventId: "" }, parseEvent)).toThrow();
    expect(() =>
      parseTailDocument("shared", "7", { ...valid, commandId: "" }, parseEvent),
    ).toThrow();
  });

  it("rejects a bad roomRevision", () => {
    expect(() =>
      parseTailDocument("shared", "7", { ...valid, roomRevision: -1 }, parseEvent),
    ).toThrow();
    expect(() =>
      parseTailDocument("shared", "7", { ...valid, roomRevision: 1.5 }, parseEvent),
    ).toThrow();
  });

  it("rejects a document whose payload parseEvent throws on", () => {
    expect(() =>
      parseTailDocument("shared", "7", { ...valid, payload: { type: "Pong" } }, parseEvent),
    ).toThrow(/bad payload/);
  });

  it("rejects non-object data", () => {
    expect(() => parseTailDocument("shared", "7", null, parseEvent)).toThrow();
  });
});

describe("assembleTailPage ordering and cursors", () => {
  it("merges ascending with gm/member/shared tie order and eventId last", () => {
    const page = assembleTailPage(
      {
        gm: [record("gm", 2, "b")],
        member: [record("member", 2, "c")],
        shared: [record("shared", 1), record("shared", 3)],
      },
      ZERO,
      50,
    );
    expect(page.records.map((r) => [r.partition, r.sequence, r.eventId])).toEqual([
      ["shared", 1, "event-shared-1"],
      ["gm", 2, "b"],
      ["member", 2, "c"],
      ["shared", 3, "event-shared-3"],
    ]);
  });

  it("advances the cursor per partition and never lowers it", () => {
    const page = assembleTailPage(
      {
        shared: [record("shared", 5)],
        gm: [record("gm", 4)],
        member: [record("member", 9)],
      },
      { shared: 2, gm: 7, member: 0 },
      50,
    );
    expect(page.cursor).toEqual({ shared: 5, gm: 7, member: 9 });
    expect(page.hasMore).toBe(false);
  });

  it("defensively drops records at or below the partition cursor", () => {
    const page = assembleTailPage(
      { shared: [record("shared", 5), record("shared", 6)] },
      { shared: 5, gm: 0, member: 0 },
      50,
    );
    expect(page.records.map((r) => r.sequence)).toEqual([6]);
    expect(page.cursor.shared).toBe(6);
  });

  it("reports hasMore when a partition returned a full page", () => {
    const page = assembleTailPage(
      { shared: [record("shared", 1), record("shared", 2)], gm: [record("gm", 1)] },
      ZERO,
      2,
    );
    expect(page.hasMore).toBe(true);
  });

  it("withholds everything above a full partition's last sequence (watermark)", () => {
    // shared is full at 91..93; gm is exhausted below the limit, so it is not
    // full and contributes nothing to the watermark (W = 93). Everything is
    // released and shared's cursor advances to its full page's last sequence.
    const page = assembleTailPage(
      {
        shared: [record("shared", 91), record("shared", 92), record("shared", 93)],
        gm: [record("gm", 51), record("gm", 52)],
      },
      ZERO,
      3,
    );
    expect(page.records.map((r) => r.sequence)).toEqual([51, 52, 91, 92, 93]);
    expect(page.cursor).toEqual({ shared: 93, gm: 52, member: 0 });
    expect(page.hasMore).toBe(true);
  });

  it("holds back a faster partition until the slower full partition catches up", () => {
    // Both partitions are full: W = min(93, 53) = 53. Only sequences <= 53
    // are released; shared's records are re-read on the next page.
    const page = assembleTailPage(
      {
        shared: [record("shared", 91), record("shared", 92), record("shared", 93)],
        member: [record("member", 51), record("member", 52), record("member", 53)],
      },
      ZERO,
      3,
    );
    expect(page.records.map((r) => r.sequence)).toEqual([51, 52, 53]);
    expect(page.cursor).toEqual({ shared: 0, gm: 0, member: 53 });
    expect(page.hasMore).toBe(true);
  });

  it("treats an empty result set as exhausted", () => {
    const page = assembleTailPage({ shared: [] }, ZERO, 10);
    expect(page.records).toEqual([]);
    expect(page.cursor).toEqual(ZERO);
    expect(page.hasMore).toBe(false);
  });
});

describe("assembleTailPage paging property", () => {
  const partitions: readonly EventTailPartition[] = ["shared", "gm", "member"];
  const partitionArb = fc
    .uniqueArray(fc.integer({ min: 1, max: 25 }), { maxLength: 8 })
    .map((sequences) => [...sequences].sort((a, b) => a - b).map((s) => record("shared", s)));
  const logArb = fc.record({
    shared: partitionArb,
    gm: partitionArb,
    member: partitionArb,
  });

  it("releases every stored record exactly once, globally ascending", () => {
    fc.assert(
      fc.property(logArb, fc.integer({ min: 1, max: 4 }), (rawLog, limit) => {
        const store: Record<
          EventTailPartition,
          readonly EventTailRecord<{ type: "Ping"; value: number }>[]
        > = {
          shared: rawLog.shared.map((r) => ({ ...r, partition: "shared" as const })),
          gm: rawLog.gm.map((r) => ({ ...r, partition: "gm" as const })),
          member: rawLog.member.map((r) => ({ ...r, partition: "member" as const })),
        };

        const read = (
          after: EventTailCursor,
        ): Partial<
          Record<EventTailPartition, readonly EventTailRecord<{ type: "Ping"; value: number }>[]>
        > => {
          const out: Partial<
            Record<EventTailPartition, readonly EventTailRecord<{ type: "Ping"; value: number }>[]>
          > = {};
          for (const partition of partitions) {
            out[partition] = store[partition]
              .filter((r) => r.sequence > after[partition])
              .slice(0, limit);
          }
          return out;
        };

        let cursor: EventTailCursor = { shared: 0, gm: 0, member: 0 };
        const released: EventTailRecord<{ type: "Ping"; value: number }>[] = [];
        let guard = 0;
        for (;;) {
          const page = assembleTailPage(read(cursor), cursor, limit);
          released.push(...page.records);
          cursor = page.cursor;
          if (!page.hasMore) break;
          guard += 1;
          if (guard > 200) throw new Error("paging did not terminate");
        }

        const keys = released.map((r) => `${r.partition}:${r.sequence}`);
        expect(new Set(keys).size).toBe(keys.length);
        for (let i = 1; i < released.length; i += 1) {
          expect(released[i]!.sequence).toBeGreaterThanOrEqual(released[i - 1]!.sequence);
        }

        const stored = partitions.flatMap((partition) =>
          store[partition].map((r) => `${r.partition}:${r.sequence}`),
        );
        expect([...keys].sort()).toEqual([...stored].sort());
      }),
      { numRuns: 200 },
    );
  });
});

describe("clampTailLimit", () => {
  it("defaults to the page limit", () => {
    expect(clampTailLimit()).toBe(EVENT_TAIL_PAGE_LIMIT);
    expect(clampTailLimit(undefined)).toBe(EVENT_TAIL_PAGE_LIMIT);
  });

  it("clamps into [1, EVENT_TAIL_PAGE_LIMIT]", () => {
    expect(clampTailLimit(0)).toBe(1);
    expect(clampTailLimit(-5)).toBe(1);
    expect(clampTailLimit(EVENT_TAIL_PAGE_LIMIT + 100)).toBe(EVENT_TAIL_PAGE_LIMIT);
  });

  it("floors non-integers and tolerates NaN", () => {
    expect(clampTailLimit(3.9)).toBe(3);
    expect(clampTailLimit(0.5)).toBe(1);
    expect(clampTailLimit(Number.NaN)).toBe(EVENT_TAIL_PAGE_LIMIT);
    expect(clampTailLimit(Number.POSITIVE_INFINITY)).toBe(EVENT_TAIL_PAGE_LIMIT);
  });
});
