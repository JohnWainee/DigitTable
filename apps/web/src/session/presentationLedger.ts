/**
 * Persisted, bounded presentation ledger (docs/ARCHITECTURE.md section 9,
 * "Reconnect and idempotency"). A viewer's client reads its authorized event
 * tail for timeline/theatre presentation only. The ledger remembers which
 * logical events have already been presented so a refresh never replays them,
 * and which roll contexts were observed so later presentation can be decorated
 * without re-deriving domain state.
 *
 * Nothing here reconstructs domain state: projections remain the sole source
 * of truth. This module is framework-independent (no React, no Firebase, no
 * wall clock, no ambient randomness).
 *
 * Why FIFO eviction of acknowledged ids is safe (engineering invariant): after
 * every ingest, any still-pending event whose sequence lags the newest ingested
 * sequence by more than `MAX_SEQUENCE_LAG` is acknowledged automatically, so
 * the persisted cursor can never trail the newest ingested sequence by more
 * than that many sequence numbers. Every partition's copy of one logical event
 * shares the event's sequence, and each sequence number is at most one logical
 * event, so any event still re-readable above the cursor was acknowledged
 * fewer than `MAX_ACKNOWLEDGED_EVENT_IDS` acknowledgements ago and is therefore
 * still in the acknowledged list.
 */
import {
  EMPTY_EVENT_TAIL_CURSOR,
  type EventTailCursor,
  type EventTailPartition,
  type EventTailRecord,
} from "@digitable/contracts";

/** FIFO cap on persisted acknowledged event ids. */
export const MAX_ACKNOWLEDGED_EVENT_IDS = 512;
/**
 * In-memory cap on unacknowledged logical events. Memory safety only: `MAX_SEQUENCE_LAG` is the binding bound.
 * It must stay well above a catch-up burst (several tail pages) so a reconnecting viewer's older, still
 * un-presented events (for example a recovered resolution) are not expired ahead of the lag rule.
 */
export const MAX_PENDING_EVENTS = 512;
/** An unacknowledged event this far behind the newest ingested sequence expires. */
export const MAX_SEQUENCE_LAG = 300;
/** FIFO cap on remembered roll contexts. */
export const MAX_ROLL_CONTEXTS = 64;

const STORAGE_KEY_PREFIX = "digitable.presented.v1:";

/** Most private first, so the first present copy wins. */
const PARTITION_ORDER: readonly EventTailPartition[] = ["gm", "member", "shared"];

export interface RollContext {
  readonly rollId: string;
  readonly attackSuccessesRolled: number;
}

export interface PresentationLedgerData {
  /** Per partition; nothing at or below these sequences needs re-reading. */
  readonly cursor: EventTailCursor;
  /** Oldest -> newest, unique, at most `MAX_ACKNOWLEDGED_EVENT_IDS`. */
  readonly acknowledgedEventIds: readonly string[];
  /** Oldest -> newest, unique by `rollId`, at most `MAX_ROLL_CONTEXTS`. */
  readonly rollContexts: readonly RollContext[];
}

export function emptyLedgerData(
  cursor: EventTailCursor = EMPTY_EVENT_TAIL_CURSOR,
): PresentationLedgerData {
  return {
    cursor: { ...cursor },
    acknowledgedEventIds: [],
    rollContexts: [],
  };
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseCursor(value: unknown): EventTailCursor | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const cursor = value as Record<string, unknown>;
  if (
    !isNonNegativeSafeInteger(cursor.shared) ||
    !isNonNegativeSafeInteger(cursor.gm) ||
    !isNonNegativeSafeInteger(cursor.member)
  ) {
    return null;
  }
  return { shared: cursor.shared, gm: cursor.gm, member: cursor.member };
}

function parseIdList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length > MAX_ACKNOWLEDGED_EVENT_IDS) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || id.length === 0 || seen.has(id)) return null;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function parseRollContexts(value: unknown): readonly RollContext[] | null {
  if (!Array.isArray(value) || value.length > MAX_ROLL_CONTEXTS) return null;
  const contexts: RollContext[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.rollId !== "string" ||
      record.rollId.length === 0 ||
      !isNonNegativeSafeInteger(record.attackSuccessesRolled) ||
      seen.has(record.rollId)
    ) {
      return null;
    }
    seen.add(record.rollId);
    contexts.push({ rollId: record.rollId, attackSuccessesRolled: record.attackSuccessesRolled });
  }
  return contexts;
}

/**
 * Strict parse. Returns null for anything that is not a complete, in-bounds
 * ledger document. Unknown extra top-level keys are tolerated.
 */
