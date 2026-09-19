import { asCommandId, type AuthorityRecord } from "@digitable/contracts";
import { runCommand, type RunCommandResult } from "@digitable/engine";
import { findLeakedSecrets } from "@digitable/testing";
import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import type { EatTheReichEvent } from "../src/events.js";
import type { EatTheReichState, ThreatState } from "../src/state.js";
import {
  FixedSequenceRandom,
  GM_CTX,
  PLAYER_CTX,
  PLAYER_MEMBER_ID,
  ROOK_ID,
  freshAuthority,
  stateWithClaim,
  stateWithScene,
  stateWithRoll,
} from "./fixtures.js";

/**
 * AGENTS.md invariant: "Hidden GM-only inputs are redacted from
 * player-visible projections AND player-visible event copies." `project()`
 * hides every `revealed === false` Threat (and every `notes` field) from
 * players and the table, but several `decide` functions used to copy the
 * full payload straight to the `"shared"` destination, which every room
 * member reads. These tests assert directly on `runCommand`'s delivered
 * envelopes — the real storage partition boundary — rather than on
 * `project()` output, closing the regression-coverage gap an independent
 * review flagged.
 */

const REVEALED_ID = "threat-fixture";
const REVEALED_NAME = "Fixture Threat";
const HIDDEN_ID = "hidden-threat";
const HIDDEN_NAME = "Hidden Threat";
const HIDDEN_NOTES = "gm-only foreshadowing: the hidden one is waiting";
const HIDDEN_RATING = 37;
const HIDDEN_ATTACK = 41;
const HIDDEN_CHALLENGE = 43;

const HIDDEN_SECRETS = [HIDDEN_ID, HIDDEN_NAME, HIDDEN_NOTES] as const;

function hiddenThreat(overrides: Partial<ThreatState> = {}): ThreatState {
  return {
    id: HIDDEN_ID,
    name: HIDDEN_NAME,
    rating: HIDDEN_RATING,
    startingAttack: HIDDEN_ATTACK,
    attack: HIDDEN_ATTACK,
    challenge: HIDDEN_CHALLENGE,
    solo: false,
    elite: false,
    flags: {},
    status: "active",
    revealed: false,
    notes: HIDDEN_NOTES,
    ...overrides,
  };
}

/** One revealed Threat (`threat-fixture`) plus one unrevealed one with distinctive GM-only data. */
function stateWithHiddenThreat(): EatTheReichState {
  return stateWithScene(
    { extraThreats: [hiddenThreat()] },
    stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID),
  );
}

function deliveredPayload(
  result: RunCommandResult<EatTheReichState, EatTheReichEvent>,
  kind: "gm" | "shared",
): EatTheReichEvent {
  if (!result.ok) throw new Error(`command rejected: ${result.code} ${result.message}`);
  const delivered = result.envelopes.find((envelope) => envelope.destination.kind === kind);
  if (!delivered) throw new Error(`no ${kind} envelope delivered`);
  return delivered.envelope.payload;
}

function expectNoHiddenThreat(payload: unknown): void {
  expect(findLeakedSecrets(payload, [...HIDDEN_SECRETS])).toEqual([]);
  const json = JSON.stringify(payload);
  expect(json).not.toContain(HIDDEN_ID);
  expect(json).not.toContain(HIDDEN_NAME);
  expect(json).not.toContain(HIDDEN_NOTES);
}

