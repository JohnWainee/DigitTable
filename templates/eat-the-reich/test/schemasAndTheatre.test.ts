import { describe, expect, it } from "vitest";
import { asMemberId, asRoomId, asTemplateId } from "@digitable/contracts";
import { EAT_THE_REICH_MANIFEST } from "../src/manifest.js";
import { eatTheReichTemplate } from "../src/engine.js";
import { PLAYER_MEMBER_ID, ROOK_ID, freshState, stateWithClaim } from "./fixtures.js";

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

  it("parseState round-trips a claimed character with marked injuries", () => {
    const state = stateWithClaim(ROOK_ID, PLAYER_MEMBER_ID, { blood: 7 });
    const character = state.characters[ROOK_ID];
    if (!character) throw new Error("fixture missing rook");
    const withInjury = {
      ...state,
      characters: {
        ...state.characters,
        [ROOK_ID]: {
          ...character,
          injuries: character.injuries.map((c, i) =>
            i === 0 ? { ...c, boxes: [{ marked: true }, c.boxes[1]] as typeof c.boxes } : c,
          ),
        },
      },
    };
    expect(eatTheReichTemplate.schemas.parseState(JSON.parse(JSON.stringify(withInjury)))).toEqual(
      withInjury,
    );
  });

  it("parseCommand rejects an unknown command type", () => {
    expect(() => eatTheReichTemplate.schemas.parseCommand({ type: "NotACommand" })).toThrow();
  });

  it("parseCommand round-trips a ClaimCharacter command", () => {
    const command = { type: "ClaimCharacter", characterId: ROOK_ID };
    expect(eatTheReichTemplate.schemas.parseCommand(command)).toEqual(command);
  });

  it("parseCommand round-trips a HealInjury command", () => {
    const command = {
      type: "HealInjury",
      characterId: ROOK_ID,
      categoryId: "rook-papers-burned",
      boxIndex: 0,
    };
    expect(eatTheReichTemplate.schemas.parseCommand(command)).toEqual(command);
  });

  it("parseEvent rejects a known event type with malformed fields", () => {
    expect(() =>
      eatTheReichTemplate.schemas.parseEvent({ type: "CharacterClaimed", characterId: ROOK_ID }),
    ).toThrow();
  });

  it("parseView rejects malformed nested projection fields", () => {
    const view = eatTheReichTemplate.project(freshState(), {
      roomId: asRoomId("room-1"),
      viewerId: PLAYER_MEMBER_ID,
      capability: "player",
    });
    expect(() =>
      eatTheReichTemplate.schemas.parseView({ ...view, roster: [{ name: 42 }] }),
    ).toThrow();
  });
});

describe("migrate", () => {
  it("accepts the current schema version for this template", () => {
    const state = freshState();
    const result = eatTheReichTemplate.migrate({
      platformVersion: "0.0.0",
      templateId: EAT_THE_REICH_MANIFEST.templateId,
      templateVersion: EAT_THE_REICH_MANIFEST.templateVersion,
      schemaVersion: 4,
      state: JSON.parse(JSON.stringify(state)),
    });
    expect(result.ok).toBe(true);
  });

  it("refuses the old schemaVersion 1 shape rather than guessing a migration (fresh start, docs/ETR_RULES_IMPLEMENTATION_PLAN.md §1)", () => {
    const result = eatTheReichTemplate.migrate({
      platformVersion: "0.0.0",
      templateId: EAT_THE_REICH_MANIFEST.templateId,
      templateVersion: "0.1.0",
      schemaVersion: 1,
      state: {},
    });
    expect(result.ok).toBe(false);
  });

  it("refuses the B02 schemaVersion 2 shape too (B03 reshaped state again, same fresh-start rationale)", () => {
    const result = eatTheReichTemplate.migrate({
      platformVersion: "0.0.0",
      templateId: EAT_THE_REICH_MANIFEST.templateId,
      templateVersion: "0.2.0",
      schemaVersion: 2,
      state: {},
    });
    expect(result.ok).toBe(false);
  });

  it("refuses the B03 schemaVersion 3 shape too (B04 reshaped state again, same fresh-start rationale)", () => {
    const result = eatTheReichTemplate.migrate({
      platformVersion: "0.0.0",
      templateId: EAT_THE_REICH_MANIFEST.templateId,
      templateVersion: "0.3.0",
      schemaVersion: 3,
      state: {},
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a record from a different template", () => {
    const result = eatTheReichTemplate.migrate({
      platformVersion: "0.0.0",
      templateId: asTemplateId("some-other-template"),
      templateVersion: "0.0.0",
      schemaVersion: 4,
      state: {},
    });
    expect(result.ok).toBe(false);
  });
});

describe("theatre", () => {
  it("shortens the duration hint and drops decorative cues under reduced motion", () => {
    const event = {
      type: "CharacterClaimed" as const,
      characterId: ROOK_ID,
      memberId: asMemberId("member-rook"),
    };
    const full = eatTheReichTemplate.theatre(event, { reducedMotion: false });
    const reduced = eatTheReichTemplate.theatre(event, { reducedMotion: true });
    expect(full?.durationHintMs).toBeGreaterThan(0);
    expect(reduced?.durationHintMs).toBe(0);
    expect(reduced?.fallback.announcement).toBe(full?.fallback.announcement);
  });

  it("returns a scene for every event type", () => {
    expect(
      eatTheReichTemplate.theatre(
        { type: "CharacterReleased", characterId: ROOK_ID, memberId: asMemberId("member-rook") },
        { reducedMotion: false },
      ),
    ).not.toBeNull();
    expect(
      eatTheReichTemplate.theatre(
        {
          type: "InjuryHealed",
          characterId: ROOK_ID,
          categoryId: "rook-papers-burned",
          boxIndex: 0,
          bloodSpent: 3,
        },
        { reducedMotion: false },
      ),
    ).not.toBeNull();
  });
});
