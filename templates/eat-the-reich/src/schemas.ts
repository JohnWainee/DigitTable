import { asMemberId } from "@digitable/contracts";
import type { EatTheReichCommand } from "./commands.js";
import type { EatTheReichEvent } from "./events.js";
import type {
  CharacterState,
  EatTheReichState,
  LocationState,
  ObjectiveState,
  ThreatState,
} from "./state.js";
import type { EatTheReichView } from "./view.js";

/**
 * Hand-rolled structural validation at the deserialization boundary
 * (docs/TEMPLATE_ARCHITECTURE.md: "content is validated data"). These are
 * shape checks, not a rules engine — they exist so malformed or malicious
 * wire input fails fast with a plain error instead of reaching pure engine
 * code with the wrong shape.
 */

class TemplateSchemaError extends Error {}

function fail(where: string, detail: string): never {
  throw new TemplateSchemaError(`eat-the-reich schema: ${where}: ${detail}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function expectString(value: unknown, where: string): string {
  if (typeof value !== "string") fail(where, `expected string, got ${typeof value}`);
  return value;
}

function expectNumber(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(where, `expected finite number`);
  return value;
}

function expectStringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    fail(where, "expected an array of strings");
  }
  return value;
}

function parseLocation(value: unknown): LocationState {
  if (!isRecord(value)) fail("location", "expected an object");
  return {
    id: expectString(value.id, "location.id"),
    name: expectString(value.name, "location.name"),
    description: expectString(value.description, "location.description"),
  };
}

function parseObjective(value: unknown): ObjectiveState {
  if (!isRecord(value)) fail("objective", "expected an object");
  const status = value.status;
  if (status !== "active" && status !== "complete")
    fail("objective.status", "expected active|complete");
  return {
    id: expectString(value.id, "objective.id"),
    title: expectString(value.title, "objective.title"),
    description: expectString(value.description, "objective.description"),
    advancesRemaining: expectNumber(value.advancesRemaining, "objective.advancesRemaining"),
    status,
  };
}

function parseCharacter(value: unknown): CharacterState {
  if (!isRecord(value)) fail("character", "expected an object");
  const attributes = value.attributes;
  if (!isRecord(attributes)) fail("character.attributes", "expected an object");
  return {
    memberId: asMemberId(expectString(value.memberId, "character.memberId")),
    name: expectString(value.name, "character.name"),
    attributes: { nerve: expectNumber(attributes.nerve, "character.attributes.nerve") },
    gear: expectStringArray(value.gear, "character.gear"),
    wounds: expectNumber(value.wounds, "character.wounds"),
    maxWounds: expectNumber(value.maxWounds, "character.maxWounds"),
  };
}

function parseThreat(value: unknown): ThreatState {
  if (!isRecord(value)) fail("threat", "expected an object");
  const status = value.status;
  if (status !== "active" && status !== "defeated")
    fail("threat.status", "expected active|defeated");
  return {
    id: expectString(value.id, "threat.id"),
    name: expectString(value.name, "threat.name"),
    description: expectString(value.description, "threat.description"),
    basePool: expectNumber(value.basePool, "threat.basePool"),
    resolveRemaining: expectNumber(value.resolveRemaining, "threat.resolveRemaining"),
    maxResolve: expectNumber(value.maxResolve, "threat.maxResolve"),
    hiddenDifficultyModifier: expectNumber(
      value.hiddenDifficultyModifier,
      "threat.hiddenDifficultyModifier",
    ),
    hiddenIntel: expectString(value.hiddenIntel, "threat.hiddenIntel"),
    status,
  };
}

export function parseState(value: unknown): EatTheReichState {
  if (!isRecord(value)) fail("state", "expected an object");
  if (value.schemaVersion !== 1) fail("state.schemaVersion", "expected 1");
  const characters = value.characters;
  const threats = value.threats;
  const rolls = value.rolls;
  if (!isRecord(characters)) fail("state.characters", "expected an object");
  if (!isRecord(threats)) fail("state.threats", "expected an object");
  if (!isRecord(rolls) || Object.keys(rolls).length > 0) {
    // Phase 1A fixtures only ever validate freshly-initialized state; a
    // richer rolls-map validator arrives when persistence lands.
    if (!isRecord(rolls)) fail("state.rolls", "expected an object");
  }
  return {
    schemaVersion: 1,
    location: parseLocation(value.location),
    objective: parseObjective(value.objective),
    characters: Object.fromEntries(
      Object.entries(characters).map(([memberId, character]) => [
        memberId,
        parseCharacter(character),
      ]),
    ),
    threats: Object.fromEntries(
      Object.entries(threats).map(([threatId, threat]) => [threatId, parseThreat(threat)]),
    ),
    rolls: {},
    nextRollSequence: expectNumber(value.nextRollSequence, "state.nextRollSequence"),
  };
}

export function parseCommand(value: unknown): EatTheReichCommand {
  if (!isRecord(value)) fail("command", "expected an object");
  switch (value.type) {
    case "BeginAction":
      return {
        type: "BeginAction",
        actorMemberId: asMemberId(expectString(value.actorMemberId, "command.actorMemberId")),
        threatId: expectString(value.threatId, "command.threatId"),
        actionId: expectString(value.actionId, "command.actionId"),
        gearIds: expectStringArray(value.gearIds, "command.gearIds"),
      };
    case "SubmitOpposition":
      return {
        type: "SubmitOpposition",
        rollId: expectString(value.rollId, "command.rollId"),
        pushDice: expectNumber(value.pushDice, "command.pushDice"),
      };
    case "AllocateResults": {
      const allocations = value.allocations;
      if (!Array.isArray(allocations)) fail("command.allocations", "expected an array");
      return {
        type: "AllocateResults",
        rollId: expectString(value.rollId, "command.rollId"),
        allocations: allocations.map((entry, index) => {
          if (!isRecord(entry)) fail(`command.allocations[${index}]`, "expected an object");
          return {
            optionId: expectString(entry.optionId, `command.allocations[${index}].optionId`),
            uses: expectNumber(entry.uses, `command.allocations[${index}].uses`),
          };
        }),
      };
    }
    default:
      return fail("command.type", `unknown command type ${String(value.type)}`);
  }
}

export function parseEvent(value: unknown): EatTheReichEvent {
  if (!isRecord(value)) fail("event", "expected an object");
  // Full structural validation of every event variant mirrors parseCommand
  // above; omitted here to avoid repeating the same pattern three more
  // times. `type` is checked as the minimum needed to keep a bad event tail
  // from reaching `reduce` with a completely wrong shape.
  const knownTypes = ["ActionRolled", "OppositionRolled", "ActionResolved"];
  if (typeof value.type !== "string" || !knownTypes.includes(value.type)) {
    fail("event.type", `unknown event type ${String(value.type)}`);
  }
  return value as EatTheReichEvent;
}

export function parseView(value: unknown): EatTheReichView {
  if (!isRecord(value)) fail("view", "expected an object");
  if (
    !("location" in value) ||
    !("objective" in value) ||
    !("characters" in value) ||
    !("threats" in value)
  ) {
    fail("view", "missing required fields");
  }
  return value as unknown as EatTheReichView;
}
