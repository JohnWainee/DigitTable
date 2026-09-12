import { describe, expect, it } from "vitest";
import { allocationOptionsFor } from "../src/allocations.js";

describe("allocationOptionsFor: allocation invariants", () => {
  it("returns nothing when there are no net successes to spend", () => {
    expect(allocationOptionsFor({ resolveRemaining: 3 }, { advancesRemaining: 2 }, 0)).toEqual([]);
    expect(allocationOptionsFor({ resolveRemaining: 3 }, { advancesRemaining: 2 }, -1)).toEqual([]);
  });

  it("caps each option by the smaller of net successes and its own remaining budget", () => {
    const options = allocationOptionsFor({ resolveRemaining: 1 }, { advancesRemaining: 5 }, 3);
    const byId = Object.fromEntries(options.map((o) => [o.id, o]));
    expect(byId["damage-threat"]?.maxUses).toBe(1);
    expect(byId["advance-objective"]?.maxUses).toBe(3);
  });

  it("omits an option entirely once its remaining budget is exhausted", () => {
    const options = allocationOptionsFor({ resolveRemaining: 0 }, { advancesRemaining: 2 }, 2);
    expect(options.map((o) => o.id)).toEqual(["advance-objective"]);
  });

  it("every option costs exactly one success per use", () => {
    const options = allocationOptionsFor({ resolveRemaining: 5 }, { advancesRemaining: 5 }, 2);
    expect(options.every((o) => o.costPerUse === 1)).toBe(true);
  });
});
