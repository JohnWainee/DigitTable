import { projectViewer } from "@digitable/engine";
import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import {
  PLAYER_MEMBER_ID,
  PLAYER_VIEWER,
  ROOK_ID,
  freshAuthority,
  stateWithClaim,
} from "./fixtures.js";

/**
 * No active-roll concept exists in state until B03 (docs/ETR_RULES_MATRIX.md
 * 3.2-3.6, docs/ETR_RULES_IMPLEMENTATION_PLAN.md §3): there is never a
 * valid allocation target this milestone. B03 replaces this with the real
 * allocation catalog (matrix A1-A9).
 */
describe("validAllocations", () => {
  it("always returns no options, for any viewer or roll id", () => {
    const authority = freshAuthority(stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID));
    const projection = projectViewer(eatTheReichTemplate, authority, PLAYER_VIEWER);
    const options = eatTheReichTemplate.validAllocations(projection, {
      rollId: "not-a-real-roll",
      status: "awaiting_allocation",
      netSuccesses: 3,
    });
    expect(options).toEqual([]);
  });
});
