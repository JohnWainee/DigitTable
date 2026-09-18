import fc from "fast-check";
import { beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_EVENT_TAIL_CURSOR,
  type EventTailCursor,
  type EventTailPartition,
  type EventTailRecord,
} from "@digitable/contracts";
import {
  MAX_ACKNOWLEDGED_EVENT_IDS,
  MAX_ROLL_CONTEXTS,
  PresentationLedgerStorage,
  PresentationSession,
  emptyLedgerData,
  type PresentationLedgerData,
  type PresentationSessionOptions,
  type RollContext,
} from "../../src/session/presentationLedger.js";
import { MemoryStorage } from "../memoryStorage.js";

const KEY = "digitable.presented.v1:viewer";

interface TestPayload {
  readonly label: string;
  readonly roll?: RollContext;
}

const rollOf = (payload: TestPayload): RollContext | null => payload.roll ?? null;

function record(
  eventId: string,
  partition: EventTailPartition,
  sequence: number,
  payload: TestPayload = { label: eventId },
): EventTailRecord<TestPayload> {
  return {
    eventId,
    commandId: `cmd:${eventId}`,
    sequence,
    roomRevision: sequence,
    partition,
    payload,
  };
}

function validData(overrides: Partial<PresentationLedgerData> = {}): PresentationLedgerData {
  return { ...emptyLedgerData(), ...overrides };
}

function makeSession(
  store: PresentationLedgerStorage,
  options: {
    readonly initial?: PresentationLedgerData;
    readonly limits?: PresentationSessionOptions<TestPayload>["limits"];
    readonly rollContextOf?: (payload: TestPayload) => RollContext | null;
  } = {},
): PresentationSession<TestPayload> {
  return new PresentationSession<TestPayload>({
    store,
    initial: options.initial ?? emptyLedgerData(),
    rollContextOf: options.rollContextOf ?? rollOf,
    limits: options.limits ?? {},
  });
}

