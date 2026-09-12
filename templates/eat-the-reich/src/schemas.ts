import { asMemberId } from "@digitable/contracts";
import type { EatTheReichCommand } from "./commands.js";
import type { EatTheReichEvent } from "./events.js";
import type {
  CharacterState,
  EatTheReichState,
  LocationState,
  ObjectiveState,
  RollAllocation,
  RollState,
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

function expectBoolean(value: unknown, where: string): boolean {
  if (typeof value !== "boolean") fail(where, `expected boolean, got ${typeof value}`);
  return value;
}

function expectNumberArray(value: unknown, where: string): number[] {
  if (!Array.isArray(value)) fail(where, "expected an array of finite numbers");
  return value.map((item, index) => expectNumber(item, `${where}[${index}]`));
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

function parseAllocation(value: unknown, where: string): RollAllocation {
  if (!isRecord(value)) fail(where, "expected an object");
  return {
    optionId: expectString(value.optionId, `${where}.optionId`),
    uses: expectNumber(value.uses, `${where}.uses`),
  };
}

function parseRoll(value: unknown, where: string): RollState {
  if (!isRecord(value)) fail(where, "expected an object");
  const status = value.status;
  if (
    status !== "awaiting_opposition" &&
    status !== "awaiting_allocation" &&
    status !== "resolved"
  ) {
    fail(`${where}.status`, "expected awaiting_opposition|awaiting_allocation|resolved");
  }
  const poolComponents = value.poolComponents;
  if (!isRecord(poolComponents)) fail(`${where}.poolComponents`, "expected an object");
  const allocations = value.allocations;
  if (allocations !== undefined && !Array.isArray(allocations)) {
    fail(`${where}.allocations`, "expected an array");
  }
  return {
    id: expectString(value.id, `${where}.id`),
    actorMemberId: asMemberId(expectString(value.actorMemberId, `${where}.actorMemberId`)),
    threatId: expectString(value.threatId, `${where}.threatId`),
    actionId: expectString(value.actionId, `${where}.actionId`),
    status,
    playerFaces: expectNumberArray(value.playerFaces, `${where}.playerFaces`),
    playerHits: expectNumber(value.playerHits, `${where}.playerHits`),
    poolComponents: {
      nerve: expectNumber(poolComponents.nerve, `${where}.poolComponents.nerve`),
      gear: expectNumber(poolComponents.gear, `${where}.poolComponents.gear`),
      hiddenModifier: expectNumber(
        poolComponents.hiddenModifier,
        `${where}.poolComponents.hiddenModifier`,
      ),
    },
    hiddenAdjustmentApplied: expectBoolean(
      value.hiddenAdjustmentApplied,
      `${where}.hiddenAdjustmentApplied`,
    ),
    ...(value.pushDice === undefined
      ? {}
      : { pushDice: expectNumber(value.pushDice, `${where}.pushDice`) }),
    ...(value.oppositionFaces === undefined
      ? {}
      : { oppositionFaces: expectNumberArray(value.oppositionFaces, `${where}.oppositionFaces`) }),
    ...(value.oppositionHits === undefined
      ? {}
      : { oppositionHits: expectNumber(value.oppositionHits, `${where}.oppositionHits`) }),
    ...(value.netSuccesses === undefined
      ? {}
      : { netSuccesses: expectNumber(value.netSuccesses, `${where}.netSuccesses`) }),
    ...(allocations === undefined
      ? {}
      : {
          allocations: allocations.map((entry, index) =>
            parseAllocation(entry, `${where}.allocations[${index}]`),
          ),
        }),
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
  if (!isRecord(rolls)) fail("state.rolls", "expected an object");
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
    rolls: Object.fromEntries(
      Object.entries(rolls).map(([rollId, roll]) => [
        rollId,
        parseRoll(roll, `state.rolls.${rollId}`),
      ]),
    ),
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
          return parseAllocation(entry, `command.allocations[${index}]`);
        }),
      };
    }
    default:
      return fail("command.type", `unknown command type ${String(value.type)}`);
  }
}

