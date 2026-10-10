import { describe, expect, it } from "vitest";
import { fixtureEncounterCatalog } from "../../src/session/fixtureEncounterCatalog.js";
import { parseEncounterCatalog } from "../../src/session/encounterCatalog.js";

describe("parseEncounterCatalog", () => {
  it("accepts the complete known-scene catalog returned by trusted authority", () => {
    expect(parseEncounterCatalog(fixtureEncounterCatalog())).toHaveLength(4);
  });

  it("rejects duplicate scene IDs instead of accepting an incomplete catalog", () => {
    const catalog = fixtureEncounterCatalog();
    expect(() => parseEncounterCatalog([...catalog.slice(0, 3), catalog[0]])).toThrow(
      "trusted encounter catalog response was invalid",
    );
  });
});
