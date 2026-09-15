import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPrivateContentPack, parsePrivateSceneDefinition } from "../src/privateContent.js";

/**
 * B05 (docs/ETR_RULES_MATRIX.md §5, AGENTS.md "Non-negotiable boundaries"):
 * `loadPrivateContentPack` is a Node-only, opt-in utility for a GM's own
 * private, git-ignored rulebook content — never part of the browser bundle
 * (not exported from `./index.js`; see the module's own doc comment).
 * These tests exercise it directly against a throwaway temp directory,
 * never anything under this repository's own `content/private/`.
 */
describe("loadPrivateContentPack", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("returns an empty array when the directory does not exist (no private pack is a normal state)", () => {
    const result = loadPrivateContentPack(join(tmpdir(), "digitable-nonexistent-private-content"));
    expect(result).toEqual([]);
  });

  it("loads every *.json file in the directory as a SceneDefinition", () => {
    dir = mkdtempSync(join(tmpdir(), "digitable-private-content-"));
    const scene = {
      sceneId: "gm-own-scene",
      title: "A scene from the GM's own book",
      locationLabel: "Somewhere private",
      objectives: [
        { id: "obj-1", title: "Do the thing", kind: "primary", rating: 6, challenge: 0 },
      ],
      threats: [
        {
          id: "threat-1",
          name: "A Threat",
          rating: 4,
          attack: 2,
          challenge: 0,
          solo: false,
          elite: false,
          flags: {},
          revealed: true,
          notes: "",
        },
      ],
      reinforcementsMode: "book",
      gmBriefing: "Run this straight from the book.",
    };
    writeFileSync(join(dir, "scene-1.json"), JSON.stringify(scene));
    writeFileSync(join(dir, "not-a-scene.txt"), "ignore me");
    const result = loadPrivateContentPack(dir);
    expect(result).toHaveLength(1);
    expect(result[0]?.sceneId).toBe("gm-own-scene");
  });

  it("throws on a malformed scene file rather than silently skipping it", () => {
    dir = mkdtempSync(join(tmpdir(), "digitable-private-content-"));
    writeFileSync(join(dir, "broken.json"), JSON.stringify({ sceneId: "broken" }));
    expect(() => loadPrivateContentPack(dir)).toThrow();
  });

  it("throws on invalid JSON", () => {
    dir = mkdtempSync(join(tmpdir(), "digitable-private-content-"));
    writeFileSync(join(dir, "invalid.json"), "{ not json");
    expect(() => loadPrivateContentPack(dir)).toThrow();
  });
});

describe("parsePrivateSceneDefinition", () => {
  it("validates a well-formed scene without touching the filesystem", () => {
    const scene = parsePrivateSceneDefinition(
      {
        sceneId: "s1",
        title: "T",
        locationLabel: "L",
        objectives: [],
        threats: [],
        reinforcementsMode: "simplified",
        gmBriefing: "",
      },
      "test",
    );
    expect(scene.sceneId).toBe("s1");
    expect(scene.reinforcementsMode).toBe("simplified");
  });

  it("rejects a missing sceneId", () => {
    expect(() =>
      parsePrivateSceneDefinition(
        {
          title: "T",
          locationLabel: "L",
          objectives: [],
          threats: [],
          reinforcementsMode: "book",
          gmBriefing: "",
        },
        "test",
      ),
    ).toThrow();
  });

  it("rejects an invalid reinforcementsMode", () => {
    expect(() =>
      parsePrivateSceneDefinition(
        {
          sceneId: "s1",
          title: "T",
          locationLabel: "L",
          objectives: [],
          threats: [],
          reinforcementsMode: "chaotic",
          gmBriefing: "",
        },
        "test",
      ),
    ).toThrow();
  });
});