describe("PresentationLedgerStorage", () => {
  let storage: MemoryStorage;
  const ledger = (scope = "viewer"): PresentationLedgerStorage =>
    new PresentationLedgerStorage(storage, scope);

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("loads null when absent or the JSON is malformed", () => {
    expect(ledger().load()).toBeNull();
    storage.setItem(KEY, "{not json");
    expect(ledger().load()).toBeNull();
  });

  it("strictly rejects wrong types, over-cap arrays and duplicates", () => {
    const overCapIds = Array.from({ length: MAX_ACKNOWLEDGED_EVENT_IDS + 1 }, (_, i) => `e${i}`);
    const overCapRolls = Array.from({ length: MAX_ROLL_CONTEXTS + 1 }, (_, i) => ({
      rollId: `r${i}`,
      attackSuccessesRolled: i,
    }));
    const cursor = { shared: 0, gm: 0, member: 0 };
    const invalid: unknown[] = [
      null,
      42,
      "string",
      [],
      {},
      { cursor, acknowledgedEventIds: [] }, // missing rollContexts
      { cursor: { shared: -1, gm: 0, member: 0 }, acknowledgedEventIds: [], rollContexts: [] },
      { cursor: { shared: 0, gm: 1.5, member: 0 }, acknowledgedEventIds: [], rollContexts: [] },
      { cursor: { shared: 0, gm: 0, member: "0" }, acknowledgedEventIds: [], rollContexts: [] },
      { cursor, acknowledgedEventIds: "x", rollContexts: [] },
      { cursor, acknowledgedEventIds: [1], rollContexts: [] },
      { cursor, acknowledgedEventIds: [""], rollContexts: [] },
      { cursor, acknowledgedEventIds: ["a", "a"], rollContexts: [] },
      { cursor, acknowledgedEventIds: overCapIds, rollContexts: [] },
      { cursor, acknowledgedEventIds: [], rollContexts: [{}] },
      {
        cursor,
        acknowledgedEventIds: [],
        rollContexts: [{ rollId: "", attackSuccessesRolled: 0 }],
      },
      {
        cursor,
        acknowledgedEventIds: [],
        rollContexts: [{ rollId: "r", attackSuccessesRolled: -1 }],
      },
      {
        cursor,
        acknowledgedEventIds: [],
        rollContexts: [{ rollId: "r", attackSuccessesRolled: 1.2 }],
      },
      {
        cursor,
        acknowledgedEventIds: [],
        rollContexts: [
          { rollId: "r", attackSuccessesRolled: 0 },
          { rollId: "r", attackSuccessesRolled: 1 },
        ],
      },
      { cursor, acknowledgedEventIds: [], rollContexts: overCapRolls },
    ];
    for (const value of invalid) {
      storage.setItem(KEY, JSON.stringify(value));
      expect(ledger().load(), JSON.stringify(value)).toBeNull();
    }
  });

  it("tolerates unknown extra top-level keys", () => {
    const data = validData({
      cursor: { shared: 3, gm: 1, member: 0 },
      acknowledgedEventIds: ["e1"],
      rollContexts: [{ rollId: "r", attackSuccessesRolled: 2 }],
    });
    storage.setItem(KEY, JSON.stringify({ ...data, future: { kind: "unknown" } }));
    expect(ledger().load()).toEqual(data);
  });

  it("round-trips a saved document", () => {
    const data = validData({
      cursor: { shared: 4, gm: 1, member: 2 },
      acknowledgedEventIds: ["e1", "e2"],
      rollContexts: [{ rollId: "r", attackSuccessesRolled: 2 }],
    });
    expect(ledger().save(data)).toBe(true);
    expect(ledger().load()).toEqual(data);
  });

  it("isolates scopes", () => {
    ledger("viewer-a").save(validData({ cursor: { shared: 5, gm: 0, member: 0 } }));
    expect(ledger("viewer-bond").load()).toBeNull();
    expect(ledger("viewer-a").load()?.cursor.shared).toBe(5);
  });

  it("merges with stored data so two tabs do not regress each other", () => {
    const first = ledger("shared-scope");
    const second = ledger("shared-scope");
    first.save(
      validData({
        cursor: { shared: 5, gm: 0, member: 0 },
        acknowledgedEventIds: ["e1"],
        rollContexts: [{ rollId: "r1", attackSuccessesRolled: 1 }],
      }),
    );
    second.save(
      validData({
        cursor: { shared: 1, gm: 2, member: 0 },
        acknowledgedEventIds: ["e2"],
        rollContexts: [
          { rollId: "r1", attackSuccessesRolled: 9 },
          { rollId: "r2", attackSuccessesRolled: 5 },
        ],
      }),
    );
    expect(first.load()).toEqual(
      validData({
        cursor: { shared: 5, gm: 2, member: 0 },
        acknowledgedEventIds: ["e1", "e2"],
        rollContexts: [
          { rollId: "r1", attackSuccessesRolled: 9 },
          { rollId: "r2", attackSuccessesRolled: 5 },
        ],
      }),
    );
  });

  it("ignores invalid stored data when merging", () => {
    storage.setItem(KEY, "garbage");
    const data = validData({ cursor: { shared: 7, gm: 0, member: 0 } });
    expect(ledger().save(data)).toBe(true);
    expect(ledger().load()).toEqual(data);
  });

  it("returns false without throwing when setItem throws", () => {
    const throwing = {
      length: 0,
      key: () => null,
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
      removeItem: () => undefined,
      clear: () => undefined,
    } as Storage;
    const ledger = new PresentationLedgerStorage(throwing, "viewer");
    expect(ledger.save(emptyLedgerData())).toBe(false);
  });
});

