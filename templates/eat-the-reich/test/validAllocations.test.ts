import { projectViewer } from "@digitable/engine";
import { describe, expect, it } from "vitest";
import type { VisibleRoll } from "@digitable/contracts";
import { ACTION_ID, THREAT_ID } from "../src/content.js";
import { eatTheReichTemplate } from "../src/engine.js";
import {
  PLAYER_MEMBER_ID,
  PLAYER_VIEWER,
  freshAuthority,
  freshState,
  stateWithRoll,
} from "./fixtures.js";

function visibleRoll(overrides: Partial<VisibleRoll> & Pick<VisibleRoll, "rollId">): VisibleRoll {
  return { status: "awaiting_allocation", netSuccesses: null, ...overrides };
}

describe("validAllocations", () => {
  it("caps each option's maxUses by both netSuccesses and the remaining budget", () => {
    const state = stateWithRoll({
      id: "roll-1",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      status: "awaiting_allocation",
      netSuccesses: 2,
    });
    const projection = projectViewer(eatTheReichTemplate, freshAuthority(state), PLAYER_VIEWER);
    const options = eatTheReichTemplate.validAllocations(
      projection,
      visibleRoll({ rollId: "roll-1", netSuccesses: 2 }),
    );

    const byId = Object.fromEntries(options.map((o) => [o.id, o]));
    expect(byId["damage-threat"]?.maxUses).toBe(2); // min(netSuccesses=2, resolveRemaining=3)
    expect(byId["advance-objective"]?.maxUses).toBe(2); // min(netSuccesses=2, advancesRemaining=2)
  });

  it("further caps maxUses when the threat is nearly defeated", () => {
    const state = freshState();
    const damagedState = {
      ...state,
      threats: {
        ...state.threats,
        [THREAT_ID]: { ...state.threats[THREAT_ID]!, resolveRemaining: 1 },
      },
    };
    const withRoll = stateWithRoll(
      {
        id: "roll-1",
        actorMemberId: PLAYER_MEMBER_ID,
        threatId: THREAT_ID,
        actionId: ACTION_ID,
        status: "awaiting_allocation",
        netSuccesses: 3,
      },
      damagedState,
    );
    const projection = projectViewer(eatTheReichTemplate, freshAuthority(withRoll), PLAYER_VIEWER);
    const options = eatTheReichTemplate.validAllocations(
      projection,
      visibleRoll({ rollId: "roll-1", netSuccesses: 3 }),
    );
    const damage = options.find((o) => o.id === "damage-threat");
    expect(damage?.maxUses).toBe(1); // capped by resolveRemaining, not netSuccesses
  });

  it("returns no options when there are zero net successes", () => {
    const state = stateWithRoll({
      id: "roll-1",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      status: "awaiting_allocation",
      netSuccesses: 0,
    });
    const projection = projectViewer(eatTheReichTemplate, freshAuthority(state), PLAYER_VIEWER);
    const options = eatTheReichTemplate.validAllocations(
      projection,
      visibleRoll({ rollId: "roll-1", netSuccesses: 0 }),
    );
    expect(options).toEqual([]);
  });

  it("returns no options while the roll is still awaiting opposition", () => {
    const state = stateWithRoll({
      id: "roll-1",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      status: "awaiting_opposition",
    });
    const projection = projectViewer(eatTheReichTemplate, freshAuthority(state), PLAYER_VIEWER);
    const options = eatTheReichTemplate.validAllocations(
      projection,
      visibleRoll({ rollId: "roll-1", status: "awaiting_opposition", netSuccesses: null }),
    );
    expect(options).toEqual([]);
  });

  it("returns no options when the roll id does not match the projection's active roll", () => {
    const state = stateWithRoll({
      id: "roll-1",
      actorMemberId: PLAYER_MEMBER_ID,
      threatId: THREAT_ID,
      actionId: ACTION_ID,
      status: "awaiting_allocation",
      netSuccesses: 2,
    });
    const projection = projectViewer(eatTheReichTemplate, freshAuthority(state), PLAYER_VIEWER);
    const options = eatTheReichTemplate.validAllocations(
      projection,
      visibleRoll({ rollId: "some-other-roll", netSuccesses: 2 }),
    );
    expect(options).toEqual([]);
  });

  it("returns no options when there is no active roll at all", () => {
    const projection = projectViewer(eatTheReichTemplate, freshAuthority(), PLAYER_VIEWER);
    const options = eatTheReichTemplate.validAllocations(
      projection,
      visibleRoll({ rollId: "roll-1" }),
    );
    expect(options).toEqual([]);
  });
});
