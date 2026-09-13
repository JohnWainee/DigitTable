import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AllocationOption,
  PoolExplanation,
  PoolInput,
  VisibleRoll,
} from "@digitable/contracts";
import type { EatTheReichEvent, RollAllocation } from "@digitable/template-eat-the-reich";
import type { InMemoryRoomRepository } from "../repository/InMemoryRoomRepository.js";

/** Standard presentation pacing for the `waiting-on-gm` state (docs/UX_RESOLUTION_THEATRE.md). */
const OPPOSITION_DELAY_MS = 700;
/** Reduced-motion pacing: shorter, never zero — the state itself is still announced, not skipped. */
const OPPOSITION_DELAY_MS_REDUCED = 200;

export interface ActionResolvedSummary {
  readonly threatStatus: "active" | "defeated";
  readonly objectiveStatus: "active" | "complete";
  readonly threatResolveRemaining: number;
  readonly objectiveAdvancesRemaining: number;
}

export interface PlayerActionFlow {
  readonly projection: ReturnType<InMemoryRoomRepository["getPlayerProjection"]>;
  /** True while the local GM stand-in's presentation delay is running. */
  readonly awaitingOpposition: boolean;
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
 * -> allocating -> applying -> resolved) against an in-memory repository.
 * Every command is synchronous and local, so the only state transition worth
 * an artificial delay is `waiting-on-gm`, which must be announced as its own
 * semantic state rather than skipped (see the module-level delay constants).
 */
export function usePlayerActionFlow(
  repository: InMemoryRoomRepository,
  reducedMotion: boolean,
): PlayerActionFlow {
  const [projection, setProjection] = useState(() => repository.getPlayerProjection());
  const [awaitingOpposition, setAwaitingOpposition] = useState(false);
  const [resolvedSummary, setResolvedSummary] = useState<ActionResolvedSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const oppositionTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return repository.subscribe(() => setProjection(repository.getPlayerProjection()));
  }, [repository]);

  useEffect(
    () => () => {
      if (oppositionTimeout.current !== null) {
        clearTimeout(oppositionTimeout.current);
      }
    },
    [],
  );

  const beginAction = useCallback(
    (threatId: string, actionId: string, gearIds: readonly string[]) => {
      setErrorMessage(null);
      setResolvedSummary(null);
      const result = repository.beginAction(threatId, actionId, gearIds);
      if (!result.ok) {
        setErrorMessage(result.message ?? "Could not begin the action.");
        return;
      }
      const rolled = findEvent(result.sharedEvents, "ActionRolled");
      if (!rolled) {
        return;
      }
      setAwaitingOpposition(true);
      const delay = reducedMotion ? OPPOSITION_DELAY_MS_REDUCED : OPPOSITION_DELAY_MS;
      oppositionTimeout.current = setTimeout(() => {
        repository.simulateOpposition(rolled.rollId);
        setAwaitingOpposition(false);
      }, delay);
    },
    [repository, reducedMotion],
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
    if (oppositionTimeout.current !== null) {
      clearTimeout(oppositionTimeout.current);
      oppositionTimeout.current = null;
    }
    setAwaitingOpposition(false);
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
    awaitingOpposition,
    resolvedSummary,
    errorMessage,
    beginAction,
    allocate,
    playAgain,
    explainPool,
    validAllocations,
  };
}
