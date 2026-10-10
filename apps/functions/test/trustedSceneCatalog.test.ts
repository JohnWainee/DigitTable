import { describe, expect, it } from "vitest";
import { ORIGINAL_MISSION } from "@digitable/template-eat-the-reich";
import { PUBLIC_SCENE_CATALOG } from "@digitable/template-eat-the-reich/public-scenes";
import { resolveOriginalSceneCommand } from "../src/trustedSceneCatalog.js";

describe("trusted original scene catalog", () => {
  it("keeps public card metadata aligned with private trusted definitions", () => {
    expect(PUBLIC_SCENE_CATALOG).toHaveLength(ORIGINAL_MISSION.length);
    for (const [index, scene] of ORIGINAL_MISSION.entries()) {
      expect(PUBLIC_SCENE_CATALOG[index]).toMatchObject({
        sceneId: scene.sceneId,
        title: scene.title,
        locationLabel: scene.locationLabel,
        artKey: scene.sceneId,
      });
    }
  });

  it("expands an ID-only GM command inside the trusted authority", () => {
    const result = resolveOriginalSceneCommand(
      { type: "LoadOriginalScene", sceneId: "metro-platform" },
      "gm",
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.command.type !== "LoadScene") throw new Error("expected LoadScene");
    const trustedScene = ORIGINAL_MISSION.find((scene) => scene.sceneId === "metro-platform")!;
    expect(result.command).toMatchObject({
      sceneId: trustedScene.sceneId,
      title: trustedScene.title,
      threats: trustedScene.threats,
    });
    expect(JSON.stringify(result.command)).not.toContain(trustedScene.gmBriefing);
  });

  it("does not resolve private scene data for non-GM or unknown scene requests", () => {
    expect(
      resolveOriginalSceneCommand(
        { type: "LoadOriginalScene", sceneId: "metro-platform" },
        "player",
      ),
    ).toEqual({ ok: false, code: "ROLE_FORBIDDEN" });
    expect(
      resolveOriginalSceneCommand(
        { type: "NextOriginalScene", sceneId: "not-a-scene", reason: "test" },
        "gm",
      ),
    ).toEqual({ ok: false, code: "UNKNOWN_ACTION" });
  });
});
