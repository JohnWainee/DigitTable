import { describe, expect, it } from "vitest";
import {
  PROJECTION_CEILING_BYTES,
  asTemplateId,
  checkProjectionBudget,
  type ViewerProjection,
} from "../src/index.js";

interface SampleView {
  readonly notes: readonly string[];
}

function projection(view: SampleView): ViewerProjection<SampleView> {
  return {
    platformVersion: "0.0.0",
    templateId: asTemplateId("eat-the-reich"),
    templateVersion: "0.0.0",
    schemaVersion: 1,
    viewerId: "gm",
    roomRevision: 1,
    view,
  };
}

describe("checkProjectionBudget", () => {
  it("reports a small projection as within the ceiling", () => {
    const result = checkProjectionBudget(projection({ notes: ["hello"] }));
    expect(result.withinCeiling).toBe(true);
  });

  it("flags a projection that exceeds the per-viewer ceiling", () => {
    const bigNote = "x".repeat(1024);
    const notes = Array.from({ length: 100 }, () => bigNote);
    const result = checkProjectionBudget(projection({ notes }));
    expect(result.bytes).toBeGreaterThan(PROJECTION_CEILING_BYTES);
    expect(result.withinCeiling).toBe(false);
  });
});
