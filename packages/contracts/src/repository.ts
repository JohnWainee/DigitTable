import type { CommandId, MemberId } from "./ids.js";
import type { StableErrorCode } from "./errors.js";
import type { Capability, ViewerContext } from "./template.js";
import type { ViewerProjection } from "./projection.js";
import type { EventTailCursor, EventTailPage } from "./eventTail.js";

/**
 * A caller-supplied command dispatch request. `commandId` must be minted by
 * the caller at the point a member commits to an action (docs/ARCHITECTURE.md
 * section 6, "Outbox: unsent commands with UUID..."), stored client-side, and
 * reused verbatim across retries so a resubmission reaches the trusted
 * handler's idempotent-retry path instead of minting a fresh ID every attempt
 * (Phase 2 preflight review, finding P1). `expectedRevision` is present only
 * for the command families that are revision-gated (docs/ARCHITECTURE.md
 * section 7); none of the current template's commands require it yet.
 */
export interface RoomCommandRequest<TCommand> {
  readonly commandId: CommandId;
  readonly payload: TCommand;
  readonly expectedRevision?: number;
}

/** One command's outcome once the trusted handler has decided (never returned as `"pending"`; that state is the outstanding `dispatch` promise itself). */
export type RoomCommandStatus = "pending" | "accepted" | "rejected";

export interface RoomCommandAccepted<TEvent> {
  readonly status: "accepted";
  readonly commandId: CommandId;
  readonly roomRevision: number;
  /** The subset of emitted events sent to the "shared" destination, in emission order. */
  readonly sharedEvents: readonly TEvent[];
  /**
   * The first room sequence this command emitted, when a reconciler learned it
   * from the durable receipt. Presentation uses it only to avoid baselining
   * past the events of a recovered command; never to reconstruct state.
   */
  readonly acceptedSequence?: number;
}

export interface RoomCommandRejected {
  readonly status: "rejected";
  readonly commandId: CommandId;
  readonly code: StableErrorCode;
  readonly message: string;
}

export type RoomCommandResult<TEvent> = RoomCommandAccepted<TEvent> | RoomCommandRejected;

/** A rejected or failed command dispatch, broadcast to every subscriber regardless of who attempted it. */
export interface RoomDispatchFailure {
  readonly capability: Capability;
  readonly code: StableErrorCode;
  readonly message: string;
}

export type ProjectionListener<TView> = (projection: ViewerProjection<TView>) => void;
export type DispatchFailureListener = (failure: RoomDispatchFailure) => void;
export type Unsubscribe = () => void;

/**
 * The explicit, async contract a trusted room's command/projection surface
 * satisfies, whether backed by an in-memory authority record (the local
 * vertical slice) or a real Firebase-backed transactional Function
 * (`FirebaseRoomRepository`, Phase 2 PR 7). Extracted per the Phase 2
 * preflight review's findings P1 and P8: the previous concrete
 * `InMemoryRoomRepository` was the only shape UI code depended on, it
 * returned command results synchronously, and it minted `commandId` itself
 * rather than accepting one from the caller — none of which a real,
 * network-backed implementation can do.
 *
 * Kept narrow (no `TState`) so a caller only needs the command/event/view
 * types already in scope for UI code, matching
 * `packages/engine`'s `CommandHandlerTemplate` narrowing.
 */
export interface RoomRepository<TCommand, TEvent, TView> {
  /**
   * Dispatches one command as `memberId`. Resolves once the trusted handler
   * has accepted or rejected it — the outstanding promise itself is the
   * outbox's "pending" state; UI code renders optimistically against it
   * without ever needing a `"pending"` value out of the resolved result.
   * Retrying with the same `request.commandId` after a prior acceptance
   * must return that original result without re-deciding or re-drawing
   * randomness.
   */
  dispatch(
    memberId: MemberId,
    request: RoomCommandRequest<TCommand>,
  ): Promise<RoomCommandResult<TEvent>>;

  /**
   * Reconciles commands persisted before a reload or an ambiguous network
   * failure. Implementations remove commands with a durable receipt and
   * retry receipt-less commands with their original command ID.
   */
  reconcilePending(memberId: MemberId): Promise<readonly RoomCommandResult<TEvent>[]>;

  /** Saved commands still awaiting a definitive server outcome. */
  pendingCommands(memberId: MemberId): readonly RoomCommandRequest<TCommand>[];

  /** One-shot fetch of a viewer's current projection. */
  getProjection(viewer: ViewerContext): Promise<ViewerProjection<TView>>;

  /**
   * Reads one bounded page of events strictly after `after` from the
   * partitions this viewer is authorized to read (shared, the member's own,
   * and `gm` for the GM seat). For timeline/theatre presentation only: the
   * result must never be used to reconstruct or mutate domain state.
   * Implementations validate every stored document before returning it.
   */
  readEventTail(
    memberId: MemberId,
    viewer: ViewerContext,
    after: EventTailCursor,
    limit?: number,
  ): Promise<EventTailPage<TEvent>>;

  /**
   * An opaque, identity-scoped key under which a client may persist
   * presentation state (which events it has already presented) for this
   * member. It must change whenever the signed-in identity, room, or seat
   * changes, so one identity's presentation history is never applied to
   * another. Throws if the identity is not (or is no longer) usable, matching
   * the repository's own outbox identity checks.
   */
  presentationScope(memberId: MemberId): string;

  /**
   * The latest stored sequence per authorized partition. A device with no
   * presentation history uses this as its baseline so a late join or a
   * cleared browser never replays the room's past as new theatre.
   */
  readEventTailHead(memberId: MemberId, viewer: ViewerContext): Promise<EventTailCursor>;

  /**
   * Live projection updates for one viewer. A real backend delivers these
   * from a per-viewer listener (e.g. a Firestore `onSnapshot`); the in-memory
   * implementation delivers them from its own local change notifications.
   * Does not deliver an initial value synchronously on subscribe — callers
   * that need a starting value should call `getProjection` first.
   */
  subscribeToProjection(viewer: ViewerContext, listener: ProjectionListener<TView>): Unsubscribe;

  /** Rejected/failed dispatch attempts, broadcast to every surface regardless of who attempted it. */
  subscribeToErrors(listener: DispatchFailureListener): Unsubscribe;
}
