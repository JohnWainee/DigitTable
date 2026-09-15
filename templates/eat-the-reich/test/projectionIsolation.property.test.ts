import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findLeakedSecrets } from "@digitable/testing";
import { eatTheReichTemplate } from "../src/engine.js";
import type { EatTheReichState } from "../src/state.js";
import {
  GM_VIEWER,
  PLAYER_MEMBER_ID,
  PLAYER_VIEWER,
  ROOK_ID,
  SECOND_PLAYER_VIEWER,
  TABLE_VIEWER,
  freshState,
  stateWithClaim,
} from "./fixtures.js";

/**
 * Property: for any character sheet detail (item names, ability names,
 * injury labels — everything only present on `CharacterFullSheet`), a
 * viewer other than the claiming member or the GM never sees it. Only the
 * public `CharacterPartySummary` fields (id, name, concept, stats, Blood,
 * injury box count, downed/retired) are visible to everyone
 * (docs/ARCHITECTURE.md N12; AGENTS.md "Engineering invariants").
 */
describe("projection isolation (property)", () => {
  it("never leaks a claimed character's sheet detail (items/abilities/injuries) outside self/GM", () => {
    fc.assert(
      fc.property(
        // Long hex strings so a match can only mean an actual leak, never a
        // coincidental collision with fixed roster flavor text.
        fc.hexaString({ minLength: 16, maxLength: 32 }),
        fc.integer({ min: 0, max: 10 }),
        (secretItemName, blood) => {
          const base = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID, { blood });
          const character = base.characters[ROOK_ID];
          if (!character) throw new Error("fixture missing rook");
          const state: EatTheReichState = {
            ...base,
            characters: {
              ...base.characters,
              [ROOK_ID]: {
                ...character,
                items: character.items.map((item, index) =>
                  index === 0 ? { ...item, name: secretItemName } : item,
                ),
              },
            },
          };

          const playerView = eatTheReichTemplate.project(state, PLAYER_VIEWER);
          const otherPlayerView = eatTheReichTemplate.project(state, SECOND_PLAYER_VIEWER);
          const tableView = eatTheReichTemplate.project(state, TABLE_VIEWER);
          const gmView = eatTheReichTemplate.project(state, GM_VIEWER);

          expect(findLeakedSecrets(playerView, [secretItemName])).toEqual([secretItemName]);
          expect(findLeakedSecrets(otherPlayerView, [secretItemName])).toEqual([]);
          expect(findLeakedSecrets(tableView, [secretItemName])).toEqual([]);
          expect(findLeakedSecrets(gmView, [secretItemName])).toEqual([secretItemName]);

          // Structural checks: the roster summary (seen by every viewer) never carries item/ability/injury fields at all.
          for (const view of [playerView, otherPlayerView, tableView, gmView]) {
            const rookSummary = view.roster.find((c) => c.id === ROOK_ID);
            expect(rookSummary).not.toHaveProperty("items");
            expect(rookSummary).not.toHaveProperty("abilities");
            expect(rookSummary).not.toHaveProperty("injuries");
            expect(rookSummary?.blood).toBe(blood);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("never gives the GM or table seat a `self` character", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10 }), (blood) => {
        const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID, { blood });
        expect(eatTheReichTemplate.project(state, GM_VIEWER).self).toBeNull();
        expect(eatTheReichTemplate.project(state, TABLE_VIEWER).self).toBeNull();
      }),
    );
  });

  it("an unclaimed roster never gives any viewer a `self` character", () => {
    const state = freshState();
    for (const viewer of [PLAYER_VIEWER, GM_VIEWER, TABLE_VIEWER]) {
      expect(eatTheReichTemplate.project(state, viewer).self).toBeNull();
    }
  });
});
