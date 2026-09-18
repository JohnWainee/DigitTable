import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ORIGINAL_MISSION, ORIGINAL_ROSTER } from "@digitable/template-eat-the-reich";
import { HERO_ART, portraitArtSrc, sceneArtSrc, threatArtSrc } from "../../src/shared/artPaths.js";

const PUBLIC = join(import.meta.dirname, "..", "..", "public");
const exists = (url: string): boolean => existsSync(join(PUBLIC, url));
const heroUrls = (): readonly string[] =>
  HERO_ART.srcSet.split(",").map((candidate) => candidate.trim().split(" ")[0]!);

describe("art manifest: every content id resolves to a shipped original derivative", () => {
  it("every scene has card and banner art", () => {
    for (const scene of ORIGINAL_MISSION) {
      for (const width of [640, 1024, 1536] as const) {
        const url = sceneArtSrc(scene.sceneId, width);
        expect(exists(url), url).toBe(true);
      }
    }
  });

  it("every roster character has card and token portraits", () => {
    for (const character of ORIGINAL_ROSTER) {
      for (const size of ["card", "token"] as const) {
        const url = portraitArtSrc(character.id, size);
        expect(exists(url), url).toBe(true);
      }
    }
  });

  it("every authored threat resolves to existing art", () => {
    for (const scene of ORIGINAL_MISSION) {
      for (const threat of scene.threats) {
        const url = threatArtSrc(threat.id);
        expect(url, `no art rule for threat ${threat.id}`).not.toBeNull();
        expect(exists(url!), url!).toBe(true);
      }
    }
  });

  it("the landing hero's every srcset candidate exists", () => {
    expect(heroUrls().length).toBeGreaterThan(1);
    for (const url of heroUrls()) expect(exists(url), url).toBe(true);
    expect(exists(HERO_ART.src)).toBe(true);
  });

  it("ships no derivative outside the documented naming scheme", () => {
    const requested = new Set<string>(heroUrls());
    for (const scene of ORIGINAL_MISSION) {
      for (const width of [640, 1024, 1536] as const) {
        requested.add(sceneArtSrc(scene.sceneId, width));
      }
      for (const threat of scene.threats) requested.add(threatArtSrc(threat.id)!);
    }
    for (const character of ORIGINAL_ROSTER) {
      requested.add(portraitArtSrc(character.id, "card"));
      requested.add(portraitArtSrc(character.id, "token"));
    }
    const orphans = readdirSync(join(PUBLIC, "etr"))
      .map((file) => `/etr/${file}`)
      .filter((url) => !requested.has(url));
    // Spare -256 derivatives are kept for future layouts; anything else is a naming mistake.
    expect(orphans.filter((url) => !/-256\.webp$/.test(url))).toEqual([]);
  });
});
