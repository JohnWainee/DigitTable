import type { CommandId, MemberId } from "./ids.js";
import type { StableErrorCode } from "./errors.js";
import type { Capability, ViewerContext } from "./template.js";
import type { ViewerProjection } from "./projection.js";

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

  /** One-shot fetch of a viewer's current projection. */
  getProjection(viewer: ViewerContext): Promise<ViewerProjection<TView>>;

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
