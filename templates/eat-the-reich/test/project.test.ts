import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import { ORIGINAL_ROSTER } from "../src/roster.js";
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

describe("project", () => {
  it("every viewer sees the full roster's public summary, unclaimed", () => {
    const state = freshState();
    for (const viewer of [PLAYER_VIEWER, GM_VIEWER, TABLE_VIEWER]) {
      const view = eatTheReichTemplate.project(state, viewer);
      expect(view.roster).toHaveLength(ORIGINAL_ROSTER.length);
      expect(view.roster.every((c) => c.claimedByMemberId === null)).toBe(true);
      expect(view.roster.every((c) => Object.keys(c.stats).length === 7)).toBe(true);
    }
  });

  it("self is null for a player who has claimed nothing", () => {
    const view = eatTheReichTemplate.project(freshState(), PLAYER_VIEWER);
    expect(view.self).toBeNull();
  });

  it("self is null for GM and table viewers even when someone has claimed a character", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    expect(eatTheReichTemplate.project(state, GM_VIEWER).self).toBeNull();
    expect(eatTheReichTemplate.project(state, TABLE_VIEWER).self).toBeNull();
  });

  it("self is the claiming player's own full sheet", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    const view = eatTheReichTemplate.project(state, PLAYER_VIEWER);
    expect(view.self?.id).toBe(ROOK_ID);
    expect(view.self?.items.length).toBeGreaterThan(0);
    expect(view.self?.abilities.length).toBe(3);
    expect(view.self?.injuries.length).toBe(3);
  });

  it("another player's projection never carries someone else's full sheet as self", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    const view = eatTheReichTemplate.project(state, SECOND_PLAYER_VIEWER);
    expect(view.self).toBeNull();
  });

  it("the roster summary never includes item/ability/injury detail", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    const view = eatTheReichTemplate.project(state, SECOND_PLAYER_VIEWER);
    const rookSummary = view.roster.find((c) => c.id === ROOK_ID);
    expect(rookSummary).toBeDefined();
    expect(rookSummary).not.toHaveProperty("items");
    expect(rookSummary).not.toHaveProperty("abilities");
    expect(rookSummary).not.toHaveProperty("injuries");
    expect(rookSummary?.claimedByMemberId).toBe(PLAYER_MEMBER_ID);
  });

  it("gmSheets is empty for a player or table viewer and full for the GM", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID);
    expect(eatTheReichTemplate.project(state, PLAYER_VIEWER).gmSheets).toEqual([]);
    expect(eatTheReichTemplate.project(state, TABLE_VIEWER).gmSheets).toEqual([]);
    const gmView = eatTheReichTemplate.project(state, GM_VIEWER);
    expect(gmView.gmSheets).toHaveLength(ORIGINAL_ROSTER.length);
    expect(gmView.gmSheets.find((c) => c.id === ROOK_ID)?.items.length).toBeGreaterThan(0);
  });
});
