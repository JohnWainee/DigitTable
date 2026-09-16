import { describe, expect, it } from "vitest";
import { ORIGINAL_MISSION } from "../src/scenes.js";

/**
 * B05 (docs/ETR_RULES_MATRIX.md Appendix C): the shipped four-scene
 * mission is structurally sound and internally consistent, independent of
 * whether it's ever loaded through a live `LoadScene`/`NextScene` command
 * (covered separately in test/lifecycle.integration.test.ts).
 */
describe("ORIGINAL_MISSION (matrix Appendix C)", () => {
  it("has exactly four scenes in play order: opening, two middle scenes, a conclusion", () => {
    expect(ORIGINAL_MISSION).toHaveLength(4);
    expect(ORIGINAL_MISSION.map((s) => s.sceneId)).toEqual([
      "drop-forecourt",
      "metro-platform",
      "printworks",
      "signal-mast",
    ]);
  });

  it("every scene id is globally unique, including nested Objective/Threat ids", () => {
    const sceneIds = new Set(ORIGINAL_MISSION.map((s) => s.sceneId));
    expect(sceneIds.size).toBe(4);
    const objectiveIds = ORIGINAL_MISSION.flatMap((s) => s.objectives.map((o) => o.id));
    expect(new Set(objectiveIds).size).toBe(objectiveIds.length);
    const threatIds = ORIGINAL_MISSION.flatMap((s) => s.threats.map((t) => t.id));
    expect(new Set(threatIds).size).toBe(threatIds.length);
  });

  it("every scene has exactly one primary Objective", () => {
    for (const scene of ORIGINAL_MISSION) {
      expect(scene.objectives.filter((o) => o.kind === "primary")).toHaveLength(1);
    }
  });

  it("every Objective rating falls in the book's 2-12 band (matrix S1)", () => {
    for (const scene of ORIGINAL_MISSION) {
      for (const objective of scene.objectives) {
        expect(objective.rating).toBeGreaterThanOrEqual(2);
        expect(objective.rating).toBeLessThanOrEqual(12);
      }
    }
  });

  it("every Threat has at least one attack and a non-negative Challenge", () => {
    for (const scene of ORIGINAL_MISSION) {
      for (const threat of scene.threats) {
        expect(threat.attack).toBeGreaterThan(0);
        expect(threat.challenge).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("elite Threats are solo and carry a GM-only foreshadowing note (matrix S4, Appendix C)", () => {
    for (const scene of ORIGINAL_MISSION) {
      for (const threat of scene.threats) {
        if (threat.elite) {
          expect(threat.solo).toBe(true);
          expect(threat.notes.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("the final scene's elite (The Warden) is challengeLocked and marks the whole injury category", () => {
    const finalScene = ORIGINAL_MISSION[ORIGINAL_MISSION.length - 1];
    const warden = finalScene?.threats.find((t) => t.elite);
    expect(warden?.flags.challengeLocked).toBe(true);
    expect(warden?.flags.injuryMarksWholeCategory).toBe(true);
  });

  it("gmBriefing is present and non-empty for every scene (source-only, never sent to a client)", () => {
    for (const scene of ORIGINAL_MISSION) {
      expect(scene.gmBriefing.length).toBeGreaterThan(0);
    }
  });
});