describe("shared event redaction: EditScene (matrix S4/Appendix C)", () => {
  it("redacts an unrevealed Threat's updated stats from the shared copy; GM copy and reduce stay full", () => {
    const result = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority: freshAuthority(stateWithHiddenThreat()),
      random: new FixedSequenceRandom([]),
      command: {
        type: "EditScene",
        reason: "the GM adjusts the fight",
        updateThreats: [
          { threatId: REVEALED_ID, rating: 9 },
          { threatId: HIDDEN_ID, rating: 5, attack: 6, challenge: 7 },
        ],
      },
      commandId: asCommandId("cmd-edit-update"),
      occurredAtServer: "2026-09-17T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const shared = deliveredPayload(result, "shared");
    const gm = deliveredPayload(result, "gm");
    if (shared.type !== "SceneEdited" || gm.type !== "SceneEdited") {
      throw new Error("expected SceneEdited on both destinations");
    }

    // The shared copy carries nothing about the unrevealed Threat.
    expectNoHiddenThreat(shared);
    expect(shared.updatedThreats.map((update) => update.threatId)).toEqual([REVEALED_ID]);
    expect(shared.addedThreats).toEqual([]);
    expect(shared.removedThreatIds).toEqual([]);

    // The GM copy is untouched.
    expect(gm.updatedThreats.map((update) => update.threatId).sort()).toEqual(
      [REVEALED_ID, HIDDEN_ID].sort(),
    );
    expect(gm.updatedThreats.find((update) => update.threatId === HIDDEN_ID)).toMatchObject({
      rating: 5,
      attack: 6,
      challenge: 7,
    });

    // `reduce` consumed the full event: the unrevealed Threat's post-state is updated.
    expect(result.authority.state.threats[HIDDEN_ID]).toMatchObject({
      rating: 5,
      attack: 6,
      challenge: 7,
      revealed: false,
    });
    expect(result.authority.state.threats[REVEALED_ID]?.rating).toBe(9);
  });

  it("redacts an unrevealed Threat's id from shared removedThreatIds; GM copy and reduce stay full", () => {
    const result = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority: freshAuthority(stateWithHiddenThreat()),
      random: new FixedSequenceRandom([]),
      command: {
        type: "EditScene",
        reason: "both threats leave the scene",
        removeThreatIds: [REVEALED_ID, HIDDEN_ID],
      },
      commandId: asCommandId("cmd-edit-remove"),
      occurredAtServer: "2026-09-17T00:00:01.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const shared = deliveredPayload(result, "shared");
    const gm = deliveredPayload(result, "gm");
    if (shared.type !== "SceneEdited" || gm.type !== "SceneEdited") {
      throw new Error("expected SceneEdited on both destinations");
    }

    expectNoHiddenThreat(shared);
    expect(shared.removedThreatIds).toEqual([REVEALED_ID]);
    expect(shared.updatedThreats).toEqual([]);

    expect(gm.removedThreatIds).toContain(REVEALED_ID);
    expect(gm.removedThreatIds).toContain(HIDDEN_ID);

    expect(result.authority.state.threats[REVEALED_ID]).toBeUndefined();
    expect(result.authority.state.threats[HIDDEN_ID]).toBeUndefined();
  });
});

