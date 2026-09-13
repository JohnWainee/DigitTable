import { asCommandId, checkProjectionBudget, type AuthorityRecord } from "@digitable/contracts";
import { createSeededRandom, projectViewer, runCommand } from "@digitable/engine";
import { findLeakedSecrets } from "@digitable/testing";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DAMAGE_THREAT_OPTION_ID } from "../src/allocations.js";
import { ACTION_ID, THREAT_ID } from "../src/content.js";
import { eatTheReichTemplate } from "../src/engine.js";
import type { EatTheReichState } from "../src/state.js";
import {
  GM_CTX,
  GM_VIEWER,
  PLAYER_CTX,
  PLAYER_MEMBER_ID,
  PLAYER_VIEWER,
  TABLE_VIEWER,
  freshAuthority,
  freshState,
} from "./fixtures.js";

/** A fresh authority with the fixture threat's hidden fields overridden for this run. */
function authorityWithHiddenThreat(
  hiddenIntel: string,
  hiddenDifficultyModifier: number,
): AuthorityRecord<EatTheReichState> {
  const state = freshState();
  const threat = state.threats[THREAT_ID];
  if (!threat) throw new Error("fixture threat missing");
  return freshAuthority({
    ...state,
    threats: {
      ...state.threats,
      [THREAT_ID]: { ...threat, hiddenIntel, hiddenDifficultyModifier },
    },
  });
}

/**
 * Asserts docs/PHASE_1C_PLAN.md's "Projection isolation (extended)"
 * invariant across all three concurrently-live viewers at once: `table`
 * never sees hidden fields, `gm` is the only one that does, and neither
 * gains a `self` character.
 */
function assertThreeWayIsolation(
  authority: AuthorityRecord<EatTheReichState>,
  hiddenIntel: string,
  hiddenDifficultyModifier: number,
): void {
  const playerProjection = projectViewer(eatTheReichTemplate, authority, PLAYER_VIEWER);
  const gmProjection = projectViewer(eatTheReichTemplate, authority, GM_VIEWER);
  const tableProjection = projectViewer(eatTheReichTemplate, authority, TABLE_VIEWER);

  for (const projection of [playerProjection, gmProjection, tableProjection]) {
    expect(checkProjectionBudget(projection).withinCeiling).toBe(true);
  }

  expect(findLeakedSecrets(playerProjection.view, [hiddenIntel])).toEqual([]);
  expect(findLeakedSecrets(tableProjection.view, [hiddenIntel])).toEqual([]);
  expect(findLeakedSecrets(gmProjection.view, [hiddenIntel])).toEqual([hiddenIntel]);

  expect(playerProjection.view.threats[0]).not.toHaveProperty("hiddenDifficultyModifier");
  expect(tableProjection.view.threats[0]).not.toHaveProperty("hiddenDifficultyModifier");
  expect(gmProjection.view.threats[0]).toMatchObject({ hiddenDifficultyModifier });

  expect(gmProjection.view.self).toBeNull();
  expect(tableProjection.view.self).toBeNull();
  expect(playerProjection.view.self?.memberId).toBe(PLAYER_MEMBER_ID);

  const activeRoll = playerProjection.view.activeRoll;
  if (activeRoll) {
    expect(playerProjection.view.activeRoll).not.toHaveProperty("hiddenDifficultyModifier");
    expect(tableProjection.view.activeRoll).not.toHaveProperty("hiddenDifficultyModifier");
    expect(gmProjection.view.activeRoll?.hiddenDifficultyModifier).toBe(hiddenDifficultyModifier);
    if (hiddenDifficultyModifier !== 0) {
      expect(playerProjection.view.activeRoll?.playerFaces).toBeNull();
      expect(tableProjection.view.activeRoll?.playerFaces).toBeNull();
      expect(gmProjection.view.activeRoll?.playerFaces).not.toBeNull();
    }
  }
}

describe("projection isolation across the full opposed-action flow (property)", () => {
  it("keeps player/GM/table isolation intact at every step of BeginAction -> SubmitOpposition -> AllocateResults", () => {
    fc.assert(
      fc.property(
        fc.hexaString({ minLength: 16, maxLength: 32 }),
        fc.integer({ min: -2, max: 2 }),
        fc.integer({ min: 0, max: 2 }),
        (hiddenIntel, hiddenDifficultyModifier, pushDice) => {
          let authority = authorityWithHiddenThreat(hiddenIntel, hiddenDifficultyModifier);

          const begin = runCommand(eatTheReichTemplate, {
            member: PLAYER_CTX,
            authority,
            random: createSeededRandom(`mr-begin-${hiddenIntel}-${hiddenDifficultyModifier}`),
            command: {
              type: "BeginAction",
              actorMemberId: PLAYER_MEMBER_ID,
              threatId: THREAT_ID,
              actionId: ACTION_ID,
              gearIds: [],
            },
            commandId: asCommandId("mr-cmd-begin"),
            occurredAtServer: "2026-09-13T00:00:00.000Z",
          });
          expect(begin.ok).toBe(true);
          if (!begin.ok) return;
          authority = begin.authority;
          assertThreeWayIsolation(authority, hiddenIntel, hiddenDifficultyModifier);

          const rollId = Object.keys(authority.state.rolls)[0];
          if (!rollId) throw new Error("expected a roll to exist after BeginAction");

          const oppose = runCommand(eatTheReichTemplate, {
            member: GM_CTX,
            authority,
            random: createSeededRandom(`mr-oppose-${pushDice}`),
            command: { type: "SubmitOpposition", rollId, pushDice },
            commandId: asCommandId("mr-cmd-oppose"),
            occurredAtServer: "2026-09-13T00:00:01.000Z",
          });
          expect(oppose.ok).toBe(true);
          if (!oppose.ok) return;
          authority = oppose.authority;
          assertThreeWayIsolation(authority, hiddenIntel, hiddenDifficultyModifier);

          // Allocate using the player's own projection-derived options, exactly as the real
          // player surface does (apps/web/src/player/ActiveRollPanel.tsx), so the allocation is
          // always valid regardless of the random dice outcome.
          const playerProjection = projectViewer(eatTheReichTemplate, authority, PLAYER_VIEWER);
          const netSuccesses = playerProjection.view.activeRoll?.netSuccesses ?? 0;
          const options = eatTheReichTemplate.validAllocations(playerProjection, {
            rollId,
            status: "awaiting_allocation",
            netSuccesses,
          });
          const damageOption = options.find((option) => option.id === DAMAGE_THREAT_OPTION_ID);
          const allocations =
            netSuccesses > 0 && damageOption
              ? [{ optionId: damageOption.id, uses: Math.min(1, damageOption.maxUses) }]
              : [];

          const allocate = runCommand(eatTheReichTemplate, {
            member: PLAYER_CTX,
            authority,
            random: createSeededRandom("mr-allocate"),
            command: { type: "AllocateResults", rollId, allocations },
            commandId: asCommandId("mr-cmd-allocate"),
            occurredAtServer: "2026-09-13T00:00:02.000Z",
          });
          expect(allocate.ok).toBe(true);
          if (!allocate.ok) return;
          authority = allocate.authority;
          assertThreeWayIsolation(authority, hiddenIntel, hiddenDifficultyModifier);

          // The roll is resolved: no viewer's activeRoll survives, so there is nothing left to leak.
          const finalPlayerView = projectViewer(eatTheReichTemplate, authority, PLAYER_VIEWER).view;
          expect(finalPlayerView.activeRoll).toBeNull();
        },
      ),
      { numRuns: 50 },
    );
  });
});