function parseLedgerData(value: unknown): PresentationLedgerData | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const cursor = parseCursor(record.cursor);
  if (!cursor) return null;
  const acknowledgedEventIds = parseIdList(record.acknowledgedEventIds);
  if (!acknowledgedEventIds) return null;
  const rollContexts = parseRollContexts(record.rollContexts);
  if (!rollContexts) return null;
  return { cursor, acknowledgedEventIds, rollContexts };
}

function mergeAcknowledgedIds(
  stored: readonly string[],
  incoming: readonly string[],
): readonly string[] {
  const merged = [...stored];
  const seen = new Set(stored);
  for (const id of incoming) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged.slice(Math.max(0, merged.length - MAX_ACKNOWLEDGED_EVENT_IDS));
}

function mergeRollContexts(
  stored: readonly RollContext[],
  incoming: readonly RollContext[],
): readonly RollContext[] {
  const byId = new Map<string, RollContext>();
  for (const context of stored) byId.set(context.rollId, context);
  for (const context of incoming) {
    // Replace-by-rollId keeps the newest position.
    byId.delete(context.rollId);
    byId.set(context.rollId, context);
  }
  const merged = [...byId.values()];
  return merged.slice(Math.max(0, merged.length - MAX_ROLL_CONTEXTS));
}

/** Merge incoming over stored so two tabs sharing a key cannot regress each other. */
function mergeLedgerData(
  stored: PresentationLedgerData | null,
  incoming: PresentationLedgerData,
): PresentationLedgerData {
  const base = stored ?? emptyLedgerData();
  return {
    cursor: {
      shared: Math.max(base.cursor.shared, incoming.cursor.shared),
      gm: Math.max(base.cursor.gm, incoming.cursor.gm),
      member: Math.max(base.cursor.member, incoming.cursor.member),
    },
    acknowledgedEventIds: mergeAcknowledgedIds(
      base.acknowledgedEventIds,
      incoming.acknowledgedEventIds,
    ),
    rollContexts: mergeRollContexts(base.rollContexts, incoming.rollContexts),
  };
}

/** Identity-scoped persistence for one viewer's presentation ledger. */
export class PresentationLedgerStorage {
  private readonly key: string;

  constructor(
    private readonly storage: Storage,
    scope: string,
  ) {
    this.key = `${STORAGE_KEY_PREFIX}${scope}`;
  }

  /** The persisted data, or null when absent or invalid. Never throws. */
  load(): PresentationLedgerData | null {
    try {
      const raw = this.storage.getItem(this.key);
      if (raw === null) return null;
      return parseLedgerData(JSON.parse(raw) as unknown);
    } catch {
      return null;
    }
  }

  /** Merge with what is stored, then write. Returns false on any storage failure. */
  save(data: PresentationLedgerData): boolean {
    try {
      const merged = mergeLedgerData(this.load(), data);
      this.storage.setItem(this.key, JSON.stringify(merged));
      return true;
    } catch {
      return false;
    }
  }
}

export interface PresentableEvent<TEvent> {
  readonly eventId: string;
  readonly commandId: string;
  readonly sequence: number;
  readonly roomRevision: number;
  /** Payload of the most-private copy (gm > member > shared). */
  readonly payload: TEvent;
  /** Every partition a copy was seen in, ordered gm, member, shared. */
  readonly partitions: readonly EventTailPartition[];
}

export interface PresentationSessionOptions<TEvent> {
  readonly store: PresentationLedgerStorage;
  readonly initial: PresentationLedgerData;
  /** Template-specific extraction of roll context from an event payload; null for other events. */
  readonly rollContextOf?: (payload: TEvent) => RollContext | null;
  /** Test seam only; production callers omit it. */
  readonly limits?: {
    readonly maxAcknowledged?: number;
    readonly maxPending?: number;
    readonly maxSequenceLag?: number;
  };
}

interface PendingCopy<TEvent> {
  readonly commandId: string;
  readonly sequence: number;
  readonly roomRevision: number;
  readonly partition: EventTailPartition;
  readonly payload: TEvent;
}

interface PendingEntry<TEvent> {
  readonly eventId: string;
  readonly sequence: number;
  readonly copies: Partial<Record<EventTailPartition, PendingCopy<TEvent>>>;
}

function toPresentable<TEvent>(entry: PendingEntry<TEvent>): PresentableEvent<TEvent> {
  let chosen: PendingCopy<TEvent> | null = null;
  for (const partition of PARTITION_ORDER) {
    const copy = entry.copies[partition];
    if (copy) {
      chosen = copy;
      break;
    }
  }
  // Every pending entry is created with at least one copy.
  const selected = chosen as PendingCopy<TEvent>;
  const partitions = PARTITION_ORDER.filter((partition) => entry.copies[partition] !== undefined);
  return {
    eventId: entry.eventId,
    commandId: selected.commandId,
    sequence: selected.sequence,
    roomRevision: selected.roomRevision,
    payload: selected.payload,
    partitions,
  };
}

