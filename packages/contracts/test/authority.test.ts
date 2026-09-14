import { describe, expect, it } from "vitest";
import {
  AUTHORITY_WORKING_BUDGET_BYTES,
  type AuthorityRecord,
  asMemberId,
  asTemplateId,
  checkAuthorityBudget,
} from "../src/index.js";

interface SampleState {
  readonly items: readonly string[];
}

function record(state: SampleState): AuthorityRecord<SampleState> {
  return {
    platformVersion: "0.0.0",
    templateId: asTemplateId("eat-the-reich"),
    templateVersion: "0.0.0",
    schemaVersion: 1,
    roomRevision: 1,
    nextSequence: 1,
    roomStatus: "active",
    gmMemberId: asMemberId("member-gm"),
    state,
  };
}

describe("checkAuthorityBudget", () => {
  it("reports a small record as within both budgets", () => {
    const result = checkAuthorityBudget(record({ items: ["a", "b"] }));
    expect(result.withinWorkingBudget).toBe(true);
    expect(result.withinFirestoreCeiling).toBe(true);
  });

  it("flags a record that exceeds the working budget", () => {
    const bigItem = "x".repeat(1024);
    const items = Array.from({ length: 300 }, () => bigItem);
    const result = checkAuthorityBudget(record({ items }));
    expect(result.bytes).toBeGreaterThan(AUTHORITY_WORKING_BUDGET_BYTES);
    expect(result.withinWorkingBudget).toBe(false);
  });
});
