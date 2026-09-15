import {
  characterStateFromFixture,
  declareAndRoll,
  diePoints,
  resolveAllocation,
  sceneStateFromFixture,
  type ActiveRollState,
  type DeclareChoice,
  type FixtureCharacterState,
  type FixtureSceneState,
  type ResolvedOutcome,
} from "./fixturePlayLoop.js";
import type { RosterCharacterFixture, SceneFixture } from "../../test/fixtures/etrTemp.js";

/**
 * TEMPORARY: promotes `fixturePlayLoop.ts`'s per-call functions into one
 * shared per-room store, so a GM screen (C03) and a player screen (C02) —
 * both mounted in the same browser tab in fixture mode — see and act on
 * the same declared actions, scene state, and resolved outcomes. See
 * `fixturePlayLoop.ts`'s doc comment for what this whole family of modules
 * stands in for and why (B03 not landed). Delete alongside it.
 *
 * Unlike C02's first cut, this store does NOT auto-approve/auto-roll after
 * a fixed delay: a declared action now genuinely waits for a GM's review
 * (`reviewAndRoll`), matching `docs/ETR_SESSION_FLOW.md` section 6's
 * declare -> GM review -> roll design. C02's tests were updated to act as
 * the GM explicitly, the same way the pre-existing Phase 1C player test
 * acts as the GM for `SubmitOpposition`.
 */

export type CharacterPlayPhase = "compose" | "declared" | "rolled" | "resolved";

export interface CharacterPlayRecord {
  readonly character: FixtureCharacterState;
  readonly phase: CharacterPlayPhase;
  readonly pendingChoice: DeclareChoice | null;
  readonly activeRoll: ActiveRollState | null;
  readonly resolved: ResolvedOutcome | null;
}

export interface ResolutionHistoryEntry {
  readonly characterName: string;
  readonly lines: ResolvedOutcome["lines"];
}

interface RoomPlayState {
  scene: FixtureSceneState;
  readonly characters: Map<string, CharacterPlayRecord>;
  /** Newest first, capped at 3 (docs/ETR_SESSION_FLOW.md section 10: "the last three resolved summaries"). */
  history: readonly ResolutionHistoryEntry[];
}

type Listener = () => void;

function freshRecord(character: FixtureCharacterState): CharacterPlayRecord {
  return { character, phase: "compose", pendingChoice: null, activeRoll: null, resolved: null };
}

