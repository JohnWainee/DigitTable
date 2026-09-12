import { describe, expect, it } from "vitest";
import { asMemberId, asTemplateId } from "@digitable/contracts";
import { EAT_THE_REICH_MANIFEST } from "../src/manifest.js";
import { eatTheReichTemplate } from "../src/engine.js";
import { freshState } from "./fixtures.js";

describe("schemas", () => {
  it("parseState round-trips a valid state through JSON", () => {
    const state = freshState();
    const parsed = eatTheReichTemplate.schemas.parseState(JSON.parse(JSON.stringify(state)));
    expect(parsed).toEqual(state);
  });

  it("parseState rejects a wrong schema version", () => {
    const bad = { ...freshState(), schemaVersion: 99 };
    expect(() => eatTheReichTemplate.schemas.parseState(bad)).toThrow();
  });

  it("parseCommand rejects an unknown command type", () => {
    expect(() => eatTheReichTemplate.schemas.parseCommand({ type: "NotACommand" })).toThrow();
  });

  it("parseCommand round-trips a BeginAction command", () => {
    const command = {
      type: "BeginAction",
      actorMemberId: "member-rook",
      threatId: "enforcer",
      actionId: "strong-arm-the-enforcer",
      gearIds: ["silenced-tool"],
    };
    expect(eatTheReichTemplate.schemas.parseCommand(command)).toEqual(command);
  });
});

describe("migrate", () => {
  it("accepts the current schema version for this template", () => {
    const state = freshState();
    const result = eatTheReichTemplate.migrate({
      platformVersion: "0.0.0",
      templateId: EAT_THE_REICH_MANIFEST.templateId,
      templateVersion: EAT_THE_REICH_MANIFEST.templateVersion,
      schemaVersion: 1,
      state: JSON.parse(JSON.stringify(state)),
    });
    expect(result.ok).toBe(true);
  });

  it("refuses an unknown schema version rather than guessing a migration", () => {
    const result = eatTheReichTemplate.migrate({
      platformVersion: "0.0.0",
      templateId: EAT_THE_REICH_MANIFEST.templateId,
      templateVersion: EAT_THE_REICH_MANIFEST.templateVersion,
      schemaVersion: 2,
      state: {},
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a record from a different template", () => {
    const result = eatTheReichTemplate.migrate({
      platformVersion: "0.0.0",
      templateId: asTemplateId("some-other-template"),
      templateVersion: "0.0.0",
      schemaVersion: 1,
      state: {},
    });
    expect(result.ok).toBe(false);
  });
});

describe("theatre", () => {
  it("shortens the duration hint and drops decorative cues under reduced motion", () => {
    const event = {
      type: "ActionRolled" as const,
      rollId: "roll-1",
      actorMemberId: asMemberId("member-rook"),
      threatId: "enforcer",
      actionId: "strong-arm-the-enforcer",
      faces: [5, 6],
      hits: 2,
      poolComponents: { nerve: 2, gear: 0, hiddenModifier: 0 },
      hiddenAdjustmentApplied: false,
    };
    const full = eatTheReichTemplate.theatre(event, { reducedMotion: false });
    const reduced = eatTheReichTemplate.theatre(event, { reducedMotion: true });
    expect(full?.cues.length).toBeGreaterThan(0);
    expect(reduced?.cues).toEqual([]);
    expect(reduced?.durationHintMs).toBe(0);
    expect(reduced?.fallback.announcement).toBe(full?.fallback.announcement);
  });
});