describe("shared event redaction: EndRound (matrix S6/S7)", () => {
  function endRound(
    mode: "book" | "simplified",
    hiddenRating: number,
    faces: readonly number[],
  ): {
    readonly authority: AuthorityRecord<EatTheReichState>;
    readonly shared: Extract<EatTheReichEvent, { type: "RoundEnded" }>;
    readonly gm: Extract<EatTheReichEvent, { type: "RoundEnded" }>;
  } {
    const state = stateWithScene(
      {
        scene: { reinforcementsMode: mode },
        extraThreats: [hiddenThreat({ rating: hiddenRating })],
      },
      stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID),
    );
    const result = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority: freshAuthority(state),
      random: new FixedSequenceRandom([...faces]),
      command: { type: "EndRound" },
      commandId: asCommandId(`cmd-endround-${mode}-${hiddenRating}`),
      occurredAtServer: "2026-09-17T00:00:02.000Z",
    });
    if (!result.ok) throw new Error(`EndRound rejected: ${result.code} ${result.message}`);
    const shared = deliveredPayload(result, "shared");
    const gm = deliveredPayload(result, "gm");
    if (shared.type !== "RoundEnded" || gm.type !== "RoundEnded") {
      throw new Error("expected RoundEnded on both destinations");
    }
    return { authority: result.authority, shared, gm };
  }

  it("book mode, unrevealed Threat above 0: shared keeps only the revealed delta", () => {
    const { authority, shared, gm } = endRound("book", HIDDEN_RATING, []);

    expectNoHiddenThreat(shared);
    expect(shared.reinforcementDeltas.map((delta) => delta.threatId)).toEqual([REVEALED_ID]);
    expect(gm.reinforcementDeltas.map((delta) => delta.threatId).sort()).toEqual(
      [REVEALED_ID, HIDDEN_ID].sort(),
    );

    // reduce used the full event.
    expect(authority.state.threats[HIDDEN_ID]).toMatchObject({
      rating: HIDDEN_RATING,
      attack: HIDDEN_ATTACK + 1,
      status: "active",
    });
    expect(authority.state.threats[REVEALED_ID]).toMatchObject({
      rating: 6,
      attack: 4,
      status: "active",
    });
  });

  it("book mode, unrevealed Threat at/below 0: shared keeps only the revealed delta", () => {
    const { authority, shared, gm } = endRound("book", 0, [5]);

    expectNoHiddenThreat(shared);
    expect(shared.reinforcementDeltas.map((delta) => delta.threatId)).toEqual([REVEALED_ID]);
    expect(gm.reinforcementDeltas.map((delta) => delta.threatId).sort()).toEqual(
      [REVEALED_ID, HIDDEN_ID].sort(),
    );

    expect(authority.state.threats[HIDDEN_ID]).toMatchObject({
      rating: 5,
      attack: Math.floor(HIDDEN_ATTACK / 2),
      status: "active",
    });
  });

  it("simplified mode, unrevealed Threat above 0: shared keeps only the revealed delta", () => {
    const { authority, shared, gm } = endRound("simplified", HIDDEN_RATING, [1, 3]);

    expectNoHiddenThreat(shared);
    expect(shared.reinforcementDeltas.map((delta) => delta.threatId)).toEqual([REVEALED_ID]);
    expect(gm.reinforcementDeltas.map((delta) => delta.threatId).sort()).toEqual(
      [REVEALED_ID, HIDDEN_ID].sort(),
    );

    expect(authority.state.threats[HIDDEN_ID]).toMatchObject({
      rating: HIDDEN_RATING + 3,
      attack: HIDDEN_ATTACK,
      status: "active",
    });
    expect(authority.state.threats[REVEALED_ID]?.rating).toBe(7);
  });

  it("delivers the gm and shared copies as one logical event (same eventId and sequence)", () => {
    const state = stateWithScene(
      {
        scene: { reinforcementsMode: "simplified" },
        extraThreats: [hiddenThreat({ rating: HIDDEN_RATING })],
      },
      stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID),
    );
    const result = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority: freshAuthority(state),
      random: new FixedSequenceRandom([1, 3]),
      command: { type: "EndRound" },
      commandId: asCommandId("cmd-endround-one-logical-event"),
      occurredAtServer: "2026-09-17T00:00:02.000Z",
    });
    if (!result.ok) throw new Error(`EndRound rejected: ${result.code} ${result.message}`);

    const copies = result.envelopes.filter(
      ({ envelope }) => envelope.payload.type === "RoundEnded",
    );
    expect(copies.map(({ destination }) => destination.kind).sort()).toEqual(["gm", "shared"]);
    expect(new Set(copies.map(({ envelope }) => envelope.eventId)).size).toBe(1);
    expect(new Set(copies.map(({ envelope }) => envelope.sequence)).size).toBe(1);
  });

  it("simplified mode, unrevealed Threat at/below 0: shared keeps only the revealed delta", () => {
    const { authority, shared, gm } = endRound("simplified", 0, [1]);

    expectNoHiddenThreat(shared);
    expect(shared.reinforcementDeltas.map((delta) => delta.threatId)).toEqual([REVEALED_ID]);
    expect(gm.reinforcementDeltas.map((delta) => delta.threatId).sort()).toEqual(
      [REVEALED_ID, HIDDEN_ID].sort(),
    );

    expect(authority.state.threats[HIDDEN_ID]).toMatchObject({
      rating: 0,
      attack: 0,
      status: "removed",
    });
  });
});

