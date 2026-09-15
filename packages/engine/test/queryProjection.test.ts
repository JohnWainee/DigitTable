import { describe, expect, it } from "vitest";
import type {
  AllocationOption,
  PoolExplanation,
  PoolInput,
  ViewerProjection,
  VisibleRoll,
} from "@digitable/contracts";
import { queryProjection, type QueryingTemplate } from "../src/index.js";

interface FixtureView {
  readonly gearIds: readonly string[];
}

const fixtureProjection: ViewerProjection<FixtureView> = {
  platformVersion: "0.0.0",
  templateId: "eat-the-reich" as never,
  templateVersion: "0.0.0",
  schemaVersion: 1,
  viewerId: "member-fixture" as never,
  roomRevision: 3,
  view: { gearIds: ["torch"] },
};

const fixtureTemplate: QueryingTemplate<FixtureView> = {
  explainPool(projection, _input: PoolInput): PoolExplanation {
    return {
      components: projection.view.gearIds.map((id) => ({ label: id, value: 1 })),
      total: projection.view.gearIds.length,
      diceSides: 6,
      successThreshold: 4,
    };
  },
  validAllocations(_projection, roll: VisibleRoll): readonly AllocationOption[] {
    return roll.status === "awaiting_allocation"
      ? [{ id: "opt-1", label: "Push", costPerUse: 1, maxUses: 1 }]
      : [];
  },
};

describe("queryProjection", () => {
  it("binds explainPool to the given projection", () => {
    const query = queryProjection(fixtureTemplate, fixtureProjection);
    const input: PoolInput = { actionId: "action-1", gearIds: [] };
    expect(query.explainPool(input)).toEqual({
      components: [{ label: "torch", value: 1 }],
      total: 1,
      diceSides: 6,
      successThreshold: 4,
    });
  });

  it("binds validAllocations to the given projection", () => {
    const query = queryProjection(fixtureTemplate, fixtureProjection);
    const awaiting: VisibleRoll = {
      rollId: "roll-1",
      status: "awaiting_allocation",
      netSuccesses: 2,
    };
    expect(query.validAllocations(awaiting)).toHaveLength(1);

    const resolved: VisibleRoll = { rollId: "roll-1", status: "resolved", netSuccesses: 2 };
    expect(query.validAllocations(resolved)).toHaveLength(0);
  });

  it("exposes the underlying projection unchanged", () => {
    const query = queryProjection(fixtureTemplate, fixtureProjection);
    expect(query.projection).toBe(fixtureProjection);
  });
});
