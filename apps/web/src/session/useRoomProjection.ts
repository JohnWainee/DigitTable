import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  asMemberId,
  asRoomId,
  type Capability,
  type CommandId,
  type EventTailPartition,
  type RoomCommandResult,
  type RoomDispatchFailure,
  type RoomRepository,
  type Unsubscribe,
  type ViewerProjection,
} from "@digitable/contracts";
import type {
  EatTheReichCommand,
  EatTheReichEvent,
  EatTheReichView,
} from "@digitable/template-eat-the-reich";
import {
  PresentationLedgerStorage,
  PresentationSession,
  emptyLedgerData,
  type PresentationLedgerData,
  type PresentableEvent,
  type RollContext,
} from "./presentationLedger.js";
import { ensureLiveAuthReady, getRoomRepository } from "./roomClient.js";

type Repository = RoomRepository<EatTheReichCommand, EatTheReichEvent, EatTheReichView>;
export type RoomProjectionStatus = "connecting" | "live" | "reconnecting" | "not-found";

/**
 * A presentable event decorated with the roll context presentation needs
 * (`Defended: removed N attack successes`). `attackSuccessesRolled` is only
 * meaningful for `ActionResolved`; it is `null` for every other event, and
 * for a resolution whose `ActionRolled` context was never observed.
 */
export type PresentationItem = PresentableEvent<EatTheReichEvent> & {
  readonly attackSuccessesRolled: number | null;
};

export interface UseRoomProjectionOptions {
  /** Opt in to authorized event-tail presentation. Default false: no tail is read at all. */
  readonly presentEvents?: boolean;
  /** Test seam; defaults to window.localStorage. */
  readonly storage?: Storage;
}

export interface RoomProjectionState {
  readonly status: RoomProjectionStatus;
  readonly projection: ViewerProjection<EatTheReichView> | null;
  readonly lastError: RoomDispatchFailure | null;
  readonly pending: boolean;
  /** Ordered, unacknowledged, revision-gated presentation queue. Never a source of domain state. */
  readonly presentation: readonly PresentationItem[];
  readonly acknowledgePresentation: (eventId: string) => void;
  readonly dispatch: (
    commandId: CommandId,
    payload: EatTheReichCommand,
  ) => Promise<RoomCommandResult<EatTheReichEvent>>;
}

/** Most private first, matching `presentationLedger.ts`'s stored-copy preference. */
const PARTITION_ORDER: readonly EventTailPartition[] = ["gm", "member", "shared"];

const rollContextOf = (event: EatTheReichEvent): RollContext | null =>
  event.type === "ActionRolled"
    ? { rollId: event.rollId, attackSuccessesRolled: event.attackSuccessesRolled }
    : null;

/**
 * Adds the roll context presentation needs. Called when publishing (inside an
 * async effect or an event handler, never during render), so no ref is read
 * while rendering.
 */
function decorate(
  items: readonly PresentableEvent<EatTheReichEvent>[],
  session: PresentationSession<EatTheReichEvent>,
): readonly PresentationItem[] {
  return items.map((item) => ({
    ...item,
    attackSuccessesRolled:
      item.payload.type === "ActionResolved"
        ? session.attackSuccessesRolled(item.payload.rollId)
        : null,
  }));
}

/**
 * Projections remain the sole source of domain state. With `presentEvents`,
 * the authorized event tail is read for presentation only: it is never
 * replayed to reconstruct or mutate domain state, and no item is exposed
 * before the rendered projection has caught up to that item's revision.
 */
