import { useEffect, useRef, useState } from "react";
import {
  asMemberId,
  asRoomId,
  type Capability,
  type CommandId,
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
import { ensureLiveAuthReady, getRoomRepository } from "./roomClient.js";

type Repository = RoomRepository<EatTheReichCommand, EatTheReichEvent, EatTheReichView>;
export type RoomProjectionStatus = "connecting" | "live" | "reconnecting" | "not-found";

export interface RoomProjectionState {
  readonly status: RoomProjectionStatus;
  readonly projection: ViewerProjection<EatTheReichView> | null;
  readonly lastError: RoomDispatchFailure | null;
  readonly pending: boolean;
  readonly recoveredResult: RoomCommandResult<EatTheReichEvent> | null;
  readonly dispatch: (
    commandId: CommandId,
    payload: EatTheReichCommand,
  ) => Promise<RoomCommandResult<EatTheReichEvent>>;
}

/** Projections remain the sole source of domain state; recovered events are presentation only. */
export function useRoomProjection(
  roomId: string,
  memberId: string,
  capability: Capability,
): RoomProjectionState {
  const [status, setStatus] = useState<RoomProjectionStatus>("connecting");
  const [projection, setProjection] = useState<ViewerProjection<EatTheReichView> | null>(null);
  const [lastError, setLastError] = useState<RoomDispatchFailure | null>(null);
  const [pending, setPending] = useState(false);
  const [recoveredResult, setRecoveredResult] =
    useState<RoomCommandResult<EatTheReichEvent> | null>(null);
  const repositoryRef = useRef<Repository | null>(null);
  const dispatching = useRef(false);
  const syncRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    let syncing = false;
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

    function receive(next: ViewerProjection<EatTheReichView>): void {
      if (cancelled) return;
      setProjection((prior) => (!prior || next.roomRevision >= prior.roomRevision ? next : prior));
    }

    async function sync(): Promise<void> {
      if (cancelled || syncing || !repository || !memberId) return;
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
        if (results.length) {
          // Refresh first: never show a recovered result over stale domain state.
          receive(await repository.getProjection(viewer));
          if (cancelled) return;
          for (const result of results) {
            if (result.status === "rejected")
              setLastError({ capability, code: result.code, message: result.message });
            else setRecoveredResult(result);
          }
        }
        const remaining = repository.pendingCommands(member);
        setPending(
          dispatching.current || remaining.some((entry) => entry.payload.type !== "Pause"),
        );
        setStatus(navigator.onLine ? "live" : "reconnecting");
        delay = remaining.length ? Math.min(delay * 2, 30000) : 30000;
      } catch {
        if (!cancelled) setStatus("reconnecting");
        delay = Math.min(delay * 2, 30000);
      } finally {
        syncing = false;
        if (!cancelled && repository && memberId) {
          timer = setTimeout(
            () => {
              void sync();
            },
            delay + Math.random() * 500,
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
        setRecoveredResult(null);
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
      syncRef.current = () => {};
    };
  }, [roomId, memberId, capability]);

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

  return { status, projection, lastError, pending, recoveredResult, dispatch };
}
