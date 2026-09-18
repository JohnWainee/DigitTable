/**
 * Authorized event-tail reads (docs/ARCHITECTURE.md section 9, "Reconnect and
 * idempotency" step 3; docs/PHASE_2_PLAN.md PR 7, acceptance row 8).
 *
 * The tail exists for timeline and theatre presentation only. It is never
 * replayed to reconstruct domain state: projections remain the sole source of
 * truth. A tail read returns only the physical partitions the viewer is
 * authorized to read (`shared`; the viewer's own `member-{id}` partition; and
 * `gm` for the GM seat), so no other viewer's private copy can appear.
 */

export type EventTailPartition = "shared" | "gm" | "member";

/**
 * The highest sequence consumed per physical partition. Sequences are global
 * to the room, so any single partition has gaps, and one command's copies are
 * committed atomically but read by separate queries. A cursor per partition
 * (never one merged number) keeps a later commit from hiding an earlier copy
 * that another partition's read simply had not seen yet. `0` means "nothing
 * consumed"; the first room sequence is `1`.
 */
export interface EventTailCursor {
  readonly shared: number;
  readonly gm: number;
  readonly member: number;
}

export const EMPTY_EVENT_TAIL_CURSOR: EventTailCursor = { shared: 0, gm: 0, member: 0 };

/** Upper bound on records read from one partition by one page. */
export const EVENT_TAIL_PAGE_LIMIT = 50;

/**
 * One stored event copy, validated and stripped to what presentation needs.
 * `actor` is deliberately absent: presentation never needs to know who acted,
 * and omitting it keeps safety-interrupt authorship (always anonymous) out of
 * every client-side presentation structure.
 */
export interface EventTailRecord<TEvent> {
  readonly eventId: string;
  readonly commandId: string;
  readonly sequence: number;
  /** The accepted-command revision that produced this event. */
  readonly roomRevision: number;
  readonly partition: EventTailPartition;
  readonly payload: TEvent;
}

export interface EventTailPage<TEvent> {
  /** Ascending by `sequence` across the authorized partitions read. */
  readonly records: readonly EventTailRecord<TEvent>[];
  /** `after`, advanced per partition to the last record returned from it. */
  readonly cursor: EventTailCursor;
  /** True when any partition returned a full page and may hold more. */
  readonly hasMore: boolean;
}
