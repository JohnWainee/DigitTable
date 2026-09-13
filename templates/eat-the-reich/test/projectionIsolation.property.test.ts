import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findLeakedSecrets } from "@digitable/testing";
import { ACTION_ID, THREAT_ID } from "../src/content.js";
import { eatTheReichTemplate } from "../src/engine.js";
import type { EatTheReichState } from "../src/state.js";
import {
  GM_VIEWER,
  PLAYER_MEMBER_ID,
  PLAYER_VIEWER,
  TABLE_VIEWER,
  freshState,
} from "./fixtures.js";

/**
 * Property: for any hidden GM-only threat data and any hidden roll modifier,
 * a player's or table's projection never contains it — only the GM's does
 * (docs/ARCHITECTURE.md, N12; AGENTS.md "Engineering invariants").
 */
describe("projection isolation (property)", () => {
  it("never leaks the threat's hidden intel or difficulty modifier to a non-GM viewer", () => {
    fc.assert(
      fc.property(
        // Long hex strings, not short/common substrings, so a match against
        // fixed public flavor text can only mean an actual leak, never a
        // coincidental collision (e.g. a single space would match almost
        // every sentence in the fixture content).
        fc.hexaString({ minLength: 16, maxLength: 32 }),
        fc.integer({ min: -5, max: 5 }),
        fc.boolean(),
        fc.integer({ min: -5, max: 5 }),
        (hiddenIntel, hiddenDifficultyModifier, hasActiveRoll, rollHiddenModifier) => {
          const base = freshState();
          const threat = base.threats[THREAT_ID];
          if (!threat) throw new Error("fixture threat missing");

          let state: EatTheReichState = {
            ...base,
            threats: {
              ...base.threats,
              [THREAT_ID]: { ...threat, hiddenIntel, hiddenDifficultyModifier },
            },
          };

          if (hasActiveRoll) {
            state = {
              ...state,
              rolls: {
                "roll-1": {
                  id: "roll-1",
                  actorMemberId: PLAYER_MEMBER_ID,
                  threatId: THREAT_ID,
                  actionId: ACTION_ID,
                  status: "awaiting_opposition",
                  playerFaces: [5],
                  playerHits: 1,
                  poolComponents: { nerve: 2, gear: 0, hiddenModifier: rollHiddenModifier },
                  hiddenAdjustmentApplied: rollHiddenModifier !== 0,
                },
              },
            };
          }

          const playerView = eatTheReichTemplate.project(state, PLAYER_VIEWER);
          const tableView = eatTheReichTemplate.project(state, TABLE_VIEWER);
          const gmView = eatTheReichTemplate.project(state, GM_VIEWER);

          // String secret: findLeakedSecrets walks every string leaf in the view.
          expect(findLeakedSecrets(playerView, [hiddenIntel])).toEqual([]);
          expect(findLeakedSecrets(tableView, [hiddenIntel])).toEqual([]);
          expect(findLeakedSecrets(gmView, [hiddenIntel])).toEqual([hiddenIntel]);

          // Structural checks for the numeric secret (findLeakedSecrets only walks strings).
          expect(playerView.threats[0]).not.toHaveProperty("hiddenDifficultyModifier");
          expect(tableView.threats[0]).not.toHaveProperty("hiddenDifficultyModifier");
          expect(gmView.threats[0]).toMatchObject({ hiddenDifficultyModifier });

          if (hasActiveRoll) {
            expect(playerView.activeRoll).not.toHaveProperty("hiddenDifficultyModifier");
            expect(tableView.activeRoll).not.toHaveProperty("hiddenDifficultyModifier");
            expect(gmView.activeRoll?.hiddenDifficultyModifier).toBe(rollHiddenModifier);
            if (rollHiddenModifier !== 0) {
              expect(playerView.activeRoll?.playerFaces).toBeNull();
              expect(tableView.activeRoll?.playerFaces).toBeNull();
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("never gives the GM or table seat a `self` character", () => {
    fc.assert(
      fc.property(fc.integer({ min: -5, max: 5 }), (hiddenDifficultyModifier) => {
        const base = freshState();
        const threat = base.threats[THREAT_ID];
        if (!threat) throw new Error("fixture threat missing");
        const state: EatTheReichState = {
          ...base,
          threats: { ...base.threats, [THREAT_ID]: { ...threat, hiddenDifficultyModifier } },
        };
        expect(eatTheReichTemplate.project(state, GM_VIEWER).self).toBeNull();
        expect(eatTheReichTemplate.project(state, TABLE_VIEWER).self).toBeNull();
      }),
    );
  });
});
