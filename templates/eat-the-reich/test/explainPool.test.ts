import { projectViewer } from "@digitable/engine";
import { describe, expect, it } from "vitest";
import { ACTION_ID, GEAR_SILENCED_TOOL } from "../src/content.js";
import { eatTheReichTemplate } from "../src/engine.js";
import { GM_VIEWER, PLAYER_VIEWER, freshAuthority } from "./fixtures.js";

describe("explainPool", () => {
  it("explains a player's pool from nerve plus carried, action-relevant gear", () => {
    const projection = projectViewer(eatTheReichTemplate, freshAuthority(), PLAYER_VIEWER);
    const explanation = eatTheReichTemplate.explainPool(projection, {
      actionId: ACTION_ID,
      gearIds: [GEAR_SILENCED_TOOL],
    });
    expect(explanation.total).toBe(3); // nerve(2) + gear(1)
    expect(explanation.components.map((c) => c.value)).toEqual([2, 1]);
  });

  it("never includes a hidden GM modifier: the pre-roll explanation can differ from the real roll", () => {
    const projection = projectViewer(eatTheReichTemplate, freshAuthority(), PLAYER_VIEWER);
    const explanation = eatTheReichTemplate.explainPool(projection, {
      actionId: ACTION_ID,
      gearIds: [],
    });
    // The real roll also applies threat.hiddenDifficultyModifier (-1 in the
    // placeholder fixture), which this explanation cannot see or reflect.
    expect(explanation.total).toBe(2); // nerve(2) only — no hidden component exists to add
  });

  it("ignores gear the character does not actually carry", () => {
    const projection = projectViewer(eatTheReichTemplate, freshAuthority(), PLAYER_VIEWER);
    const explanation = eatTheReichTemplate.explainPool(projection, {
      actionId: ACTION_ID,
      gearIds: ["not-carried-gear"],
    });
    expect(explanation.total).toBe(2);
  });

  it("returns an empty pool for a viewer with no character (GM/table)", () => {
    const projection = projectViewer(eatTheReichTemplate, freshAuthority(), GM_VIEWER);
    const explanation = eatTheReichTemplate.explainPool(projection, {
      actionId: ACTION_ID,
      gearIds: [],
    });
    expect(explanation).toEqual({ components: [], total: 0, diceSides: 6, successThreshold: 5 });
  });

  it("returns an empty pool for an unknown action id", () => {
    const projection = projectViewer(eatTheReichTemplate, freshAuthority(), PLAYER_VIEWER);
    const explanation = eatTheReichTemplate.explainPool(projection, {
      actionId: "not-real",
      gearIds: [],
    });
    expect(explanation.total).toBe(0);
  });
});
