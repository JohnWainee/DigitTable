import { useCallback, useEffect, useState } from "react";
import type {
  AllocationOption,
  PoolExplanation,
  PoolInput,
  VisibleRoll,
} from "@digitable/contracts";
import type { EatTheReichEvent, RollAllocation } from "@digitable/template-eat-the-reich";
import type { InMemoryRoomRepository } from "../repository/InMemoryRoomRepository.js";

export interface ActionResolvedSummary {
  readonly threatStatus: "active" | "defeated";
  readonly objectiveStatus: "active" | "complete";
  readonly threatResolveRemaining: number;
  readonly objectiveAdvancesRemaining: number;
}

export interface PlayerActionFlow {
  readonly projection: ReturnType<InMemoryRoomRepository["getPlayerProjection"]>;
  readonly resolvedSummary: ActionResolvedSummary | null;
  readonly errorMessage: string | null;
  readonly beginAction: (threatId: string, actionId: string, gearIds: readonly string[]) => void;
  readonly allocate: (allocations: readonly RollAllocation[]) => void;
  readonly playAgain: () => void;
  readonly explainPool: (input: PoolInput) => PoolExplanation;
  readonly validAllocations: (roll: VisibleRoll) => readonly AllocationOption[];
}

function findEvent<TType extends EatTheReichEvent["type"]>(
  events: readonly EatTheReichEvent[],
  type: TType,
): Extract<EatTheReichEvent, { type: TType }> | undefined {
  return events.find(
    (event): event is Extract<EatTheReichEvent, { type: TType }> => event.type === type,
  );
}

/**
 * Drives the player half of docs/UX_RESOLUTION_THEATRE.md's state machine
 * (compose -> rolling-player -> waiting-on-gm -> rolling-opposition -> reveal
 * -> allocating -> applying -> resolved) against an in-memory repository
 * shared with a real GM surface (docs/PHASE_1C_PLAN.md). `waiting-on-gm` is
 * now a genuine wait on another role's action, not a timed stand-in: the
 * player's own projection already reflects `activeRoll.status ===
 * "awaiting_opposition"` the moment `BeginAction` is accepted, and flips to
 * `"awaiting_allocation"` the moment the GM's `SubmitOpposition` command is
 * accepted, via the shared repository's `subscribe` notifications — no
 * artificial delay is needed or announced twice
 * (docs/UX_RESOLUTION_THEATRE.md: "announced once and remains visible
 * without repeated announcements").
 */
export function usePlayerActionFlow(repository: InMemoryRoomRepository): PlayerActionFlow {
  const [projection, setProjection] = useState(() => repository.getPlayerProjection());
  const [resolvedSummary, setResolvedSummary] = useState<ActionResolvedSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    return repository.subscribe(() => {
      setProjection(repository.getPlayerProjection());
      // Any accepted command (from any role) means the room has moved forward,
      // so a previously-surfaced dispatch failure (ours or the GM's) is stale.
      setErrorMessage(null);
    });
  }, [repository]);

  useEffect(() => {
    // The GM's opposition dispatch happens on a different surface entirely;
    // if it fails, the player would otherwise wait in `awaiting_opposition`
    // forever with no feedback (Phase 1B independent review follow-up:
    // "Surface opposition-dispatch failures in the player UI").
    return repository.subscribeToErrors((failure) => {
      if (failure.capability === "gm") {
        setErrorMessage(
          failure.message ?? "The GM's opposition roll could not be submitted. They may retry.",
        );
      }
    });
  }, [repository]);

  const beginAction = useCallback(
    (threatId: string, actionId: string, gearIds: readonly string[]) => {
      setErrorMessage(null);
      setResolvedSummary(null);
      const result = repository.beginAction(threatId, actionId, gearIds);
      if (!result.ok) {
        setErrorMessage(result.message ?? "Could not begin the action.");
      }
    },
    [repository],
  );

  const allocate = useCallback(
    (allocations: readonly RollAllocation[]) => {
      const rollId = projection.view.activeRoll?.rollId;
      if (!rollId) {
        return;
      }
      setErrorMessage(null);
      const result = repository.allocateResults(rollId, allocations);
      if (!result.ok) {
        setErrorMessage(result.message ?? "Could not confirm that allocation.");
        return;
      }
      const resolved = findEvent(result.sharedEvents, "ActionResolved");
      if (resolved) {
        setResolvedSummary({
          threatStatus: resolved.threatStatus,
          objectiveStatus: resolved.objectiveStatus,
          threatResolveRemaining: resolved.threatResolveRemaining,
          objectiveAdvancesRemaining: resolved.objectiveAdvancesRemaining,
        });
      }
    },
    [repository, projection],
  );

  const playAgain = useCallback(() => {
    setResolvedSummary(null);
    setErrorMessage(null);
    repository.reset();
  }, [repository]);

  const explainPool = useCallback(
    (input: PoolInput) => repository.explainPool(input),
    [repository],
  );
  const validAllocations = useCallback(
    (roll: VisibleRoll) => repository.validAllocations(roll),
    [repository],
  );

  return {
    projection,
    resolvedSummary,
    errorMessage,
    beginAction,
    allocate,
    playAgain,
    explainPool,
    validAllocations,
  };
}