export function parseEvent(value: unknown): EatTheReichEvent {
  if (!isRecord(value)) fail("event", "expected an object");
  switch (value.type) {
    case "ActionRolled": {
      const components = value.poolComponents;
      if (!isRecord(components)) fail("event.poolComponents", "expected an object");
      const faces = value.faces;
      const hiddenModifier = components.hiddenModifier;
      return {
        type: "ActionRolled",
        rollId: expectString(value.rollId, "event.rollId"),
        actorMemberId: asMemberId(expectString(value.actorMemberId, "event.actorMemberId")),
        threatId: expectString(value.threatId, "event.threatId"),
        actionId: expectString(value.actionId, "event.actionId"),
        faces: faces === null ? null : expectNumberArray(faces, "event.faces"),
        hits: expectNumber(value.hits, "event.hits"),
        poolComponents: {
          nerve: expectNumber(components.nerve, "event.poolComponents.nerve"),
          gear: expectNumber(components.gear, "event.poolComponents.gear"),
          hiddenModifier:
            hiddenModifier === null
              ? null
              : expectNumber(hiddenModifier, "event.poolComponents.hiddenModifier"),
        },
        hiddenAdjustmentApplied: expectBoolean(
          value.hiddenAdjustmentApplied,
          "event.hiddenAdjustmentApplied",
        ),
      };
    }
    case "OppositionRolled":
      return {
        type: "OppositionRolled",
        rollId: expectString(value.rollId, "event.rollId"),
        threatId: expectString(value.threatId, "event.threatId"),
        pushDice: expectNumber(value.pushDice, "event.pushDice"),
        faces: expectNumberArray(value.faces, "event.faces"),
        hits: expectNumber(value.hits, "event.hits"),
        netSuccesses: expectNumber(value.netSuccesses, "event.netSuccesses"),
      };
    case "ActionResolved": {
      if (!Array.isArray(value.allocations)) fail("event.allocations", "expected an array");
      if (value.threatStatus !== "active" && value.threatStatus !== "defeated") {
        fail("event.threatStatus", "expected active|defeated");
      }
      if (value.objectiveStatus !== "active" && value.objectiveStatus !== "complete") {
        fail("event.objectiveStatus", "expected active|complete");
      }
      return {
        type: "ActionResolved",
        rollId: expectString(value.rollId, "event.rollId"),
        allocations: value.allocations.map((entry, index) =>
          parseAllocation(entry, `event.allocations[${index}]`),
        ),
        threatId: expectString(value.threatId, "event.threatId"),
        threatResolveRemaining: expectNumber(
          value.threatResolveRemaining,
          "event.threatResolveRemaining",
        ),
        threatStatus: value.threatStatus,
        objectiveAdvancesRemaining: expectNumber(
          value.objectiveAdvancesRemaining,
          "event.objectiveAdvancesRemaining",
        ),
        objectiveStatus: value.objectiveStatus,
      };
    }
    default:
      return fail("event.type", `unknown event type ${String(value.type)}`);
  }
}

