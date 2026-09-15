import { asMemberId } from "@digitable/contracts";
import type { EatTheReichCommand } from "./commands.js";
import type { EatTheReichEvent } from "./events.js";
import type {
  AbilityEffect,
  AbilityState,
  AbilityTrigger,
  AdvanceState,
  CharacterState,
  EatTheReichState,
  InjuryBox,
  InjuryCategoryState,
  InjuryPenaltyTag,
  ItemState,
  LastStandState,
  Stat,
} from "./state.js";
import { STATS } from "./state.js";
import type { CharacterFullSheet, CharacterPartySummary, EatTheReichView } from "./view.js";

/**
 * Hand-rolled structural validation at the deserialization boundary
 * (docs/TEMPLATE_ARCHITECTURE.md: "content is validated data"). Shape
 * checks, not a rules engine.
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

function expectStatRecord(value: unknown, where: string): Readonly<Record<Stat, number>> {
  if (!isRecord(value)) fail(where, "expected an object");
  const out: Partial<Record<Stat, number>> = {};
  for (const stat of STATS) {
    out[stat] = expectNumber(value[stat], `${where}.${stat}`);
  }
  return out as Readonly<Record<Stat, number>>;
}

function parseItem(value: unknown, where: string): ItemState {
  if (!isRecord(value)) fail(where, "expected an object");
  return {
    id: expectString(value.id, `${where}.id`),
    name: expectString(value.name, `${where}.name`),
    bonusRequirement: expectString(value.bonusRequirement, `${where}.bonusRequirement`),
    bonusPlus: expectNumber(value.bonusPlus, `${where}.bonusPlus`),
    maxUses: expectNumber(value.maxUses, `${where}.maxUses`),
    usesRemaining: expectNumber(value.usesRemaining, `${where}.usesRemaining`),
  };
}

const ABILITY_TRIGGERS: readonly AbilityTrigger[] = ["special", "blood", "other", "passive"];
const ABILITY_EFFECT_KINDS = [
  "none",
  "reduceThreatAttack",
  "reduceRating",
  "gainBlood",
  "clearInjury",
  "removeAttackSuccesses",
  "damageElite",
  "restoreItemUse",
  "onOnesGainBlood",
  "onOnesRemoveAttack",
  "text",
] as const;

function parseAbilityEffect(value: unknown, where: string): AbilityEffect {
  if (!isRecord(value)) fail(where, "expected an object");
  const kind = value.kind;
  if (typeof kind !== "string" || !(ABILITY_EFFECT_KINDS as readonly string[]).includes(kind)) {
    fail(`${where}.kind`, `expected one of ${ABILITY_EFFECT_KINDS.join(", ")}`);
  }
  switch (kind as (typeof ABILITY_EFFECT_KINDS)[number]) {
    case "none":
      return { kind: "none" };
    case "reduceThreatAttack":
      return { kind: "reduceThreatAttack", amount: expectNumber(value.amount, `${where}.amount`) };
    case "reduceRating":
      return { kind: "reduceRating", amount: expectNumber(value.amount, `${where}.amount`) };
    case "gainBlood":
      return { kind: "gainBlood", amount: expectNumber(value.amount, `${where}.amount`) };
    case "clearInjury":
      return { kind: "clearInjury", count: expectNumber(value.count, `${where}.count`) };
    case "removeAttackSuccesses":
      return {
        kind: "removeAttackSuccesses",
        amount: expectNumber(value.amount, `${where}.amount`),
      };
    case "damageElite":
      return { kind: "damageElite", amount: expectNumber(value.amount, `${where}.amount`) };
    case "restoreItemUse":
      return {
        kind: "restoreItemUse",
        itemId: expectString(value.itemId, `${where}.itemId`),
        amount: expectNumber(value.amount, `${where}.amount`),
      };
    case "onOnesGainBlood":
      return { kind: "onOnesGainBlood", amount: expectNumber(value.amount, `${where}.amount`) };
    case "onOnesRemoveAttack":
      return { kind: "onOnesRemoveAttack", amount: expectNumber(value.amount, `${where}.amount`) };
    case "text":
      return { kind: "text", description: expectString(value.description, `${where}.description`) };
  }
}

function parseAbility(value: unknown, where: string): AbilityState {
  if (!isRecord(value)) fail(where, "expected an object");
  const trigger = value.trigger;
  if (typeof trigger !== "string" || !(ABILITY_TRIGGERS as readonly string[]).includes(trigger)) {
    fail(`${where}.trigger`, `expected one of ${ABILITY_TRIGGERS.join(", ")}`);
  }
  return {
    id: expectString(value.id, `${where}.id`),
    name: expectString(value.name, `${where}.name`),
    trigger: trigger as AbilityTrigger,
    ...(value.bloodCost === undefined
      ? {}
      : { bloodCost: expectNumber(value.bloodCost, `${where}.bloodCost`) }),
    effect: parseAbilityEffect(value.effect, `${where}.effect`),
  };
}

const INJURY_PENALTY_KINDS = [
  "noBonusDice",
  "noSpecials",
  "oneItemPerTurn",
  "statDelta",
  "allStatsDelta",
  "noBloodSpend",
  "noBloodGain",
  "bloodUpkeep",
] as const;

function parseInjuryPenaltyTag(value: unknown, where: string): InjuryPenaltyTag {
  if (!isRecord(value)) fail(where, "expected an object");
  const kind = value.kind;
  if (typeof kind !== "string" || !(INJURY_PENALTY_KINDS as readonly string[]).includes(kind)) {
    fail(`${where}.kind`, `expected one of ${INJURY_PENALTY_KINDS.join(", ")}`);
  }
  switch (kind as (typeof INJURY_PENALTY_KINDS)[number]) {
    case "noBonusDice":
      return { kind: "noBonusDice" };
    case "noSpecials":
      return { kind: "noSpecials" };
    case "oneItemPerTurn":
      return { kind: "oneItemPerTurn" };
    case "statDelta": {
      const deltas = value.deltas;
      if (!isRecord(deltas)) fail(`${where}.deltas`, "expected an object");
      const parsed: Partial<Record<Stat, number>> = {};
      for (const [key, delta] of Object.entries(deltas)) {
        if (!(STATS as readonly string[]).includes(key)) {
          fail(`${where}.deltas.${key}`, "unknown stat");
        }
        parsed[key as Stat] = expectNumber(delta, `${where}.deltas.${key}`);
      }
      return { kind: "statDelta", deltas: parsed };
    }
    case "allStatsDelta":
      return { kind: "allStatsDelta", amount: expectNumber(value.amount, `${where}.amount`) };
    case "noBloodSpend":
      return { kind: "noBloodSpend" };
    case "noBloodGain":
      return { kind: "noBloodGain" };
    case "bloodUpkeep":
      return { kind: "bloodUpkeep", amount: expectNumber(value.amount, `${where}.amount`) };
  }
}

function parseInjuryBox(value: unknown, where: string): InjuryBox {
  if (!isRecord(value)) fail(where, "expected an object");
  return {
    marked: expectBoolean(value.marked, `${where}.marked`),
    ...(value.penalty === undefined
      ? {}
      : { penalty: parseInjuryPenaltyTag(value.penalty, `${where}.penalty`) }),
  };
}

function parseInjuryCategory(value: unknown, where: string): InjuryCategoryState {
  if (!isRecord(value)) fail(where, "expected an object");
  const boxes = value.boxes;
  if (!Array.isArray(boxes) || boxes.length !== 2) {
    fail(`${where}.boxes`, "expected exactly two boxes");
  }
  return {
    id: expectString(value.id, `${where}.id`),
    label: expectString(value.label, `${where}.label`),
    boxes: [
      parseInjuryBox(boxes[0], `${where}.boxes[0]`),
      parseInjuryBox(boxes[1], `${where}.boxes[1]`),
    ],
  };
}

function parseAdvance(value: unknown, where: string): AdvanceState {
  if (!isRecord(value)) fail(where, "expected an object");
  return {
    id: expectString(value.id, `${where}.id`),
    label: expectString(value.label, `${where}.label`),
    unlocked: expectBoolean(value.unlocked, `${where}.unlocked`),
  };
}

function parseLastStand(value: unknown, where: string): LastStandState {
  if (!isRecord(value)) fail(where, "expected an object");
  return {
    label: expectString(value.label, `${where}.label`),
    diceCount: expectNumber(value.diceCount, `${where}.diceCount`),
  };
}

function parseCharacter(value: unknown, where: string): CharacterState {
  if (!isRecord(value)) fail(where, "expected an object");
  const items = value.items;
  const abilities = value.abilities;
  const advances = value.advances;
  const injuries = value.injuries;
  if (!Array.isArray(items)) fail(`${where}.items`, "expected an array");
  if (!Array.isArray(abilities)) fail(`${where}.abilities`, "expected an array");
  if (!Array.isArray(advances)) fail(`${where}.advances`, "expected an array");
  if (!Array.isArray(injuries)) fail(`${where}.injuries`, "expected an array");
  const claimedByMemberId = value.claimedByMemberId;
  if (claimedByMemberId !== null && typeof claimedByMemberId !== "string") {
    fail(`${where}.claimedByMemberId`, "expected string or null");
  }
  const activeLootId = value.activeLootId;
  if (activeLootId !== null && typeof activeLootId !== "string") {
    fail(`${where}.activeLootId`, "expected string or null");
  }
  return {
    id: expectString(value.id, `${where}.id`),
    name: expectString(value.name, `${where}.name`),
    concept: expectString(value.concept, `${where}.concept`),
    portraitId: expectString(value.portraitId, `${where}.portraitId`),
    claimedByMemberId: claimedByMemberId === null ? null : asMemberId(claimedByMemberId),
    stats: expectStatRecord(value.stats, `${where}.stats`),
    blood: expectNumber(value.blood, `${where}.blood`),
    items: items.map((item, index) => parseItem(item, `${where}.items[${index}]`)),
    abilities: abilities.map((ability, index) =>
      parseAbility(ability, `${where}.abilities[${index}]`),
    ),
    advances: advances.map((advance, index) =>
      parseAdvance(advance, `${where}.advances[${index}]`),
    ),
    injuries: injuries.map((category, index) =>
      parseInjuryCategory(category, `${where}.injuries[${index}]`),
    ),
    lastStand: parseLastStand(value.lastStand, `${where}.lastStand`),
    downed: expectBoolean(value.downed, `${where}.downed`),
    retired: expectBoolean(value.retired, `${where}.retired`),
    activeLootId,
  };
}

export function parseState(value: unknown): EatTheReichState {
  if (!isRecord(value)) fail("state", "expected an object");
  if (value.schemaVersion !== 2) fail("state.schemaVersion", "expected 2");
  const characters = value.characters;
  if (!isRecord(characters)) fail("state.characters", "expected an object");
  return {
    schemaVersion: 2,
    characters: Object.fromEntries(
      Object.entries(characters).map(([characterId, character]) => [
        characterId,
        parseCharacter(character, `state.characters.${characterId}`),
      ]),
    ),
  };
}

export function parseCommand(value: unknown): EatTheReichCommand {
  if (!isRecord(value)) fail("command", "expected an object");
  switch (value.type) {
    case "ClaimCharacter":
      return {
        type: "ClaimCharacter",
        characterId: expectString(value.characterId, "command.characterId"),
      };
    case "ReleaseCharacter":
      return {
        type: "ReleaseCharacter",
        characterId: expectString(value.characterId, "command.characterId"),
      };
    case "HealInjury": {
      const boxIndex = value.boxIndex;
      if (boxIndex !== 0 && boxIndex !== 1) fail("command.boxIndex", "expected 0 or 1");
      return {
        type: "HealInjury",
        characterId: expectString(value.characterId, "command.characterId"),
        categoryId: expectString(value.categoryId, "command.categoryId"),
        boxIndex,
      };
    }
    default:
      return fail("command.type", `unknown command type ${String(value.type)}`);
  }
}

export function parseEvent(value: unknown): EatTheReichEvent {
  if (!isRecord(value)) fail("event", "expected an object");
  switch (value.type) {
    case "CharacterClaimed":
      return {
        type: "CharacterClaimed",
        characterId: expectString(value.characterId, "event.characterId"),
        memberId: asMemberId(expectString(value.memberId, "event.memberId")),
      };
    case "CharacterReleased":
      return {
        type: "CharacterReleased",
        characterId: expectString(value.characterId, "event.characterId"),
        memberId: asMemberId(expectString(value.memberId, "event.memberId")),
      };
    case "InjuryHealed": {
      const boxIndex = value.boxIndex;
      if (boxIndex !== 0 && boxIndex !== 1) fail("event.boxIndex", "expected 0 or 1");
      return {
        type: "InjuryHealed",
        characterId: expectString(value.characterId, "event.characterId"),
        categoryId: expectString(value.categoryId, "event.categoryId"),
        boxIndex,
        bloodSpent: expectNumber(value.bloodSpent, "event.bloodSpent"),
      };
    }
    default:
      return fail("event.type", `unknown event type ${String(value.type)}`);
  }
}

function parsePartySummary(value: unknown, where: string): CharacterPartySummary {
  if (!isRecord(value)) fail(where, "expected an object");
  const claimedByMemberId = value.claimedByMemberId;
  if (claimedByMemberId !== null && typeof claimedByMemberId !== "string") {
    fail(`${where}.claimedByMemberId`, "expected string or null");
  }
  return {
    id: expectString(value.id, `${where}.id`),
    name: expectString(value.name, `${where}.name`),
    concept: expectString(value.concept, `${where}.concept`),
    portraitId: expectString(value.portraitId, `${where}.portraitId`),
    claimedByMemberId,
    stats: expectStatRecord(value.stats, `${where}.stats`),
    blood: expectNumber(value.blood, `${where}.blood`),
    injuryBoxesMarked: expectNumber(value.injuryBoxesMarked, `${where}.injuryBoxesMarked`),
    downed: expectBoolean(value.downed, `${where}.downed`),
    retired: expectBoolean(value.retired, `${where}.retired`),
  };
}

function parseFullSheet(value: unknown, where: string): CharacterFullSheet {
  const base = parsePartySummary(value, where);
  if (!isRecord(value)) fail(where, "expected an object");
  const items = value.items;
  const abilities = value.abilities;
  const advances = value.advances;
  const injuries = value.injuries;
  if (!Array.isArray(items)) fail(`${where}.items`, "expected an array");
  if (!Array.isArray(abilities)) fail(`${where}.abilities`, "expected an array");
  if (!Array.isArray(advances)) fail(`${where}.advances`, "expected an array");
  if (!Array.isArray(injuries)) fail(`${where}.injuries`, "expected an array");
  const activeLootId = value.activeLootId;
  if (activeLootId !== null && typeof activeLootId !== "string") {
    fail(`${where}.activeLootId`, "expected string or null");
  }
  return {
    ...base,
    items: items.map((item, index) => parseItem(item, `${where}.items[${index}]`)),
    abilities: abilities.map((ability, index) =>
      parseAbility(ability, `${where}.abilities[${index}]`),
    ),
    advances: advances.map((advance, index) =>
      parseAdvance(advance, `${where}.advances[${index}]`),
    ),
    injuries: injuries.map((category, index) =>
      parseInjuryCategory(category, `${where}.injuries[${index}]`),
    ),
    lastStand: parseLastStand(value.lastStand, `${where}.lastStand`),
    activeLootId,
  };
}

export function parseView(value: unknown): EatTheReichView {
  if (!isRecord(value)) fail("view", "expected an object");
  const roster = value.roster;
  const gmSheets = value.gmSheets;
  if (!Array.isArray(roster)) fail("view.roster", "expected an array");
  if (!Array.isArray(gmSheets)) fail("view.gmSheets", "expected an array");
  const self = value.self;
  return {
    self: self === null ? null : parseFullSheet(self, "view.self"),
    roster: roster.map((entry, index) => parsePartySummary(entry, `view.roster[${index}]`)),
    gmSheets: gmSheets.map((entry, index) => parseFullSheet(entry, `view.gmSheets[${index}]`)),
  };
}