describe("shared event redaction: AllocateResults (matrix A1-A9)", () => {
  function awaitingAllocationState(): EatTheReichState {
    return stateWithRoll(
      {
        id: "roll-resolve",
        characterId: ROOK_ID,
        actorMemberId: PLAYER_MEMBER_ID,
        status: "awaiting_allocation",
        engagedThreatIds: [REVEALED_ID],
        primaryEngagedThreatId: REVEALED_ID,
        playerFaces: [6, 6],
        keptDice: [
          { faceIndex: 0, face: 6, result: "critical", points: 2 },
          { faceIndex: 1, face: 6, result: "critical", points: 2 },
        ],
        attackDiceRolled: 0,
        attackFaces: [],
        attackSuccessesRolled: 0,
      },
      stateWithHiddenThreat(),
    );
  }

  it("redacts a shared allocation that names an unrevealed Threat; GM copy and reduce stay full", () => {
    const result = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority: freshAuthority(awaitingAllocationState()),
      random: new FixedSequenceRandom([1]), // unused: no remaining Attack successes, so no injury roll
      command: {
        type: "AllocateResults",
        rollId: "roll-resolve",
        allocations: [
          { dieFaceIndex: 0, target: { kind: "threat", threatId: HIDDEN_ID } },
          { dieFaceIndex: 1, target: { kind: "threat", threatId: REVEALED_ID } },
        ],
      },
      commandId: asCommandId("cmd-allocate-hidden"),
      occurredAtServer: "2026-09-17T00:00:03.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const shared = deliveredPayload(result, "shared");
    const gm = deliveredPayload(result, "gm");
    if (shared.type !== "ActionResolved" || gm.type !== "ActionResolved") {
      throw new Error("expected ActionResolved on both destinations");
    }

    expectNoHiddenThreat(shared);
    expect(shared.allocations).toEqual([
      { dieFaceIndex: 1, target: { kind: "threat", threatId: REVEALED_ID } },
    ]);
    expect(shared.threatDeltas.map((delta) => delta.threatId)).toEqual([REVEALED_ID]);

    expect(gm.allocations).toHaveLength(2);
    expect(gm.threatDeltas.map((delta) => delta.threatId).sort()).toEqual(
      [REVEALED_ID, HIDDEN_ID].sort(),
    );

    // reduce consumed the full event, so the unrevealed Threat's state is intact.
    expect(result.authority.state.threats[HIDDEN_ID]).toMatchObject({
      rating: HIDDEN_RATING,
      attack: HIDDEN_ATTACK,
      status: "active",
    });
    expect(result.authority.state.threats[REVEALED_ID]?.rating).toBe(4);
  });
});

