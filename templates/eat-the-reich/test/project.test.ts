import { describe, expect, it } from "vitest";
import { THREAT_ID } from "../src/content.js";
import { eatTheReichTemplate } from "../src/engine.js";
import {
  GM_VIEWER,
  PLAYER_MEMBER_ID,
  PLAYER_VIEWER,
  TABLE_VIEWER,
  freshState,
  stateWithRoll,
} from "./fixtures.js";
import { ACTION_ID } from "../src/content.js";

describe("project", () => {
  it("gives the player their own full character detail as `self`", () => {
    const view = eatTheReichTemplate.project(freshState(), PLAYER_VIEWER);
    expect(view.self).toMatchObject({
      memberId: PLAYER_MEMBER_ID,
      name: "Rook",
      attributes: { nerve: 2 },
    });
  });

  it("gives the GM and table no character (`self` is null)", () => {
    const state = freshState();
    expect(eatTheReichTemplate.project(state, GM_VIEWER).self).toBeNull();
    expect(eatTheReichTemplate.project(state, TABLE_VIEWER).self).toBeNull();
  });

  it("never includes the threat's hidden fields in a player or table projection", () => {
    const state = freshState();
    const playerThreat = eatTheReichTemplate.project(state, PLAYER_VIEWER).threats[0];
    const tableThreat = eatTheReichTemplate.project(state, TABLE_VIEWER).threats[0];
    expect(playerThreat).not.toHaveProperty("hiddenDifficultyModifier");
    expect(playerThreat).not.toHaveProperty("hiddenIntel");
    expect(tableThreat).not.toHaveProperty("hiddenDifficultyModifier");
    expect(tableThreat).not.toHaveProperty("hiddenIntel");
  });

  it("includes the threat's hidden fields only in the GM projection", () => {
    const state = freshState();
    const gmThreat = eatTheReichTemplate.project(state, GM_VIEWER).threats[0];
    expect(gmThreat).toMatchObject({
      hiddenDifficultyModifier: state.threats[THREAT_ID]?.hiddenDifficultyModifier,
      hiddenIntel: state.threats[THREAT_ID]?.hiddenIntel,
    });
  });

  it("exposes the active roll's hidden modifier magnitude only to the GM", () => {
    const state = stateWithRoll({
      id: "roll-1",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      status: "awaiting_opposition",
      poolComponents: { nerve: 2, gear: 0, hiddenModifier: -1 },
      hiddenAdjustmentApplied: true,
    });

    const playerRoll = eatTheReichTemplate.project(state, PLAYER_VIEWER).activeRoll;
    const gmRoll = eatTheReichTemplate.project(state, GM_VIEWER).activeRoll;

    expect(playerRoll).not.toHaveProperty("hiddenDifficultyModifier");
    expect(playerRoll?.hiddenAdjustmentApplied).toBe(true);
    expect(playerRoll?.playerFaces).toBeNull();
    expect(gmRoll?.playerFaces).toEqual(state.rolls["roll-1"]?.playerFaces);
    expect(gmRoll?.hiddenDifficultyModifier).toBe(-1);
  });

  it("reports no active roll once the only roll is resolved", () => {
    const state = stateWithRoll({
      id: "roll-1",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      status: "resolved",
    });
    expect(eatTheReichTemplate.project(state, PLAYER_VIEWER).activeRoll).toBeNull();
  });
});
