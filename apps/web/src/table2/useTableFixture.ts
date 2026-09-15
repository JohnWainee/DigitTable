import { useEffect, useState } from "react";
import {
  fixturePlayLoopStore as store,
  type ResolutionHistoryEntry,
} from "../session/fixturePlayLoopStore.js";
import type { ActiveRollState, FixtureSceneState } from "../session/fixturePlayLoop.js";
import { ETR_SCENE_FIXTURE } from "../../test/fixtures/etrTemp.js";
import type { RosterEntry } from "../session/FixtureSessionGateway.js";

export interface TableFixture {
  readonly scene: FixtureSceneState;
  readonly history: readonly ResolutionHistoryEntry[];
  readonly acting: readonly string[]; // names only, per section 10: never declaration details
  readonly activeRolls: readonly { readonly name: string; readonly roll: ActiveRollState }[];
}

/**
 * TEMPORARY: the table's read-only view into the shared fixture play-loop
 * store (see fixturePlayLoopStore.ts). Never exposes GM notes, unrevealed
 * threats, bonus-claim notes, or pending-declaration details — only what
 * docs/ETR_SESSION_FLOW.md section 10 allows.
 */
export function useTableFixture(roomId: string, roster: readonly RosterEntry[]): TableFixture {
  const [, forceRender] = useState(0);

  useEffect(() => {
    store.ensureRoom(roomId, ETR_SCENE_FIXTURE[0]!);
    return store.subscribe(() => forceRender((n) => n + 1));
  }, [roomId]);

  const scene = store.getScene(roomId) ?? sceneFallback();
  const acting: string[] = [];
  const activeRolls: { name: string; roll: ActiveRollState }[] = [];
  for (const entry of roster) {
    const record = store.getCharacterRecord(roomId, entry.id);
    if (!record) continue;
    if (record.phase === "declared") acting.push(record.character.name);
    if (record.phase === "rolled" && record.activeRoll) {
      activeRolls.push({ name: record.character.name, roll: record.activeRoll });
    }
  }

  return { scene, history: store.getHistory(roomId), acting, activeRolls };
}

function sceneFallback(): FixtureSceneState {
  const fixture = ETR_SCENE_FIXTURE[0]!;
  return {
    id: fixture.id,
    location: fixture.location,
    objectiveTitle: fixture.objectiveTitle,
    objectiveRating: fixture.objectiveRating,
    objectiveChallenge: fixture.objectiveChallenge,
    threats: fixture.threats,
  };
}