describe("shared event redaction: full lifecycle guard", () => {
  it("never puts an unrevealed Threat's id/name/notes in any shared envelope", () => {
    const sharedPayloads: EatTheReichEvent[] = [];
    function record(
      result: RunCommandResult<EatTheReichState, EatTheReichEvent>,
    ): AuthorityRecord<EatTheReichState> {
      if (!result.ok) throw new Error(`command rejected: ${result.code} ${result.message}`);
      for (const delivered of result.envelopes) {
        if (delivered.destination.kind === "shared")
          sharedPayloads.push(delivered.envelope.payload);
      }
      return result.authority;
    }

    let authority = freshAuthority();

    // 1. scene load
    authority = record(
      runCommand(eatTheReichTemplate, {
        member: GM_CTX,
        authority,
        random: new FixedSequenceRandom([]),
        command: {
          type: "LoadScene",
          sceneId: "guard-scene",
          title: "Guard Scene",
          locationLabel: "Nowhere",
          objectives: [
            {
              id: "guard-objective",
              title: "Guard Objective",
              kind: "primary",
              rating: 8,
              challenge: 0,
            },
          ],
          threats: [
            {
              id: REVEALED_ID,
              name: REVEALED_NAME,
              rating: 6,
              attack: 3,
              challenge: 0,
              solo: false,
              elite: false,
              flags: {},
              revealed: true,
              notes: "",
            },
            {
              id: HIDDEN_ID,
              name: HIDDEN_NAME,
              rating: HIDDEN_RATING,
              attack: HIDDEN_ATTACK,
              challenge: HIDDEN_CHALLENGE,
              solo: false,
              elite: false,
              flags: {},
              revealed: false,
              notes: HIDDEN_NOTES,
            },
          ],
          reinforcementsMode: "book",
        },
        commandId: asCommandId("guard-load"),
        occurredAtServer: "2026-09-17T01:00:00.000Z",
      }),
    );

    // 2. edit
    authority = record(
      runCommand(eatTheReichTemplate, {
        member: GM_CTX,
        authority,
        random: new FixedSequenceRandom([]),
        command: {
          type: "EditScene",
          reason: "guard lifecycle edit",
          updateThreats: [
            { threatId: REVEALED_ID, rating: 5 },
            { threatId: HIDDEN_ID, rating: 30 },
          ],
        },
        commandId: asCommandId("guard-edit"),
        occurredAtServer: "2026-09-17T01:00:01.000Z",
      }),
    );

    // 3. claim
    authority = record(
      runCommand(eatTheReichTemplate, {
        member: PLAYER_CTX,
        authority,
        random: new FixedSequenceRandom([]),
        command: { type: "ClaimCharacter", characterId: ROOK_ID },
        commandId: asCommandId("guard-claim"),
        occurredAtServer: "2026-09-17T01:00:02.000Z",
      }),
    );

    // 4. begin action
    authority = record(
      runCommand(eatTheReichTemplate, {
        member: PLAYER_CTX,
        authority,
        random: new FixedSequenceRandom([]),
        command: {
          type: "BeginAction",
          characterId: ROOK_ID,
          stat: "CON",
          itemIds: [],
          abilityIds: [],
          bonusClaimIds: [],
          engagedThreatIds: [REVEALED_ID],
          note: null,
        },
        commandId: asCommandId("guard-begin"),
        occurredAtServer: "2026-09-17T01:00:03.000Z",
      }),
    );
    const rollId = Object.keys(authority.state.rolls)[0];
    if (!rollId) throw new Error("expected a declared roll");

    // 5. roll (GM review): 4 player dice (all critical), 4 attack dice (all misses)
    authority = record(
      runCommand(eatTheReichTemplate, {
        member: GM_CTX,
        authority,
        random: new FixedSequenceRandom([6, 6, 6, 6, 1, 1, 1, 1]),
        command: {
          type: "ReviewAction",
          rollId,
          approvedClaimIds: [],
          engagedThreatIds: [REVEALED_ID],
        },
        commandId: asCommandId("guard-review"),
        occurredAtServer: "2026-09-17T01:00:04.000Z",
      }),
    );

    // 6. allocate: deliberately name the unrevealed Threat in one allocation
    const keptDice = authority.state.rolls[rollId]?.keptDice ?? [];
    expect(keptDice).toHaveLength(4);
    authority = record(
      runCommand(eatTheReichTemplate, {
        member: PLAYER_CTX,
        authority,
        random: new FixedSequenceRandom([1]), // unused: no remaining Attack successes
        command: {
          type: "AllocateResults",
          rollId,
          allocations: keptDice.map((die, index) => ({
            dieFaceIndex: die.faceIndex,
            target:
              index === 0
                ? { kind: "threat" as const, threatId: HIDDEN_ID }
                : index === 1
                  ? { kind: "threat" as const, threatId: REVEALED_ID }
                  : { kind: "feed" as const },
          })),
        },
        commandId: asCommandId("guard-allocate"),
        occurredAtServer: "2026-09-17T01:00:05.000Z",
      }),
    );

    // 7. end round
    authority = record(
      runCommand(eatTheReichTemplate, {
        member: GM_CTX,
        authority,
        random: new FixedSequenceRandom([]),
        command: { type: "EndRound" },
        commandId: asCommandId("guard-endround"),
        occurredAtServer: "2026-09-17T01:00:06.000Z",
      }),
    );

    expect(sharedPayloads.length).toBeGreaterThan(0);
    for (const payload of sharedPayloads) {
      expectNoHiddenThreat(payload);
    }

    // Sanity: the unrevealed Threat still exists and is untouched in authority state.
    expect(authority.state.threats[HIDDEN_ID]?.revealed).toBe(false);
  });
});
