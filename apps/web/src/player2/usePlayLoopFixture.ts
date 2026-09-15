import { useCallback, useEffect, useRef, useState } from "react";
import {
  characterStateFromFixture,
  declareAndRoll,
  resolveAllocation,
  sceneStateFromFixture,
  totalRollPoints,
  type ActiveRollState,
  type DeclareChoice,
  type FixtureCharacterState,
  type FixtureSceneState,
  type ResolvedOutcome,
} from "../session/fixturePlayLoop.js";
import type { RosterCharacterFixture, SceneFixture } from "../../test/fixtures/etrTemp.js";

export type PlayLoopPhase = "compose" | "declared" | "rolled" | "resolved";

export interface PlayLoopFixture {
  readonly phase: PlayLoopPhase;
  readonly character: FixtureCharacterState;
  readonly scene: FixtureSceneState;
  readonly activeRoll: ActiveRollState | null;
  readonly resolved: ResolvedOutcome | null;
  readonly declare: (choice: DeclareChoice) => void;
  readonly assign: (targetKey: string, points: number) => void;
  readonly confirmAllocation: () => void;
  readonly playAgain: () => void;
}

/**
 * TEMPORARY: wires `fixturePlayLoop.ts`'s pure functions into React state.
 * See that file's doc comment for what this stands in for and why. The
 * `declared -> rolled` step uses a short fixed delay to stand in for a real
 * GM's review action (C03 adds that screen); every claim is auto-approved
 * in the meantime.
 */
export function usePlayLoopFixture(
  characterFixture: RosterCharacterFixture,
  sceneFixture: SceneFixture,
): PlayLoopFixture {
  const [character, setCharacter] = useState<FixtureCharacterState>(() =>
    characterStateFromFixture(characterFixture),
  );
  const [scene, setScene] = useState<FixtureSceneState>(() => sceneStateFromFixture(sceneFixture));
  const [phase, setPhase] = useState<PlayLoopPhase>("compose");
  const [pendingChoice, setPendingChoice] = useState<DeclareChoice | null>(null);
  const [activeRoll, setActiveRoll] = useState<ActiveRollState | null>(null);
  const [resolved, setResolved] = useState<ResolvedOutcome | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phase !== "declared" || !pendingChoice) return;
    timerRef.current = setTimeout(() => {
      const result = declareAndRoll(character, scene, pendingChoice);
      setCharacter(result.character);
      setActiveRoll(result.roll);
      setPhase("rolled");
    }, 400);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally runs once per "declared" entry, not on every character/scene change
  }, [phase, pendingChoice]);

  const declare = useCallback((choice: DeclareChoice) => {
    setPendingChoice(choice);
    setPhase("declared");
  }, []);

  const assign = useCallback((targetKey: string, points: number) => {
    setActiveRoll((roll) => {
      if (!roll) return roll;
      const next = { ...roll.allocations };
      if (points <= 0) delete next[targetKey];
      else next[targetKey] = points;
      return { ...roll, allocations: next };
    });
  }, []);

  const confirmAllocation = useCallback(() => {
    setActiveRoll((roll) => {
      if (!roll) return roll;
      if (totalRollPoints(roll) !== Object.values(roll.allocations).reduce((s, n) => s + n, 0)) {
        return roll; // not fully allocated yet; button should already be disabled
      }
      const outcome = resolveAllocation(character, scene, roll);
      setCharacter(outcome.character);
      setScene(outcome.scene);
      setResolved(outcome);
      setPhase("resolved");
      return roll;
    });
  }, [character, scene]);

  const playAgain = useCallback(() => {
    setPhase("compose");
    setPendingChoice(null);
    setActiveRoll(null);
    setResolved(null);
  }, []);

  return {
    phase,
    character,
    scene,
    activeRoll,
    resolved,
    declare,
    assign,
    confirmAllocation,
    playAgain,
  };
}