export class PresentationSession<TEvent> {
  private readonly store: PresentationLedgerStorage;
  private readonly rollContextOf: ((payload: TEvent) => RollContext | null) | undefined;
  private readonly maxAcknowledged: number;
  private readonly maxPending: number;
  private readonly maxSequenceLag: number;
  private cursor: EventTailCursor;
  private acknowledged: string[];
  private readonly acknowledgedSet: Set<string>;
  private rollContexts: RollContext[];
  private readonly pendingById = new Map<string, PendingEntry<TEvent>>();
  private readonly highestIngested: { shared: number; gm: number; member: number };
  private highestIngestedSequence = 0;

  constructor(options: PresentationSessionOptions<TEvent>) {
    this.store = options.store;
    this.rollContextOf = options.rollContextOf;
    this.maxAcknowledged = options.limits?.maxAcknowledged ?? MAX_ACKNOWLEDGED_EVENT_IDS;
    this.maxPending = options.limits?.maxPending ?? MAX_PENDING_EVENTS;
    this.maxSequenceLag = options.limits?.maxSequenceLag ?? MAX_SEQUENCE_LAG;
    this.cursor = { ...options.initial.cursor };
    const initialAcknowledged = [...options.initial.acknowledgedEventIds];
    this.acknowledged = initialAcknowledged.slice(
      Math.max(0, initialAcknowledged.length - this.maxAcknowledged),
    );
    this.acknowledgedSet = new Set(this.acknowledged);
    const initialRollContexts = [...options.initial.rollContexts];
    this.rollContexts = initialRollContexts
      .slice(Math.max(0, initialRollContexts.length - MAX_ROLL_CONTEXTS))
      .map((context) => ({ ...context }));
    this.highestIngested = { shared: 0, gm: 0, member: 0 };
  }

  /**
   * Merge one tail page into the ledger. A record already acknowledged, already
   * pending at the same `(partition, sequence)`, or at or below the cursor is
   * not presented, but still counts toward the ingested bookkeeping and is
   * still scanned for roll context.
   */
  ingest(records: readonly EventTailRecord<TEvent>[]): void {
    let changed = false;
    for (const record of records) {
      if (record.sequence > this.highestIngested[record.partition]) {
        this.highestIngested[record.partition] = record.sequence;
      }
      if (record.sequence > this.highestIngestedSequence) {
        this.highestIngestedSequence = record.sequence;
      }
      if (this.rememberRollContextFrom(record.payload)) changed = true;
      if (this.acknowledgedSet.has(record.eventId)) continue;
      if (record.sequence <= this.cursor[record.partition]) continue;
      if (this.hasPendingPartitionCopy(record.partition, record.sequence, record.eventId)) continue;
      this.addCopy(record);
      changed = true;
    }
    if (this.expire()) changed = true;
    if (this.recomputeCursor()) changed = true;
    if (changed) this.persist();
  }

  /** Unacknowledged logical events, merged by id, ascending by sequence then id. */
  pending(): readonly PresentableEvent<TEvent>[] {
    const entries = [...this.pendingById.values()];
    entries.sort((a, b) => {
      if (a.sequence !== b.sequence) return a.sequence - b.sequence;
      if (a.eventId === b.eventId) return 0;
      return a.eventId < b.eventId ? -1 : 1;
    });
    return entries.map((entry) => toPresentable(entry));
  }

  /** Idempotent; a no-op for an id that is neither pending nor already acknowledged. */
  acknowledge(eventId: string): void {
    if (this.acknowledgedSet.has(eventId)) return;
    if (!this.pendingById.has(eventId)) return;
    this.acknowledgeInternal(eventId);
    this.recomputeCursor();
    this.persist();
  }

  /** The persisted-shape state. */
  data(): PresentationLedgerData {
    return {
      cursor: { ...this.cursor },
      acknowledgedEventIds: [...this.acknowledged],
      rollContexts: this.rollContexts.map((context) => ({ ...context })),
    };
  }

  /** Where the next tail read starts, per partition. */
  fetchCursor(): EventTailCursor {
    return {
      shared: Math.max(this.cursor.shared, this.highestIngested.shared),
      gm: Math.max(this.cursor.gm, this.highestIngested.gm),
      member: Math.max(this.cursor.member, this.highestIngested.member),
    };
  }

  attackSuccessesRolled(rollId: string): number | null {
    const context = this.rollContexts.find((entry) => entry.rollId === rollId);
    return context ? context.attackSuccessesRolled : null;
  }