describe("PresentationSession", () => {
  let storage: MemoryStorage;
  let store: PresentationLedgerStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    store = new PresentationLedgerStorage(storage, "viewer");
  });

  it("orders pending events by sequence, then eventId", () => {
    const session = makeSession(store);
    session.ingest([record("e5b", "gm", 5), record("e5a", "shared", 5), record("e2", "shared", 2)]);
    expect(session.pending().map((event) => event.eventId)).toEqual(["e2", "e5a", "e5b"]);
  });

  it("merges copies by id, prefers gm > member > shared, lists every partition, ack removes all", () => {
    const session = makeSession(store);
    session.ingest([
      record("e1", "shared", 1, { label: "shared" }),
      record("e1", "member", 1, { label: "member" }),
      record("e1", "gm", 1, { label: "gm" }),
    ]);
    expect(session.pending()).toEqual([
      {
        eventId: "e1",
        commandId: "cmd:e1",
        sequence: 1,
        roomRevision: 1,
        payload: { label: "gm" },
        partitions: ["gm", "member", "shared"],
      },
    ]);
    session.acknowledge("e1");
    expect(session.pending()).toEqual([]);
    // A later copy of an already-acknowledged event is ignored even in a fresh partition.
    session.ingest([record("e1", "shared", 1, { label: "late" })]);
    expect(session.pending()).toEqual([]);
  });

  it("prefers the most-private copy as later partitions arrive", () => {
    const session = makeSession(store);
    session.ingest([record("e1", "shared", 1, { label: "shared" })]);
    expect(session.pending()[0]?.payload).toEqual({ label: "shared" });
    session.ingest([record("e1", "member", 1, { label: "member" })]);
    expect(session.pending()[0]?.payload).toEqual({ label: "member" });
    session.ingest([record("e1", "gm", 1, { label: "gm" })]);
    expect(session.pending()[0]?.payload).toEqual({ label: "gm" });
    expect(session.pending()[0]?.partitions).toEqual(["gm", "member", "shared"]);
  });

  it("ignores a second copy of an acknowledged event arriving in a later ingest", () => {
    const session = makeSession(store);
    session.ingest([record("e1", "shared", 1), record("e2", "shared", 2)]);
    session.acknowledge("e1");
    // cursor.gm is still 0, so only the acknowledged-id filter can drop this copy.
    session.ingest([record("e1", "gm", 1, { label: "gm" })]);
    expect(session.pending().map((event) => event.eventId)).toEqual(["e2"]);
  });

  it("does not present an acknowledged event again after a reload", () => {
    const session = makeSession(store);
    session.ingest([record("e1", "shared", 1)]);
    session.acknowledge("e1");
    const reloaded = makeSession(store, { initial: store.load() ?? emptyLedgerData() });
    reloaded.ingest([record("e1", "shared", 1)]);
    expect(reloaded.pending()).toEqual([]);
  });

  it("keeps the cursor below an unacknowledged head so a reload re-reads it", () => {
    const session = makeSession(store);
    session.ingest([record("e1", "shared", 1), record("e2", "shared", 2)]);
    session.acknowledge("e2");
    expect(session.data().cursor.shared).toBe(0);
    const reloaded = makeSession(store, { initial: store.load() ?? emptyLedgerData() });
    reloaded.ingest([record("e1", "shared", 1), record("e2", "shared", 2)]);
    expect(reloaded.pending().map((event) => event.eventId)).toEqual(["e1"]);
  });

  it("never decreases its cursor", () => {
    const session = makeSession(store);
    const cursor = (): EventTailCursor => session.data().cursor;
    session.ingest([record("e1", "shared", 1), record("e2", "shared", 2), record("e3", "gm", 3)]);
    const first = cursor();
    session.acknowledge("e1");
    const second = cursor();
    session.ingest([record("e4", "member", 4)]);
    const third = cursor();
    session.acknowledge("e2");
    session.acknowledge("e3");
    session.acknowledge("e4");
    const fourth = cursor();
    for (const partition of ["shared", "gm", "member"] as const) {
      expect(second[partition]).toBeGreaterThanOrEqual(first[partition]);
      expect(third[partition]).toBeGreaterThanOrEqual(second[partition]);
      expect(fourth[partition]).toBeGreaterThanOrEqual(third[partition]);
    }
  });

  it("trims acknowledged ids to the newest cap (FIFO)", () => {
    const session = makeSession(store, { limits: { maxAcknowledged: 2 } });
    session.ingest([
      record("e1", "shared", 1),
      record("e2", "shared", 2),
      record("e3", "shared", 3),
    ]);
    session.acknowledge("e1");
    session.acknowledge("e2");
    session.acknowledge("e3");
    expect(session.data().acknowledgedEventIds).toEqual(["e2", "e3"]);
  });

  it("caps and replaces roll contexts, keeping the newest position", () => {
    const session = makeSession(store);
    const records: EventTailRecord<TestPayload>[] = [];
    for (let index = 0; index <= MAX_ROLL_CONTEXTS; index += 1) {
      records.push(
        record(`e${index}`, "shared", index + 1, {
          label: `e${index}`,
          roll: { rollId: `r${index}`, attackSuccessesRolled: index },
        }),
      );
    }
    session.ingest(records);
    const data = session.data();
    expect(data.rollContexts).toHaveLength(MAX_ROLL_CONTEXTS);
    expect(session.attackSuccessesRolled("r0")).toBeNull();
    expect(session.attackSuccessesRolled(`r${MAX_ROLL_CONTEXTS}`)).toBe(MAX_ROLL_CONTEXTS);

    // Re-remembering an existing rollId replaces its value and moves it to the newest position.
    session.ingest([
      record("repeat", "gm", MAX_ROLL_CONTEXTS + 2, {
        label: "repeat",
        roll: { rollId: "r10", attackSuccessesRolled: 999 },
      }),
    ]);
    expect(session.attackSuccessesRolled("r10")).toBe(999);
    expect(session.data().rollContexts.at(-1)).toEqual({
      rollId: "r10",
      attackSuccessesRolled: 999,
    });
  });

  it("extracts roll context from acknowledged/ignored records and survives reload", () => {
    const session = makeSession(store);
    session.ingest([
      record("e1", "shared", 1, {
        label: "e1",
        roll: { rollId: "r", attackSuccessesRolled: 1 },
      }),
    ]);
    session.acknowledge("e1");
    session.ingest([
      record("e1", "shared", 1, {
        label: "e1",
        roll: { rollId: "r", attackSuccessesRolled: 2 },
      }),
    ]);
    expect(session.attackSuccessesRolled("r")).toBe(2);
    const reloaded = makeSession(store, { initial: store.load() ?? emptyLedgerData() });
    expect(reloaded.attackSuccessesRolled("r")).toBe(2);
  });

  it("fetchCursor is at least the data cursor and advances on ingest with nothing pending", () => {
    const session = makeSession(store);
    session.ingest([record("e1", "shared", 2)]);
    session.acknowledge("e1");
    expect(session.pending()).toEqual([]);
    const before = session.fetchCursor();
    session.ingest([record("e2", "gm", 7)]);
    const fetchCursor = session.fetchCursor();
    const dataCursor = session.data().cursor;
    for (const partition of ["shared", "gm", "member"] as const) {
      expect(fetchCursor[partition]).toBeGreaterThanOrEqual(dataCursor[partition]);
    }
    expect(fetchCursor.gm).toBe(7);
    expect(fetchCursor.gm).toBeGreaterThanOrEqual(before.gm);
    expect(dataCursor.gm).toBe(6);
  });

  it("expires lagging events and unblocks the cursor", () => {
    const session = makeSession(store, {
      limits: { maxSequenceLag: 5, maxPending: 100, maxAcknowledged: 100 },
    });
    session.ingest([record("e1", "shared", 1), record("e10", "shared", 10)]);
    expect(session.pending().map((event) => event.eventId)).toEqual(["e10"]);
    session.acknowledge("e10");
    expect(session.data().cursor.shared).toBe(10);
    // The expired event never reappears, even from a partition whose cursor is still low.
    session.ingest([record("e1", "gm", 1)]);
    expect(session.pending()).toEqual([]);
  });

  it("expires the oldest events when the pending cap is exceeded", () => {
    const session = makeSession(store, {
      limits: { maxPending: 2, maxSequenceLag: 1000, maxAcknowledged: 100 },
    });
    session.ingest([1, 2, 3, 4, 5].map((index) => record(`e${index}`, "shared", index)));
    expect(session.pending().map((event) => event.eventId)).toEqual(["e4", "e5"]);
    expect(session.data().acknowledgedEventIds).toEqual(["e1", "e2", "e3"]);
    session.ingest([record("e3", "gm", 3, { label: "late-e3" })]);
    expect(session.pending().map((event) => event.eventId)).toEqual(["e4", "e5"]);
  });

  it("works without a rollContextOf extractor", () => {
    const session = new PresentationSession<TestPayload>({ store, initial: emptyLedgerData() });
    session.ingest([
      record("e1", "shared", 1, {
        label: "e1",
        roll: { rollId: "r", attackSuccessesRolled: 3 },
      }),
    ]);
    expect(session.pending()).toHaveLength(1);
    expect(session.attackSuccessesRolled("r")).toBeNull();
  });

  it("treats acknowledge of an unknown id as a no-op", () => {
    const session = makeSession(store);
    session.acknowledge("missing");
    expect(session.data().acknowledgedEventIds).toEqual([]);
    expect(session.pending()).toEqual([]);
    expect(session.data().cursor).toEqual(EMPTY_EVENT_TAIL_CURSOR);
  });
});