export class FixturePlayLoopStore {
  private readonly rooms = new Map<string, RoomPlayState>();
  private readonly listeners = new Set<Listener>();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  ensureRoom(roomId: string, sceneFixture: SceneFixture): FixtureSceneState {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = { scene: sceneStateFromFixture(sceneFixture), characters: new Map(), history: [] };
      this.rooms.set(roomId, room);
    }
    return room.scene;
  }

  getScene(roomId: string): FixtureSceneState | null {
    return this.rooms.get(roomId)?.scene ?? null;
  }

  getHistory(roomId: string): readonly ResolutionHistoryEntry[] {
    return this.rooms.get(roomId)?.history ?? [];
  }

  ensureCharacter(roomId: string, characterFixture: RosterCharacterFixture): CharacterPlayRecord {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`fixturePlayLoopStore: unknown room ${roomId}`);
    let record = room.characters.get(characterFixture.id);
    if (!record) {
      record = freshRecord(characterStateFromFixture(characterFixture));
      room.characters.set(characterFixture.id, record);
    }
    return record;
  }

  getCharacterRecord(roomId: string, characterId: string): CharacterPlayRecord | null {
    return this.rooms.get(roomId)?.characters.get(characterId) ?? null;
  }

  /** Every character currently awaiting GM review, for `PendingActionsPanel`. */
  listPendingReviews(roomId: string): readonly CharacterPlayRecord[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return [...room.characters.values()].filter((r) => r.phase === "declared");
  }

  /** Player action: declares, charges nothing yet, rolls nothing yet (docs/ETR_SESSION_FLOW.md section 6.1). */
  declare(roomId: string, characterId: string, choice: DeclareChoice): void {
    const room = this.rooms.get(roomId);
    const record = room?.characters.get(characterId);
    if (!room || !record) return;
    room.characters.set(characterId, { ...record, phase: "declared", pendingChoice: choice });
    this.notify();
  }

  /**
   * GM action (C03's `PendingActionsPanel`): approves/strikes bonus claims
   * and confirms (or overrides) engaged threats, then charges Blood/item
   * uses for exactly what was approved and rolls both pools once.
   */
  reviewAndRoll(
    roomId: string,
    characterId: string,
    approvedClaimIds: readonly string[],
    engagedThreatIds: readonly string[],
  ): void {
    const room = this.rooms.get(roomId);
    const record = room?.characters.get(characterId);
    if (!room || !record || record.phase !== "declared" || !record.pendingChoice) return;

    // Reuses fixturePlayLoop.ts's declareAndRoll: the GM's approved claims
    // (a possibly-struck subset of what the player claimed) and possibly-
    // overridden engaged threats replace the player's own on this one call.
    const result = declareAndRoll(record.character, room.scene, {
      ...record.pendingChoice,
      bonusClaimIds: approvedClaimIds,
      engagedThreatIds,
    });

    room.characters.set(characterId, {
      character: result.character,
      phase: "rolled",
      pendingChoice: null,
      activeRoll: result.roll,
      resolved: null,
    });
    this.notify();
  }

  assign(roomId: string, characterId: string, targetKey: string, points: number): void {
    const room = this.rooms.get(roomId);
    const record = room?.characters.get(characterId);
    if (!room || !record || !record.activeRoll) return;
    const next = { ...record.activeRoll.allocations };
    if (points <= 0) delete next[targetKey];
    else next[targetKey] = points;
    room.characters.set(characterId, {
      ...record,
      activeRoll: { ...record.activeRoll, allocations: next },
    });
    this.notify();
  }

  confirmAllocation(roomId: string, characterId: string): void {
    const room = this.rooms.get(roomId);
    const record = room?.characters.get(characterId);
    if (!room || !record || !record.activeRoll) return;
    const totalPoints = record.activeRoll.keptDice.reduce((s, d) => s + diePoints(d.kind), 0);
    const assignedPoints = Object.values(record.activeRoll.allocations).reduce((s, n) => s + n, 0);
    if (totalPoints !== assignedPoints) return;
    const outcome = resolveAllocation(record.character, room.scene, record.activeRoll);
    room.scene = outcome.scene;
    room.history = [
      { characterName: record.character.name, lines: outcome.lines },
      ...room.history,
    ].slice(0, 3);
    room.characters.set(characterId, {
      character: outcome.character,
      phase: "resolved",
      pendingChoice: null,
      activeRoll: record.activeRoll,
      resolved: outcome,
    });
    this.notify();
  }

  playAgain(roomId: string, characterId: string): void {
    const room = this.rooms.get(roomId);
    const record = room?.characters.get(characterId);
    if (!room || !record) return;
    room.characters.set(characterId, {
      character: record.character,
      phase: "compose",
      pendingChoice: null,
      activeRoll: null,
      resolved: null,
    });
    this.notify();
  }

  /** GM control (C03's `SceneDirector`): reveals a hidden Threat to players/table. */
  revealThreat(roomId: string, threatId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.scene = {
      ...room.scene,
      threats: room.scene.threats.map((t) => (t.id === threatId ? { ...t, revealed: true } : t)),
    };
    this.notify();
  }

  /** GM correction (C03's `CorrectionDialog`): bounded Blood adjustment with a required reason. */
  correctBlood(roomId: string, characterId: string, delta: number, reason: string): void {
    if (!reason.trim()) return;
    const room = this.rooms.get(roomId);
    const record = room?.characters.get(characterId);
    if (!room || !record) return;
    const blood = Math.max(0, Math.min(10, record.character.blood + delta));
    room.characters.set(characterId, { ...record, character: { ...record.character, blood } });
    this.notify();
  }
}

export const fixturePlayLoopStore = new FixturePlayLoopStore();
