import { useEffect, useRef, useState } from "react";
import {
  asMemberId,
  asRoomId,
  type Capability,
  type CommandId,
  type RoomCommandResult,
  type RoomDispatchFailure,
  type ViewerProjection,
} from "@digitable/contracts";
import type {
  EatTheReichCommand,
  EatTheReichEvent,
  EatTheReichView,
} from "@digitable/template-eat-the-reich";
import { getRoomRepository } from "./roomClient.js";

export type RoomProjectionStatus = "connecting" | "live" | "reconnecting" | "not-found";

export interface RoomProjectionState {
  readonly status: RoomProjectionStatus;
  readonly projection: ViewerProjection<EatTheReichView> | null;
  readonly lastError: RoomDispatchFailure | null;
  readonly dispatch: (
    commandId: CommandId,
    payload: EatTheReichCommand,
  ) => Promise<RoomCommandResult<EatTheReichEvent>>;
}

/**
 * C06 (issue #14): the one data hook every screen uses, mode-agnostic
 * (fixture or live — see `roomClient.ts`). Replaces C01-C05's per-screen
 * fixture hooks (`usePlayLoopFixture`/`useGmDirectorFixture`/
 * `useTableFixture`) and their own hand-rolled pool/allocation/scene
 * simulation: this hook only fetches/subscribes/dispatches against the
 * real `RoomRepository` interface (`InMemoryRoomRepository` or
 * `FirebaseRoomRepository`); every screen derives what it may show and do
 * from the real `EatTheReichView` projection this returns, plus the real
 * `eatTheReichTemplate.explainPool`/`validAllocations`, per
 * docs/ETR_SESSION_FLOW.md's binding invariant.
 */
export function useRoomProjection(
  roomId: string,
  memberId: string,
  capability: Capability,
): RoomProjectionState {
  const [status, setStatus] = useState<RoomProjectionStatus>("connecting");
  const [projection, setProjection] = useState<ViewerProjection<EatTheReichView> | null>(null);
  const [lastError, setLastError] = useState<RoomDispatchFailure | null>(null);
  const repositoryRef = useRef(getRoomRepository(roomId, capability));

  useEffect(() => {
    let cancelled = false;
    const repository = getRoomRepository(roomId, capability);
    repositoryRef.current = repository;
    if (!repository) {
      // Deferred (not called synchronously in the effect body) so this
      // still satisfies react-hooks' "no setState during render's own
      // effect pass" rule, the same way the async `.catch` below does.
      void Promise.resolve().then(() => {
        if (!cancelled) setStatus("not-found");
      });
      return () => {
        cancelled = true;
      };
    }
    const viewer = { roomId: asRoomId(roomId), viewerId: asMemberId(memberId), capability };

    repository
      .getProjection(viewer)
      .then((initial) => {
        if (cancelled) return;
        setProjection(initial);
        setStatus("live");
      })
      .catch(() => {
        if (!cancelled) setStatus("not-found");
      });

    const unsubscribeProjection = repository.subscribeToProjection(viewer, (next) => {
      if (cancelled) return;
      setProjection(next);
      setStatus("live");
    });
    const unsubscribeErrors = repository.subscribeToErrors((failure) => {
      if (!cancelled) setLastError(failure);
    });

    return () => {
      cancelled = true;
      unsubscribeProjection();
      unsubscribeErrors();
    };
  }, [roomId, memberId, capability]);

  async function dispatch(
    commandId: CommandId,
    payload: EatTheReichCommand,
  ): Promise<RoomCommandResult<EatTheReichEvent>> {
    const repository = repositoryRef.current;
    if (!repository) {
      return {
        status: "rejected",
        commandId,
        code: "ROOM_NOT_FOUND",
        message: "This session has ended.",
      };
    }
    return repository.dispatch(asMemberId(memberId), { commandId, payload });
  }

  return { status, projection, lastError, dispatch };
}
