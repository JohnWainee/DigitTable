import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import { ORIGINAL_ROSTER } from "../src/roster.js";
import type { RollRecord } from "../src/state.js";
import {
  GM_VIEWER,
  PLAYER_MEMBER_ID,
  PLAYER_VIEWER,
  ROOK_ID,
  SECOND_PLAYER_VIEWER,
  TABLE_VIEWER,
  freshState,
  stateWithClaim,
  stateWithRoll,
  stateWithScene,
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

describe("project: objectives and threats (B03, matrix Appendix C 'GM-only notes never project')", () => {
  it("every viewer sees an active Objective and a revealed Threat", () => {
    const state = stateWithScene();
    for (const viewer of [PLAYER_VIEWER, GM_VIEWER, TABLE_VIEWER]) {
      const view = eatTheReichTemplate.project(state, viewer);
      expect(view.objectives).toHaveLength(1);
      expect(view.threats).toHaveLength(1);
    }
  });

  it("an unrevealed Threat is hidden from every viewer except the GM", () => {
    const state = stateWithScene({ threat: { revealed: false } });
    expect(eatTheReichTemplate.project(state, PLAYER_VIEWER).threats).toEqual([]);
    expect(eatTheReichTemplate.project(state, TABLE_VIEWER).threats).toEqual([]);
    const gmThreats = eatTheReichTemplate.project(state, GM_VIEWER).threats;
    expect(gmThreats).toHaveLength(1);
    expect(gmThreats[0]).toMatchObject({ revealed: false });
  });

  it("a revealed Threat's GM-only foreshadowing notes never reach a player or the table (matrix Appendix C)", () => {
    const state = stateWithScene({ threat: { notes: "a very secret foreshadowing note" } });
    expect(eatTheReichTemplate.project(state, PLAYER_VIEWER).threats[0]).not.toHaveProperty(
      "notes",
    );
    expect(eatTheReichTemplate.project(state, TABLE_VIEWER).threats[0]).not.toHaveProperty("notes");
    expect(eatTheReichTemplate.project(state, GM_VIEWER).threats[0]).toMatchObject({
      notes: "a very secret foreshadowing note",
    });
  });

  it("only the GM's Threat view carries the `revealed` field", () => {
    const state = stateWithScene();
    const playerThreat = eatTheReichTemplate.project(state, PLAYER_VIEWER).threats[0];
    expect(playerThreat).not.toHaveProperty("revealed");
    const gmThreat = eatTheReichTemplate.project(state, GM_VIEWER).threats[0];
    expect(gmThreat).toHaveProperty("revealed");
  });
});

describe("project: rolls (B03, matrix ETR_SESSION_FLOW §6.1-6.2)", () => {
  const DECLARED: Pick<RollRecord, "id" | "characterId" | "actorMemberId" | "status"> = {
    id: "roll-1",
    characterId: ROOK_ID,
    actorMemberId: PLAYER_MEMBER_ID,
    status: "declared",
  };

  it("a declared roll is shown only as 'acting' to a non-owner, non-GM viewer", () => {
    const state = stateWithRoll(
      { ...DECLARED, declaredStat: "SNEAK", note: "a secret plan" },
      stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID),
    );
    const otherPlayerView = eatTheReichTemplate.project(state, SECOND_PLAYER_VIEWER);
    expect(otherPlayerView.rolls).toEqual([
      { rollId: "roll-1", characterId: ROOK_ID, status: "declared" },
    ]);
    const tableView = eatTheReichTemplate.project(state, TABLE_VIEWER);
    expect(tableView.rolls).toEqual([
      { rollId: "roll-1", characterId: ROOK_ID, status: "declared" },
    ]);
  });

  it("a declared roll shows full detail to its owner and the GM", () => {
    const state = stateWithRoll(
      { ...DECLARED, declaredStat: "SNEAK", note: "a secret plan" },
      stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID),
    );
    const ownerView = eatTheReichTemplate.project(state, PLAYER_VIEWER);
    expect(ownerView.rolls[0]).toMatchObject({ declaredStat: "SNEAK", note: "a secret plan" });
    const gmView = eatTheReichTemplate.project(state, GM_VIEWER);
    expect(gmView.rolls[0]).toMatchObject({ declaredStat: "SNEAK", note: "a secret plan" });
  });

  it("once rolled (awaiting_allocation), every viewer sees full detail (nothing hidden once dice are rolled)", () => {
    const state = stateWithRoll(
      { ...DECLARED, status: "awaiting_allocation", playerFaces: [5, 6] },
      stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID),
    );
    const otherPlayerView = eatTheReichTemplate.project(state, SECOND_PLAYER_VIEWER);
    expect(otherPlayerView.rolls[0]).toMatchObject({
      status: "awaiting_allocation",
      playerFaces: [5, 6],
    });
  });

  it("a resolved roll is dropped from the projection entirely", () => {
    const state = stateWithRoll(
      { ...DECLARED, status: "resolved" },
      stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID),
    );
    for (const viewer of [PLAYER_VIEWER, GM_VIEWER, TABLE_VIEWER]) {
      expect(eatTheReichTemplate.project(state, viewer).rolls).toEqual([]);
    }
  });
});