export function parseView(value: unknown): EatTheReichView {
  if (!isRecord(value)) fail("view", "expected an object");
  if (!Array.isArray(value.characters)) fail("view.characters", "expected an array");
  if (!Array.isArray(value.threats)) fail("view.threats", "expected an array");
  const characters = value.characters.map((entry, index) => {
    if (!isRecord(entry)) fail(`view.characters[${index}]`, "expected an object");
    return {
      memberId: expectString(entry.memberId, `view.characters[${index}].memberId`),
      name: expectString(entry.name, `view.characters[${index}].name`),
      wounds: expectNumber(entry.wounds, `view.characters[${index}].wounds`),
      maxWounds: expectNumber(entry.maxWounds, `view.characters[${index}].maxWounds`),
    };
  });
  const threats: Array<EatTheReichView["threats"][number]> = value.threats.map((entry, index) => {
    if (!isRecord(entry)) fail(`view.threats[${index}]`, "expected an object");
    if (entry.status !== "active" && entry.status !== "defeated") {
      fail(`view.threats[${index}].status`, "expected active|defeated");
    }
    const status: "active" | "defeated" = entry.status;
    const base = {
      id: expectString(entry.id, `view.threats[${index}].id`),
      name: expectString(entry.name, `view.threats[${index}].name`),
      description: expectString(entry.description, `view.threats[${index}].description`),
      resolveRemaining: expectNumber(
        entry.resolveRemaining,
        `view.threats[${index}].resolveRemaining`,
      ),
      maxResolve: expectNumber(entry.maxResolve, `view.threats[${index}].maxResolve`),
      status,
    };
    return "hiddenDifficultyModifier" in entry || "hiddenIntel" in entry
      ? {
          ...base,
          hiddenDifficultyModifier: expectNumber(
            entry.hiddenDifficultyModifier,
            `view.threats[${index}].hiddenDifficultyModifier`,
          ),
          hiddenIntel: expectString(entry.hiddenIntel, `view.threats[${index}].hiddenIntel`),
        }
      : base;
  });
  const self = value.self;
  let parsedSelf: EatTheReichView["self"] = null;
  if (self !== null) {
    if (!isRecord(self)) fail("view.self", "expected an object or null");
    const attributes = self.attributes;
    if (!isRecord(attributes)) fail("view.self.attributes", "expected an object");
    parsedSelf = {
      memberId: expectString(self.memberId, "view.self.memberId"),
      name: expectString(self.name, "view.self.name"),
      wounds: expectNumber(self.wounds, "view.self.wounds"),
      maxWounds: expectNumber(self.maxWounds, "view.self.maxWounds"),
      attributes: { nerve: expectNumber(attributes.nerve, "view.self.attributes.nerve") },
      gear: expectStringArray(self.gear, "view.self.gear"),
    };
  }
  const activeRoll = value.activeRoll;
  let parsedActiveRoll: EatTheReichView["activeRoll"] = null;
  if (activeRoll !== null) {
    if (!isRecord(activeRoll)) fail("view.activeRoll", "expected an object or null");
    const status = activeRoll.status;
    if (
      status !== "awaiting_opposition" &&
      status !== "awaiting_allocation" &&
      status !== "resolved"
    ) {
      fail("view.activeRoll.status", "invalid roll status");
    }
    const playerFaces = activeRoll.playerFaces;
    parsedActiveRoll = {
      rollId: expectString(activeRoll.rollId, "view.activeRoll.rollId"),
      actorMemberId: expectString(activeRoll.actorMemberId, "view.activeRoll.actorMemberId"),
      threatId: expectString(activeRoll.threatId, "view.activeRoll.threatId"),
      actionId: expectString(activeRoll.actionId, "view.activeRoll.actionId"),
      status,
      playerFaces:
        playerFaces === null ? null : expectNumberArray(playerFaces, "view.activeRoll.playerFaces"),
      playerHits: expectNumber(activeRoll.playerHits, "view.activeRoll.playerHits"),
      hiddenAdjustmentApplied: expectBoolean(
        activeRoll.hiddenAdjustmentApplied,
        "view.activeRoll.hiddenAdjustmentApplied",
      ),
      ...(activeRoll.hiddenDifficultyModifier === undefined
        ? {}
        : {
            hiddenDifficultyModifier: expectNumber(
              activeRoll.hiddenDifficultyModifier,
              "view.activeRoll.hiddenDifficultyModifier",
            ),
          }),
      ...(activeRoll.pushDice === undefined
        ? {}
        : { pushDice: expectNumber(activeRoll.pushDice, "view.activeRoll.pushDice") }),
      ...(activeRoll.oppositionFaces === undefined
        ? {}
        : {
            oppositionFaces: expectNumberArray(
              activeRoll.oppositionFaces,
              "view.activeRoll.oppositionFaces",
            ),
          }),
      ...(activeRoll.oppositionHits === undefined
        ? {}
        : {
            oppositionHits: expectNumber(
              activeRoll.oppositionHits,
              "view.activeRoll.oppositionHits",
            ),
          }),
      ...(activeRoll.netSuccesses === undefined
        ? {}
        : { netSuccesses: expectNumber(activeRoll.netSuccesses, "view.activeRoll.netSuccesses") }),
      ...(activeRoll.allocations === undefined
        ? {}
        : {
            allocations: Array.isArray(activeRoll.allocations)
              ? activeRoll.allocations.map((entry, index) =>
                  parseAllocation(entry, `view.activeRoll.allocations[${index}]`),
                )
              : fail("view.activeRoll.allocations", "expected an array"),
          }),
    };
  }
  return {
    location: parseLocation(value.location),
    objective: parseObjective(value.objective),
    self: parsedSelf,
    characters,
    threats,
    activeRoll: parsedActiveRoll,
  };
}