const PARTITIONS: readonly EventTailPartition[] = ["shared", "gm", "member"];

interface ServerEvent {
  readonly eventId: string;
  readonly sequence: number;
  readonly partitions: readonly EventTailPartition[];
}

describe("PresentationSession (property)", () => {
  it("never re-presents an acknowledged or expired event across fetches and reloads", () => {
    const limits = { maxAcknowledged: 20, maxPending: 8, maxSequenceLag: 12 };
    const partitionArb = fc.constantFrom<EventTailPartition>("shared", "gm", "member");
    const partitionsArb = fc
      .array(partitionArb, { minLength: 1, maxLength: 3 })
      .map((parts) => [...new Set(parts)]);
    const eventsArb = fc.array(partitionsArb, { maxLength: 60 });
    const scheduleArb = fc.array(
      fc.oneof(
        fc.record({ kind: fc.constant("fetch" as const), limit: fc.integer({ min: 1, max: 5 }) }),
        fc.constant({ kind: "ack" as const }),
        fc.constant({ kind: "reload" as const }),
      ),
      { minLength: 1, maxLength: 80 },
    );

    fc.assert(
      fc.property(eventsArb, scheduleArb, (subsets, schedule) => {
        const storage = new MemoryStorage();
        const store = new PresentationLedgerStorage(storage, "property");
        const events: ServerEvent[] = subsets.map((partitions, index) => ({
          eventId: `e${index}`,
          sequence: index + 1,
          partitions,
        }));

        const fetchRecords = (
          after: EventTailCursor,
          limit: number,
        ): EventTailRecord<TestPayload>[] => {
          const records: EventTailRecord<TestPayload>[] = [];
          for (const partition of PARTITIONS) {
            const matches = events
              .filter(
                (event) =>
                  event.partitions.includes(partition) && event.sequence > after[partition],
              )
              .sort((a, b) => a.sequence - b.sequence)
              .slice(0, limit);
            for (const event of matches) {
              records.push({
                eventId: event.eventId,
                commandId: `cmd:${event.eventId}`,
                sequence: event.sequence,
                roomRevision: event.sequence,
                partition,
                payload: { label: event.eventId },
              });
            }
          }
          return records;
        };

        let current = new PresentationSession<TestPayload>({
          store,
          initial: emptyLedgerData(),
          rollContextOf: rollOf,
          limits,
        });
        const forbidden = new Set<string>();
        let lastCursor: EventTailCursor = current.data().cursor;

        const check = (): void => {
          const data = current.data();
          for (const partition of PARTITIONS) {
            expect(data.cursor[partition]).toBeGreaterThanOrEqual(lastCursor[partition]);
          }
          lastCursor = data.cursor;
          expect(data.acknowledgedEventIds.length).toBeLessThanOrEqual(limits.maxAcknowledged);
          for (const id of data.acknowledgedEventIds) forbidden.add(id);
          for (const event of current.pending()) {
            expect(forbidden.has(event.eventId)).toBe(false);
          }
        };

        for (const step of schedule) {
          if (step.kind === "fetch") {
            const before = new Set(current.pending().map((event) => event.eventId));
            current.ingest(fetchRecords(current.fetchCursor(), step.limit));
            const after = new Set(current.pending().map((event) => event.eventId));
            for (const id of before) {
              if (!after.has(id)) forbidden.add(id);
            }
            check();
          } else if (step.kind === "ack") {
            const first = current.pending()[0];
            if (first) {
              forbidden.add(first.eventId);
              current.acknowledge(first.eventId);
            }
            check();
          } else {
            current = new PresentationSession<TestPayload>({
              store,
              initial: store.load() ?? emptyLedgerData(),
              rollContextOf: rollOf,
              limits,
            });
            check();
          }
        }

        // Drain: keep fetching and acknowledging until the queue settles.
        for (let round = 0; round < 200; round += 1) {
          const before = new Set(current.pending().map((event) => event.eventId));
          current.ingest(fetchRecords(current.fetchCursor(), 50));
          const after = new Set(current.pending().map((event) => event.eventId));
          for (const id of before) {
            if (!after.has(id)) forbidden.add(id);
          }
          check();
          const first = current.pending()[0];
          if (!first) break;
          forbidden.add(first.eventId);
          current.acknowledge(first.eventId);
          check();
        }
      }),
      { numRuns: 200 },
    );
  });
});
