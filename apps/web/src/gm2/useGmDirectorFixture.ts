import { useEffect, useState } from "react";
import {
  fixturePlayLoopStore as store,
  type CharacterPlayRecord,
} from "../session/fixturePlayLoopStore.js";
import {
  lookupCharacterFixture,
  type FixtureCharacterState,
  type FixtureSceneState,
} from "../session/fixturePlayLoop.js";
import { ETR_SCENE_FIXTURE } from "../../test/fixtures/etrTemp.js";
import type { RosterEntry } from "../session/FixtureSessionGateway.js";

export interface GmDirectorFixture {
  readonly scene: FixtureSceneState;
  readonly pending: readonly CharacterPlayRecord[];
  readonly characterStates: ReadonlyMap<string, FixtureCharacterState>;
  readonly revealThreat: (threatId: string) => void;
  readonly reviewAndRoll: (
    characterId: string,
    approvedClaimIds: readonly string[],
    engagedThreatIds: readonly string[],
  ) => void;
  readonly correctBlood: (characterId: string, delta: number, reason: string) => void;
}

/** TEMPORARY: wires the GM director screen (C03) into the shared fixture play-loop store. See fixturePlayLoopStore.ts. */
export function useGmDirectorFixture(
  roomId: string,
  roster: readonly RosterEntry[],
): GmDirectorFixture {
  const [, forceRender] = useState(0);
  const claimedIds = roster
    .filter((r) => r.claimedBy !== null)
    .map((r) => r.id)
    .join(",");

  useEffect(() => {
    store.ensureRoom(roomId, ETR_SCENE_FIXTURE[0]!);
    for (const id of claimedIds ? claimedIds.split(",") : []) {
      const fixture = lookupCharacterFixture(id);
      if (fixture) store.ensureCharacter(roomId, fixture);
    }
    return store.subscribe(() => forceRender((n) => n + 1));
  }, [roomId, claimedIds]);

  const scene = store.getScene(roomId) ?? sceneFallback();
  const characterStates = new Map<string, FixtureCharacterState>();
  for (const entry of roster) {
    const record = store.getCharacterRecord(roomId, entry.id);
    if (record) characterStates.set(entry.id, record.character);
  }

  return {
    scene,
    pending: store.listPendingReviews(roomId),
    characterStates,
    revealThreat: (threatId) => store.revealThreat(roomId, threatId),
    reviewAndRoll: (characterId, approvedClaimIds, engagedThreatIds) =>
      store.reviewAndRoll(roomId, characterId, approvedClaimIds, engagedThreatIds),
    correctBlood: (characterId, delta, reason) =>
      store.correctBlood(roomId, characterId, delta, reason),
  };
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