export function useRoomProjection(
  roomId: string,
  memberId: string,
  capability: Capability,
  options?: UseRoomProjectionOptions,
): RoomProjectionState {
  const presentEvents = options?.presentEvents ?? false;
  const storage = options?.storage;
  const [status, setStatus] = useState<RoomProjectionStatus>("connecting");
  const [projection, setProjection] = useState<ViewerProjection<EatTheReichView> | null>(null);
  const [lastError, setLastError] = useState<RoomDispatchFailure | null>(null);
  const [pending, setPending] = useState(false);
  const [published, setPublished] = useState<readonly PresentationItem[]>([]);
  const repositoryRef = useRef<Repository | null>(null);
  const sessionRef = useRef<PresentationSession<EatTheReichEvent> | null>(null);
  const dispatching = useRef(false);
  const syncRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let syncing = false;
    // A sync requested while one is in flight (e.g. right after a dispatch)
    // must not be dropped: the running pass may have read before the command
    // committed and would otherwise leave the next pass a full backoff away.
    let resync = false;
    let delay = 2000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribeProjection: Unsubscribe | undefined;
    let unsubscribeErrors: Unsubscribe | undefined;
    const repository = getRoomRepository(roomId, capability);
    repositoryRef.current = repository;
    const member = asMemberId(memberId);
    const viewer = {
      roomId: asRoomId(roomId),
      viewerId: capability === "player" ? member : capability,
      capability,
    };

    let ledgerStore: PresentationLedgerStorage | null = null;
    let session: PresentationSession<EatTheReichEvent> | null = null;
    // `reconcilePending` drains the outbox exactly once, so sequences it
    // recovered must outlive a failed baseline attempt (e.g. a head read that
    // throws) until a baseline has actually been decided and persisted.
    const recoveredSequences: number[] = [];

    function receive(next: ViewerProjection<EatTheReichView>): void {
      if (cancelled) return;
      setProjection((prior) => (!prior || next.roomRevision >= prior.roomRevision ? next : prior));
    }

    /**
     * Reads the authorized event tail forward from the presentation ledger,
     * publishing unacknowledged events. `recoveredSequences` holds the
     * sequences `reconcilePending` recovered and is used only for the
     * no-ledger baseline below.
     */
    async function syncTail(): Promise<void> {
      const repo = repository;
      if (cancelled || !presentEvents || !repo) return;
      ledgerStore ??= new PresentationLedgerStorage(
        storage ?? window.localStorage,
        repo.presentationScope(member),
      );
      if (!session) {
        const stored = ledgerStore.load();
        let initial: PresentationLedgerData;
        if (stored) {
          initial = stored;
        } else {
          const head = await repo.readEventTailHead(member, viewer);
          if (cancelled) return;
          const baseline = { shared: head.shared, gm: head.gm, member: head.member };
          if (recoveredSequences.length > 0) {
            // Never baseline away a just-recovered command's own events.
            const lowestAccepted = Math.min(...recoveredSequences);
            for (const partition of PARTITION_ORDER) {
              baseline[partition] = Math.max(0, Math.min(head[partition], lowestAccepted - 1));
            }
          }
          initial = emptyLedgerData(baseline);
          ledgerStore.save(initial);
        }
        recoveredSequences.length = 0;
        session = new PresentationSession<EatTheReichEvent>({
          store: ledgerStore,
          initial,
          rollContextOf,
        });
        sessionRef.current = session;
      }
      const active = session;
      if (!active) return;
      for (let page = 0; page < 4; page += 1) {
        const tail = await repo.readEventTail(member, viewer, active.fetchCursor());
        if (cancelled) return;
        active.ingest(tail.records);
        if (!tail.hasMore) break;
      }
      if (!cancelled) setPublished(decorate(active.pending(), active));
    }

    async function sync(): Promise<void> {
      if (cancelled || !repository || !memberId) return;
      if (syncing) {
        resync = true;
        return;
      }
      syncing = true;
      clearTimeout(timer);
      try {
        await ensureLiveAuthReady();
        if (cancelled) return;
        const saved = repository.pendingCommands(member);
        setPending(dispatching.current || saved.some((entry) => entry.payload.type !== "Pause"));
        receive(await repository.getProjection(viewer));
        if (cancelled) return;
        const results = await repository.reconcilePending(member);
        if (cancelled) return;
        // Recorded before any further await: `reconcilePending` drains the
        // outbox once, so a later failed refresh must not lose these.
        if (presentEvents && !session) {
          for (const result of results) {
            if (result.status === "accepted" && result.acceptedSequence !== undefined)
              recoveredSequences.push(result.acceptedSequence);
          }
        }
        if (results.length) {
          // Refresh first: never show a recovered result over stale domain state.
          receive(await repository.getProjection(viewer));
          if (cancelled) return;
          for (const result of results) {
            if (result.status === "rejected")
              setLastError({ capability, code: result.code, message: result.message });
          }
        }
        const remaining = repository.pendingCommands(member);
        setPending(
          dispatching.current || remaining.some((entry) => entry.payload.type !== "Pause"),
        );
        setStatus(navigator.onLine ? "live" : "reconnecting");
        delay = remaining.length ? Math.min(delay * 2, 30000) : 30000;
        try {
          await syncTail();
        } catch {
          // Presentation never blocks game state: a tail failure is retried
          // on the next sync and never touches status/lastError.
        }
      } catch {
        if (!cancelled) setStatus("reconnecting");
        delay = Math.min(delay * 2, 30000);
      } finally {
        syncing = false;
        const again = resync;
        resync = false;
        if (!cancelled && repository && memberId) {
          timer = setTimeout(
            () => {
              void sync();
            },
            again ? 0 : delay + Math.random() * 500,
          );
        }
      }
    }

    const online = (): void => {
      delay = 2000;
      void sync();
    };
    const offline = (): void => {
      setStatus("reconnecting");
    };
    syncRef.current = online;
    void ensureLiveAuthReady()
      .then(() => {
        if (cancelled) return;
        setProjection(null);
        setPublished([]);
        setLastError(null);
        if (!repository || !memberId) {
          setStatus("not-found");
          return;
        }
        unsubscribeProjection = repository.subscribeToProjection(viewer, receive);
        unsubscribeErrors = repository.subscribeToErrors((failure) => {
          if (!cancelled) setLastError(failure);
        });
        void sync();
      })
      .catch(() => {
        if (!cancelled) setStatus("reconnecting");
      });
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubscribeProjection?.();
      unsubscribeErrors?.();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      session = null;
      sessionRef.current = null;
      syncRef.current = () => {};
    };
  }, [roomId, memberId, capability, presentEvents, storage]);

  const acknowledgePresentation = useCallback((eventId: string): void => {
    const session = sessionRef.current;
    if (!session) return;
    session.acknowledge(eventId);
    setPublished(decorate(session.pending(), session));
  }, []);

  // PROJECTION-BEFORE-PRESENTATION: a derived rule, not call ordering, so no
  // render ever exposes an item whose revision exceeds the rendered projection.
  const presentation = useMemo<readonly PresentationItem[]>(() => {
    if (!projection) return [];
    return published.filter((item) => item.roomRevision <= projection.roomRevision);
  }, [published, projection]);

  async function dispatch(
    commandId: CommandId,
    payload: EatTheReichCommand,
  ): Promise<RoomCommandResult<EatTheReichEvent>> {
    const repository = repositoryRef.current;
    const denied = (message: string): RoomCommandResult<EatTheReichEvent> => ({
      status: "rejected",
      commandId,
      code: "INVALID_REQUEST",
      message,
    });
    if (!repository) return denied("Join the session before sending an action.");
    const ordinary = payload.type !== "Pause";
    let started = false;
    try {
      await ensureLiveAuthReady();
      if (
        ordinary &&
        (dispatching.current ||
          repository
            .pendingCommands(asMemberId(memberId))
            .some((entry) => entry.payload.type !== "Pause"))
      ) {
        return denied(
          "Your previous action is still awaiting confirmation. It will be checked automatically.",
        );
      }
      if (ordinary) {
        dispatching.current = true;
        setPending(true);
        started = true;
      }
      setLastError(null);
      const resultPromise = repository.dispatch(asMemberId(memberId), { commandId, payload });
      syncRef.current();
      return await resultPromise;
    } catch {
      return denied(
        "Could not save this action safely. Check browser storage and your signed-in seat.",
      );
    } finally {
      if (started) {
        dispatching.current = false;
        setPending(false);
      }
      syncRef.current();
    }
  }

  return {
    status,
    projection,
    lastError,
    pending,
    presentation,
    acknowledgePresentation,
    dispatch,
  };
}
