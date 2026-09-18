import {
  EVENT_TAIL_PAGE_LIMIT,
  type Capability,
  type EventTailCursor,
  type EventTailPage,
  type EventTailPartition,
  type EventTailRecord,
  type MemberId,
  type RoomId,
} from "@digitable/contracts";

/**
 * Pure helpers for the authorized event-tail read (docs/ARCHITECTURE.md
 * section 9, "Reconnect and idempotency" step 3; docs/PHASE_2_PLAN.md PR 7,
 * acceptance row 8). No Firebase SDK, no `RandomSource`, no wall clock:
 * everything here is deterministic and unit-testable on its own.
 *
 * The tail is presentation-only. Nothing in this file may be used to
 * reconstruct domain state — projections remain the sole source of truth.
 */

/**
 * The partitions a capability may read. `player`: shared plus its own
 * member partition. `gm`: shared, gm, and the GM's own member partition.
 * `table`: shared only.
 */
export function authorizedPartitions(capability: Capability): readonly EventTailPartition[] {
  switch (capability) {
    case "player":
      return ["shared", "member"];
    case "gm":
      return ["shared", "gm", "member"];
    case "table":
      return ["shared"];
  }
}

/** The Firestore collection path holding one partition's event documents. */
export function partitionCollectionPath(
  roomId: RoomId,
  partition: EventTailPartition,
  memberId: MemberId,
): string {
  switch (partition) {
    case "shared":
      return `rooms/${roomId}/events/shared/items`;
    case "gm":
      return `rooms/${roomId}/events/gm/items`;
    case "member":
      return `rooms/${roomId}/events/member-${memberId}/items`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * Validates one stored event document and strips it to the fields
 * presentation needs. Fails closed: any structural violation, a
 * sequence/docId mismatch, or a payload the template's `parseEvent` rejects
 * throws rather than returning a partially-trusted record.
 *
 * `actor` and `occurredAtServer` are deliberately not copied: presentation
 * never needs authorship (safety-interrupt actors are always anonymous) and
 * the record is built field by field so no unexpected envelope field can
 * ride along.
 */
export function parseTailDocument<TEvent>(
  partition: EventTailPartition,
  docId: string,
  data: unknown,
  parseEvent: (payload: unknown) => TEvent,
): EventTailRecord<TEvent> {
  if (!isRecord(data)) throw new Error("Malformed event document.");
  const { eventId, commandId, sequence, roomRevision, payload } = data;
  if (!nonEmptyString(eventId)) throw new Error("Malformed event document: eventId.");
  if (!nonEmptyString(commandId)) throw new Error("Malformed event document: commandId.");
  if (!Number.isSafeInteger(sequence) || (sequence as number) < 1) {
    throw new Error("Malformed event document: sequence.");
  }
  if ((sequence as number) !== Number(docId)) {
    throw new Error("Malformed event document: sequence/docId mismatch.");
  }
  if (!Number.isSafeInteger(roomRevision) || (roomRevision as number) < 0) {
    throw new Error("Malformed event document: roomRevision.");
  }
  const event = parseEvent(payload);
  return {
    eventId,
    commandId,
    sequence: sequence as number,
    roomRevision: roomRevision as number,
    partition,
    payload: event,
  };
}

/** Tie-break order for one sequence's copies: gm, then member, then shared. */
const PARTITION_TIE_ORDER: readonly EventTailPartition[] = ["gm", "member", "shared"];

/**
 * Merges per-partition, already-ascending results into one page.
 *
 * The watermark is the correctness crux: partitions page independently, so a
 * naive merge could release sequence 91 from one partition before another
 * partition's 51..90 were even fetched. `W` is the minimum, over every
 * partition that returned a full page, of that partition's last returned
 * sequence; records above `W` are withheld (not returned, and not reflected
 * in the cursor, so the next page re-reads them). When no partition is full,
 * `W` is unbounded and everything is released.
 */
export function assembleTailPage<TEvent>(
  perPartition: Partial<Record<EventTailPartition, readonly EventTailRecord<TEvent>[]>>,
  after: EventTailCursor,
  limit: number,
): EventTailPage<TEvent> {
  const pageLimit = clampTailLimit(limit);
  const partitions = PARTITION_TIE_ORDER.filter(
    (partition) => perPartition[partition] !== undefined,
  );

  let watermark = Number.POSITIVE_INFINITY;
  let anyFull = false;
  for (const partition of partitions) {
    const records = perPartition[partition] ?? [];
    if (records.length === pageLimit && records.length > 0) {
      anyFull = true;
      const last = records[records.length - 1]!;
      watermark = Math.min(watermark, last.sequence);
    }
  }

  const cursor: Record<EventTailPartition, number> = {
    shared: after.shared,
    gm: after.gm,
    member: after.member,
  };
  const released: EventTailRecord<TEvent>[] = [];
  let withheld = false;
  for (const partition of partitions) {
    for (const record of perPartition[partition] ?? []) {
      if (record.sequence <= after[partition]) continue; // Defensive drop.
      if (record.sequence <= watermark) {
        released.push(record);
        if (record.sequence > cursor[partition]) cursor[partition] = record.sequence;
      } else {
        withheld = true;
      }
    }
  }

  released.sort((a, b) => {
    if (a.sequence !== b.sequence) return a.sequence - b.sequence;
    const pa = PARTITION_TIE_ORDER.indexOf(a.partition);
    const pb = PARTITION_TIE_ORDER.indexOf(b.partition);
    if (pa !== pb) return pa - pb;
    return a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0;
  });

  return {
    records: released,
    cursor: { shared: cursor.shared, gm: cursor.gm, member: cursor.member },
    hasMore: anyFull || withheld,
  };
}

/**
 * Defaults to `EVENT_TAIL_PAGE_LIMIT`, floors non-integers, and clamps into
 * `[1, EVENT_TAIL_PAGE_LIMIT]`. `NaN` falls back to the default.
 */
export function clampTailLimit(limit?: number): number {
  if (limit === undefined) return EVENT_TAIL_PAGE_LIMIT;
  const floored = Math.floor(limit);
  if (Number.isNaN(floored)) return EVENT_TAIL_PAGE_LIMIT;
  return Math.min(EVENT_TAIL_PAGE_LIMIT, Math.max(1, floored));
}
