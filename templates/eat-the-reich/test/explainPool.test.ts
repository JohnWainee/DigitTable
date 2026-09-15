import { projectViewer } from "@digitable/engine";
import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import { SUCCESS_THRESHOLD } from "../src/pool.js";
import {
  GM_VIEWER,
  PLAYER_MEMBER_ID,
  PLAYER_VIEWER,
  ROOK_ID,
  freshAuthority,
  stateWithClaim,
} from "./fixtures.js";

/**
 * `PoolInput` (packages/contracts) still carries the old `{actionId,
 * gearIds}` shape; `explainPool` adapts it by treating `actionId` as the
 * chosen stat name (or "none") and `gearIds` as item ids (matrix C1, P1-P2)
 * — see the comment on `explainPool` in `src/engine.ts` and
 * `docs/ETR_RULES_IMPLEMENTATION_PLAN.md` for the follow-up contract
 * proposal to extend `PoolInput` properly (ability dice, bonus claims) once
 * B03 needs a full preview.
 */
describe("explainPool", () => {
  it("explains a player's pool from the chosen stat plus a carried item", () => {
    const authority = freshAuthority(stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID));
    const projection = projectViewer(eatTheReichTemplate, authority, PLAYER_VIEWER);
    const explanation = eatTheReichTemplate.explainPool(projection, {
      actionId: "SNEAK",
      gearIds: ["rook-silenced-pistol"],
    });
    expect(explanation.total).toBe(5); // SNEAK(4) + item(1)
    expect(explanation.components).toEqual([
      { label: "SNEAK", value: 4 },
      { label: "Items", value: 1 },
    ]);
  });

  it("falls back to the 2-dice base when no stat fits (matrix C1)", () => {
    const authority = freshAuthority(stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID));
    const projection = projectViewer(eatTheReichTemplate, authority, PLAYER_VIEWER);
    const explanation = eatTheReichTemplate.explainPool(projection, {
      actionId: "none",
      gearIds: [],
    });
    expect(explanation.total).toBe(2);
  });

  it("ignores an item the character does not carry", () => {
    const authority = freshAuthority(stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID));
    const projection = projectViewer(eatTheReichTemplate, authority, PLAYER_VIEWER);
    const explanation = eatTheReichTemplate.explainPool(projection, {
      actionId: "SNEAK",
      gearIds: ["not-a-carried-item"],
    });
    expect(explanation.total).toBe(0); // buildPool rejects the unknown item -> empty explanation
  });

  it("returns an empty pool for a viewer with no claimed character (GM/table)", () => {
    const authority = freshAuthority(stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID));
    const projection = projectViewer(eatTheReichTemplate, authority, GM_VIEWER);
    const explanation = eatTheReichTemplate.explainPool(projection, {
      actionId: "SNEAK",
      gearIds: [],
    });
    expect(explanation).toEqual({
      components: [],
      total: 0,
      diceSides: 6,
      successThreshold: SUCCESS_THRESHOLD,
    });
  });

  it("returns an empty pool for a player who has not claimed a character", () => {
    const projection = projectViewer(eatTheReichTemplate, freshAuthority(), PLAYER_VIEWER);
    const explanation = eatTheReichTemplate.explainPool(projection, {
      actionId: "SNEAK",
      gearIds: [],
    });
    expect(explanation.total).toBe(0);
  });
});