  private hasPendingPartitionCopy(
    partition: EventTailPartition,
    sequence: number,
    eventId: string,
  ): boolean {
    const own = this.pendingById.get(eventId);
    if (own?.copies[partition]) return true;
    for (const entry of this.pendingById.values()) {
      const copy = entry.copies[partition];
      if (copy && copy.sequence === sequence) return true;
    }
    return false;
  }

  private addCopy(record: EventTailRecord<TEvent>): void {
    const copy: PendingCopy<TEvent> = {
      commandId: record.commandId,
      sequence: record.sequence,
      roomRevision: record.roomRevision,
      partition: record.partition,
      payload: record.payload,
    };
    const existing = this.pendingById.get(record.eventId);
    if (existing) {
      existing.copies[record.partition] = copy;
      return;
    }
    const copies: Partial<Record<EventTailPartition, PendingCopy<TEvent>>> = {};
    copies[record.partition] = copy;
    this.pendingById.set(record.eventId, {
      eventId: record.eventId,
      sequence: record.sequence,
      copies,
    });
  }

  private rememberRollContextFrom(payload: TEvent): boolean {
    if (!this.rollContextOf) return false;
    const context = this.rollContextOf(payload);
    if (!context) return false;
    return this.rememberRollContext(context);
  }

  private rememberRollContext(context: RollContext): boolean {
    const index = this.rollContexts.findIndex((entry) => entry.rollId === context.rollId);
    const atNewest = index === this.rollContexts.length - 1;
    const sameValue =
      index !== -1 &&
      this.rollContexts[index]?.attackSuccessesRolled === context.attackSuccessesRolled;
    if (atNewest && sameValue) return false;
    if (index !== -1) this.rollContexts.splice(index, 1);
    this.rollContexts.push({ ...context });
    if (this.rollContexts.length > MAX_ROLL_CONTEXTS) {
      this.rollContexts.splice(0, this.rollContexts.length - MAX_ROLL_CONTEXTS);
    }
    return true;
  }

  /** Expire lagging and overflow pending events; returns whether anything changed. */
  private expire(): boolean {
    let changed = false;
    const lagThreshold = this.highestIngestedSequence - this.maxSequenceLag;
    for (const entry of [...this.pendingById.values()]) {
      if (entry.sequence < lagThreshold) {
        this.acknowledgeInternal(entry.eventId);
        changed = true;
      }
    }
    while (this.pendingById.size > this.maxPending) {
      const oldest = this.oldestPendingEntry();
      if (!oldest) break;
      this.acknowledgeInternal(oldest.eventId);
      changed = true;
    }
    return changed;
  }

  private oldestPendingEntry(): PendingEntry<TEvent> | null {
    let oldest: PendingEntry<TEvent> | null = null;
    for (const entry of this.pendingById.values()) {
      if (
        oldest === null ||
        entry.sequence < oldest.sequence ||
        (entry.sequence === oldest.sequence && entry.eventId < oldest.eventId)
      ) {
        oldest = entry;
      }
    }
    return oldest;
  }

  /** Acknowledge without persisting or recomputing; callers finish the job. */
  private acknowledgeInternal(eventId: string): void {
    this.pendingById.delete(eventId);
    if (this.acknowledgedSet.has(eventId)) return;
    this.acknowledgedSet.add(eventId);
    this.acknowledged.push(eventId);
    if (this.acknowledged.length > this.maxAcknowledged) {
      const overflow = this.acknowledged.length - this.maxAcknowledged;
      for (const removed of this.acknowledged.splice(0, overflow)) {
        this.acknowledgedSet.delete(removed);
      }
    }
  }

  /** Recompute the per-partition cursor. Never decreases. Returns whether it moved. */
  private recomputeCursor(): boolean {
    const next: { shared: number; gm: number; member: number } = { ...this.cursor };
    for (const partition of PARTITION_ORDER) {
      let minPending: number | null = null;
      for (const entry of this.pendingById.values()) {
        const copy = entry.copies[partition];
        if (!copy) continue;
        minPending = minPending === null ? copy.sequence : Math.min(minPending, copy.sequence);
      }
      next[partition] =
        minPending === null
          ? Math.max(this.cursor[partition], this.highestIngested[partition])
          : Math.max(this.cursor[partition], minPending - 1);
    }
    const changed =
      next.shared !== this.cursor.shared ||
      next.gm !== this.cursor.gm ||
      next.member !== this.cursor.member;
    this.cursor = next;
    return changed;
  }

  private persist(): void {
    // Presentation must never throw into game flow; a rejected write is ignored.
    this.store.save(this.data());
  }
}
