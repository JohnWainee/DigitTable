import { useEffect, useState } from "react";
import { fixturePlayLoopStore as store } from "../session/fixturePlayLoopStore.js";
import type {
  ActiveRollState,
  DeclareChoice,
  FixtureCharacterState,
  FixtureSceneState,
  ResolvedOutcome,
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
 * TEMPORARY: a thin subscriber to `fixturePlayLoopStore` (see that file's
 * doc comment). The player's own declare/assign/confirm/playAgain actions
 * write into the shared per-room store; a GM screen (C03) reviews and
 * rolls the same record via the store directly.
 */
export function usePlayLoopFixture(
  roomId: string,
  characterFixture: RosterCharacterFixture,
  sceneFixture: SceneFixture,
): PlayLoopFixture {
  const [, forceRender] = useState(0);

  useEffect(() => {
    store.ensureRoom(roomId, sceneFixture);
    store.ensureCharacter(roomId, characterFixture);
    return store.subscribe(() => forceRender((n) => n + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- roomId/characterFixture.id identify the subscription; sceneFixture is only used to seed a room that doesn't exist yet
  }, [roomId, characterFixture.id]);

  const scene = store.getScene(roomId) ?? sceneStateFallback(sceneFixture);
  const record = store.getCharacterRecord(roomId, characterFixture.id);
  const character = record?.character ?? characterStateFallback(characterFixture);

  return {
    phase: record?.phase ?? "compose",
    character,
    scene,
    activeRoll: record?.activeRoll ?? null,
    resolved: record?.resolved ?? null,
    declare: (choice) => store.declare(roomId, characterFixture.id, choice),
    assign: (targetKey, points) => store.assign(roomId, characterFixture.id, targetKey, points),
    confirmAllocation: () => store.confirmAllocation(roomId, characterFixture.id),
    playAgain: () => store.playAgain(roomId, characterFixture.id),
  };
}

// Fallbacks cover the one render before the mount effect above seeds the
// store (React 18 runs effects after the first paint).
function sceneStateFallback(fixture: SceneFixture): FixtureSceneState {
  return {
    id: fixture.id,
    location: fixture.location,
    objectiveTitle: fixture.objectiveTitle,
    objectiveRating: fixture.objectiveRating,
    objectiveChallenge: fixture.objectiveChallenge,
    threats: fixture.threats,
  };
}

function characterStateFallback(fixture: RosterCharacterFixture): FixtureCharacterState {
  return {
    id: fixture.id,
    name: fixture.name,
    concept: fixture.concept,
    stats: fixture.stats,
    blood: 0,
    items: fixture.items.map((item) => ({ ...item, usesRemaining: item.maxUses })),
    abilities: fixture.abilities,
    injuriesMarked: 0,
    downed: false,
    retired: false,
  };
}
