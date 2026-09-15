import { asMemberId } from "@digitable/contracts";
import type { AllocationTarget } from "./allocations.js";
import type { EatTheReichCommand } from "./commands.js";
import type {
  EatTheReichEvent,
  InjuryMarkResult,
  ItemUseRestoreDelta,
  ObjectiveDelta,
  ThreatDelta,
} from "./events.js";
import type {
  AbilityEffect,
  AbilityState,
  AbilityTrigger,
  AdvanceState,
  BonusClaimRecord,
  CharacterState,
  EatTheReichState,
  InjuryBox,
  InjuryCategoryState,
  InjuryChoicePending,
  InjuryPenaltyTag,
  ItemState,
  KeptDie,
  LastStandState,
  ObjectiveState,
  RollRecord,
  RollStatus,
  Stat,
  ThreatFlags,
  ThreatState,
} from "./state.js";
import { STATS } from "./state.js";
import type {
  CharacterFullSheet,
  CharacterPartySummary,
  EatTheReichView,
  ObjectiveView,
  RollView,
  ThreatGmView,
  ThreatPublicView,
} from "./view.js";

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

function expectNullableString(value: unknown, where: string): string | null {
  if (value === null) return null;
  return expectString(value, where);
}

function expectNumber(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) fail(where, `expected finite number`);
  return value;
}

function expectBoolean(value: unknown, where: string): boolean {
  if (typeof value !== "boolean") fail(where, `expected boolean, got ${typeof value}`);
  return value;
}

function expectStringArray(value: unknown, where: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    fail(where, "expected an array of strings");
  }
  return value;
}

function expectNumberArray(value: unknown, where: string): number[] {
  if (!Array.isArray(value)) fail(where, "expected an array of finite numbers");
  return value.map((item, index) => expectNumber(item, `${where}[${index}]`));
}

function expectBoxIndex(value: unknown, where: string): 0 | 1 {
  if (value !== 0 && value !== 1) fail(where, "expected 0 or 1");
  return value;
}

function expectStatOrNone(value: unknown, where: string): Stat | "none" {
  if (value === "none") return "none";
  if (typeof value !== "string" || !(STATS as readonly string[]).includes(value)) {
    fail(where, `expected one of ${STATS.join(", ")} or "none"`);
  }
  return value as Stat;
}

function expectStatRecord(value: unknown, where: string): Readonly<Record<Stat, number>> {
  if (!isRecord(value)) fail(where, "expected an object");
  const out: Partial<Record<Stat, number>> = {};
  for (const stat of STATS) {
    out[stat] = expectNumber(value[stat], `${where}.${stat}`);
  }
  return out as Readonly<Record<Stat, number>>;
}

// --- Character sheet pieces (B02) -------------------------------------------------

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
    ...(value.bonusRequirement === undefined
      ? {}
      : { bonusRequirement: expectString(value.bonusRequirement, `${where}.bonusRequirement`) }),
    ...(value.bonusPlus === undefined
      ? {}
      : { bonusPlus: expectNumber(value.bonusPlus, `${where}.bonusPlus`) }),
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

// --- Objectives / Threats (B03) --------------------------------------------------

const OBJECTIVE_KINDS = ["primary", "secondary", "rescue", "retreat"] as const;

function parseObjective(value: unknown, where: string): ObjectiveState {
  if (!isRecord(value)) fail(where, "expected an object");
  const kind = value.kind;
  if (typeof kind !== "string" || !(OBJECTIVE_KINDS as readonly string[]).includes(kind)) {
    fail(`${where}.kind`, `expected one of ${OBJECTIVE_KINDS.join(", ")}`);
  }
  const status = value.status;
  if (status !== "active" && status !== "complete") {
    fail(`${where}.status`, "expected active|complete");
  }
  return {
    id: expectString(value.id, `${where}.id`),
    title: expectString(value.title, `${where}.title`),
    kind: kind as ObjectiveState["kind"],
    rating: expectNumber(value.rating, `${where}.rating`),
    challenge: expectNumber(value.challenge, `${where}.challenge`),
    status,
  };
}

function parseThreatFlags(value: unknown, where: string): ThreatFlags {
  if (!isRecord(value)) fail(where, "expected an object");
  return {
    ...(value.discardBelow === undefined
      ? {}
      : { discardBelow: expectNumber(value.discardBelow, `${where}.discardBelow`) }),
    ...(value.noFeeding === undefined
      ? {}
      : { noFeeding: expectBoolean(value.noFeeding, `${where}.noFeeding`) }),
    ...(value.attackCritOnSix === undefined
      ? {}
      : { attackCritOnSix: expectBoolean(value.attackCritOnSix, `${where}.attackCritOnSix`) }),
    ...(value.challengeLocked === undefined
      ? {}
      : { challengeLocked: expectBoolean(value.challengeLocked, `${where}.challengeLocked`) }),
    ...(value.injuryMarksWholeCategory === undefined
      ? {}
      : {
          injuryMarksWholeCategory: expectBoolean(
            value.injuryMarksWholeCategory,
            `${where}.injuryMarksWholeCategory`,
          ),
        }),
  };
}

function parseThreat(value: unknown, where: string): ThreatState {
  if (!isRecord(value)) fail(where, "expected an object");
  const status = value.status;
  if (status !== "active" && status !== "beaten" && status !== "removed") {
    fail(`${where}.status`, "expected active|beaten|removed");
  }
  return {
    id: expectString(value.id, `${where}.id`),
    name: expectString(value.name, `${where}.name`),
    rating: expectNumber(value.rating, `${where}.rating`),
    startingAttack: expectNumber(value.startingAttack, `${where}.startingAttack`),
    attack: expectNumber(value.attack, `${where}.attack`),
    challenge: expectNumber(value.challenge, `${where}.challenge`),
    solo: expectBoolean(value.solo, `${where}.solo`),
    elite: expectBoolean(value.elite, `${where}.elite`),
    flags: parseThreatFlags(value.flags, `${where}.flags`),
    status,
    revealed: expectBoolean(value.revealed, `${where}.revealed`),
  };
}

// --- Rolls (B03) -------------------------------------------------------------------

function parseBonusClaimRecord(value: unknown, where: string): BonusClaimRecord {
  if (!isRecord(value)) fail(where, "expected an object");
  return {
    sourceId: expectString(value.sourceId, `${where}.sourceId`),
    approved: expectBoolean(value.approved, `${where}.approved`),
    plus: expectNumber(value.plus, `${where}.plus`),
  };
}

function parseKeptDie(value: unknown, where: string): KeptDie {
  if (!isRecord(value)) fail(where, "expected an object");
  const result = value.result;
  if (result !== "success" && result !== "critical") {
    fail(`${where}.result`, "expected success|critical");
  }
  return {
    faceIndex: expectNumber(value.faceIndex, `${where}.faceIndex`),
    face: expectNumber(value.face, `${where}.face`),
    result,
    points: expectNumber(value.points, `${where}.points`),
  };
}

function parseInjuryChoicePending(value: unknown, where: string): InjuryChoicePending {
  if (!isRecord(value)) fail(where, "expected an object");
  const mode = value.mode;
  if (mode !== "single" && mode !== "downed") fail(`${where}.mode`, "expected single|downed");
  return { mode };
}

const ROLL_STATUSES: readonly RollStatus[] = [
  "declared",
  "awaiting_allocation",
  "awaiting_injury_choice",
  "resolved",
];

function parseRoll(value: unknown, where: string): RollRecord {
  if (!isRecord(value)) fail(where, "expected an object");
  const status = value.status;
  if (typeof status !== "string" || !(ROLL_STATUSES as readonly string[]).includes(status)) {
    fail(`${where}.status`, `expected one of ${ROLL_STATUSES.join(", ")}`);
  }
  const approvedBonusClaims = value.approvedBonusClaims;
  const engagedThreatIds = value.engagedThreatIds;
  const playerFaces = value.playerFaces;
  const keptDice = value.keptDice;
  const attackFaces = value.attackFaces;
  return {
    id: expectString(value.id, `${where}.id`),
    characterId: expectString(value.characterId, `${where}.characterId`),
    actorMemberId: asMemberId(expectString(value.actorMemberId, `${where}.actorMemberId`)),
    status: status as RollStatus,
    declaredStat: expectStatOrNone(value.declaredStat, `${where}.declaredStat`),
    declaredItemIds: expectStringArray(value.declaredItemIds, `${where}.declaredItemIds`),
    declaredAbilityIds: expectStringArray(value.declaredAbilityIds, `${where}.declaredAbilityIds`),
    declaredBonusClaimIds: expectStringArray(
      value.declaredBonusClaimIds,
      `${where}.declaredBonusClaimIds`,
    ),
    declaredEngagedThreatIds: expectStringArray(
      value.declaredEngagedThreatIds,
      `${where}.declaredEngagedThreatIds`,
    ),
    note: expectNullableString(value.note, `${where}.note`),
    ...(approvedBonusClaims === undefined
      ? {}
      : {
          approvedBonusClaims: Array.isArray(approvedBonusClaims)
            ? approvedBonusClaims.map((c, i) =>
                parseBonusClaimRecord(c, `${where}.approvedBonusClaims[${i}]`),
              )
            : fail(`${where}.approvedBonusClaims`, "expected an array"),
        }),
    ...(engagedThreatIds === undefined
      ? {}
      : { engagedThreatIds: expectStringArray(engagedThreatIds, `${where}.engagedThreatIds`) }),
    ...(playerFaces === undefined
      ? {}
      : { playerFaces: expectNumberArray(playerFaces, `${where}.playerFaces`) }),
    ...(keptDice === undefined
      ? {}
      : {
          keptDice: Array.isArray(keptDice)
            ? keptDice.map((k, i) => parseKeptDie(k, `${where}.keptDice[${i}]`))
            : fail(`${where}.keptDice`, "expected an array"),
        }),
    ...(value.attackDiceRolled === undefined
      ? {}
      : { attackDiceRolled: expectNumber(value.attackDiceRolled, `${where}.attackDiceRolled`) }),
    ...(attackFaces === undefined
      ? {}
      : { attackFaces: expectNumberArray(attackFaces, `${where}.attackFaces`) }),
    ...(value.attackSuccessesRolled === undefined
      ? {}
      : {
          attackSuccessesRolled: expectNumber(
            value.attackSuccessesRolled,
            `${where}.attackSuccessesRolled`,
          ),
        }),
    ...(value.primaryEngagedThreatId === undefined
      ? {}
      : {
          primaryEngagedThreatId: expectNullableString(
            value.primaryEngagedThreatId,
            `${where}.primaryEngagedThreatId`,
          ),
        }),
    ...(value.remainingAttackSuccessesAfterAllocation === undefined
      ? {}
      : {
          remainingAttackSuccessesAfterAllocation: expectNumber(
            value.remainingAttackSuccessesAfterAllocation,
            `${where}.remainingAttackSuccessesAfterAllocation`,
          ),
        }),
    ...(value.injuryChoicePending === undefined
      ? {}
      : {
          injuryChoicePending: parseInjuryChoicePending(
            value.injuryChoicePending,
            `${where}.injuryChoicePending`,
          ),
        }),
  };
}

// --- Top-level state -----------------------------------------------------------

export function parseState(value: unknown): EatTheReichState {
  if (!isRecord(value)) fail("state", "expected an object");
  if (value.schemaVersion !== 3) fail("state.schemaVersion", "expected 3");
  const characters = value.characters;
  const objectives = value.objectives;
  const threats = value.threats;
  const rolls = value.rolls;
  if (!isRecord(characters)) fail("state.characters", "expected an object");
  if (!isRecord(objectives)) fail("state.objectives", "expected an object");
  if (!isRecord(threats)) fail("state.threats", "expected an object");
  if (!isRecord(rolls)) fail("state.rolls", "expected an object");
  return {
    schemaVersion: 3,
    characters: Object.fromEntries(
      Object.entries(characters).map(([characterId, character]) => [
        characterId,
        parseCharacter(character, `state.characters.${characterId}`),
      ]),
    ),
    objectives: Object.fromEntries(
      Object.entries(objectives).map(([id, objective]) => [
        id,
        parseObjective(objective, `state.objectives.${id}`),
      ]),
    ),
    threats: Object.fromEntries(
      Object.entries(threats).map(([id, threat]) => [
        id,
        parseThreat(threat, `state.threats.${id}`),
      ]),
    ),
    rolls: Object.fromEntries(
      Object.entries(rolls).map(([id, roll]) => [id, parseRoll(roll, `state.rolls.${id}`)]),
    ),
    nextRollSequence: expectNumber(value.nextRollSequence, "state.nextRollSequence"),
  };
}

// --- Commands --------------------------------------------------------------------

function parseAllocationTarget(value: unknown, where: string): AllocationTarget {
  if (!isRecord(value)) fail(where, "expected an object");
  const kind = value.kind;
  switch (kind) {
    case "objective":
      return {
        kind: "objective",
        objectiveId: expectString(value.objectiveId, `${where}.objectiveId`),
      };
    case "threat":
      return { kind: "threat", threatId: expectString(value.threatId, `${where}.threatId`) };
    case "defend":
      return { kind: "defend" };
    case "feed":
      return { kind: "feed" };
    case "special":
      return { kind: "special", abilityId: expectString(value.abilityId, `${where}.abilityId`) };
    default:
      return fail(`${where}.kind`, `unknown allocation target kind ${String(kind)}`);
  }
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
    case "HealInjury":
      return {
        type: "HealInjury",
        characterId: expectString(value.characterId, "command.characterId"),
        categoryId: expectString(value.categoryId, "command.categoryId"),
        boxIndex: expectBoxIndex(value.boxIndex, "command.boxIndex"),
      };
    case "BeginAction":
      return {
        type: "BeginAction",
        characterId: expectString(value.characterId, "command.characterId"),
        stat: expectStatOrNone(value.stat, "command.stat"),
        itemIds: expectStringArray(value.itemIds, "command.itemIds"),
        abilityIds: expectStringArray(value.abilityIds, "command.abilityIds"),
        bonusClaimIds: expectStringArray(value.bonusClaimIds, "command.bonusClaimIds"),
        engagedThreatIds: expectStringArray(value.engagedThreatIds, "command.engagedThreatIds"),
        note: expectNullableString(value.note, "command.note"),
      };
    case "ReviewAction":
      return {
        type: "ReviewAction",
        rollId: expectString(value.rollId, "command.rollId"),
        approvedClaimIds: expectStringArray(value.approvedClaimIds, "command.approvedClaimIds"),
        engagedThreatIds: expectStringArray(value.engagedThreatIds, "command.engagedThreatIds"),
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
            dieFaceIndex: expectNumber(
              entry.dieFaceIndex,
              `command.allocations[${index}].dieFaceIndex`,
            ),
            target: parseAllocationTarget(entry.target, `command.allocations[${index}].target`),
          };
        }),
      };
    }
    case "ChooseInjuryCategory":
      return {
        type: "ChooseInjuryCategory",
        rollId: expectString(value.rollId, "command.rollId"),
        categoryId: expectString(value.categoryId, "command.categoryId"),
      };
    default:
      return fail("command.type", `unknown command type ${String(value.type)}`);
  }
}

// --- Events ----------------------------------------------------------------------

function parseObjectiveDelta(value: unknown, where: string): ObjectiveDelta {
  if (!isRecord(value)) fail(where, "expected an object");
  const status = value.status;
  if (status !== "active" && status !== "complete")
    fail(`${where}.status`, "expected active|complete");
  return {
    objectiveId: expectString(value.objectiveId, `${where}.objectiveId`),
    ratingAfter: expectNumber(value.ratingAfter, `${where}.ratingAfter`),
    status,
  };
}

function parseThreatDelta(value: unknown, where: string): ThreatDelta {
  if (!isRecord(value)) fail(where, "expected an object");
  const status = value.status;
  if (status !== "active" && status !== "beaten" && status !== "removed") {
    fail(`${where}.status`, "expected active|beaten|removed");
  }
  return {
    threatId: expectString(value.threatId, `${where}.threatId`),
    ratingAfter: expectNumber(value.ratingAfter, `${where}.ratingAfter`),
    attackAfter: expectNumber(value.attackAfter, `${where}.attackAfter`),
    status,
  };
}

function parseItemUseRestoreDelta(value: unknown, where: string): ItemUseRestoreDelta {
  if (!isRecord(value)) fail(where, "expected an object");
  return {
    itemId: expectString(value.itemId, `${where}.itemId`),
    amount: expectNumber(value.amount, `${where}.amount`),
  };
}

function parseInjuryMarkResult(value: unknown, where: string): InjuryMarkResult {
  if (!isRecord(value)) fail(where, "expected an object");
  const boxIndexes = value.boxIndexes;
  if (!Array.isArray(boxIndexes)) fail(`${where}.boxIndexes`, "expected an array");
  const rescueObjective = value.rescueObjective;
  return {
    categoryId: expectString(value.categoryId, `${where}.categoryId`),
    boxIndexes: boxIndexes.map((entry, index) =>
      expectBoxIndex(entry, `${where}.boxIndexes[${index}]`),
    ),
    downed: expectBoolean(value.downed, `${where}.downed`),
    rescueObjective:
      rescueObjective === null ? null : parseObjective(rescueObjective, `${where}.rescueObjective`),
  };
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
    case "InjuryHealed":
      return {
        type: "InjuryHealed",
        characterId: expectString(value.characterId, "event.characterId"),
        categoryId: expectString(value.categoryId, "event.categoryId"),
        boxIndex: expectBoxIndex(value.boxIndex, "event.boxIndex"),
        bloodSpent: expectNumber(value.bloodSpent, "event.bloodSpent"),
      };
    case "ActionDeclared":
      return {
        type: "ActionDeclared",
        rollId: expectString(value.rollId, "event.rollId"),
        characterId: expectString(value.characterId, "event.characterId"),
        actorMemberId: asMemberId(expectString(value.actorMemberId, "event.actorMemberId")),
        stat: expectStatOrNone(value.stat, "event.stat"),
        itemIds: expectStringArray(value.itemIds, "event.itemIds"),
        abilityIds: expectStringArray(value.abilityIds, "event.abilityIds"),
        bonusClaimIds: expectStringArray(value.bonusClaimIds, "event.bonusClaimIds"),
        engagedThreatIds: expectStringArray(value.engagedThreatIds, "event.engagedThreatIds"),
        note: expectNullableString(value.note, "event.note"),
      };
    case "ActionRolled": {
      const approvedBonusClaims = value.approvedBonusClaims;
      const keptDice = value.keptDice;
      if (!Array.isArray(approvedBonusClaims))
        fail("event.approvedBonusClaims", "expected an array");
      if (!Array.isArray(keptDice)) fail("event.keptDice", "expected an array");
      return {
        type: "ActionRolled",
        rollId: expectString(value.rollId, "event.rollId"),
        characterId: expectString(value.characterId, "event.characterId"),
        approvedBonusClaims: approvedBonusClaims.map((c, i) =>
          parseBonusClaimRecord(c, `event.approvedBonusClaims[${i}]`),
        ),
        engagedThreatIds: expectStringArray(value.engagedThreatIds, "event.engagedThreatIds"),
        primaryEngagedThreatId: expectNullableString(
          value.primaryEngagedThreatId,
          "event.primaryEngagedThreatId",
        ),
        playerFaces: expectNumberArray(value.playerFaces, "event.playerFaces"),
        keptDice: keptDice.map((k, i) => parseKeptDie(k, `event.keptDice[${i}]`)),
        attackDiceRolled: expectNumber(value.attackDiceRolled, "event.attackDiceRolled"),
        attackFaces: expectNumberArray(value.attackFaces, "event.attackFaces"),
        attackSuccessesRolled: expectNumber(
          value.attackSuccessesRolled,
          "event.attackSuccessesRolled",
        ),
        itemIdsCharged: expectStringArray(value.itemIdsCharged, "event.itemIdsCharged"),
        bloodSpent: expectNumber(value.bloodSpent, "event.bloodSpent"),
        passiveBloodGained: expectNumber(value.passiveBloodGained, "event.passiveBloodGained"),
      };
    }
    case "ActionResolved": {
      const allocations = value.allocations;
      const objectiveDeltas = value.objectiveDeltas;
      const threatDeltas = value.threatDeltas;
      const itemRestoreDeltas = value.itemRestoreDeltas;
      if (!Array.isArray(allocations)) fail("event.allocations", "expected an array");
      if (!Array.isArray(objectiveDeltas)) fail("event.objectiveDeltas", "expected an array");
      if (!Array.isArray(threatDeltas)) fail("event.threatDeltas", "expected an array");
      if (!Array.isArray(itemRestoreDeltas)) fail("event.itemRestoreDeltas", "expected an array");
      const injuryMark = value.injuryMark;
      const injuryChoicePendingMode = value.injuryChoicePendingMode;
      if (
        injuryChoicePendingMode !== null &&
        injuryChoicePendingMode !== "single" &&
        injuryChoicePendingMode !== "downed"
      ) {
        fail("event.injuryChoicePendingMode", "expected single|downed|null");
      }
      return {
        type: "ActionResolved",
        rollId: expectString(value.rollId, "event.rollId"),
        characterId: expectString(value.characterId, "event.characterId"),
        allocations: allocations.map((entry, index) => {
          if (!isRecord(entry)) fail(`event.allocations[${index}]`, "expected an object");
          return {
            dieFaceIndex: expectNumber(
              entry.dieFaceIndex,
              `event.allocations[${index}].dieFaceIndex`,
            ),
            target: parseAllocationTarget(entry.target, `event.allocations[${index}].target`),
          };
        }),
        objectiveDeltas: objectiveDeltas.map((d, i) =>
          parseObjectiveDelta(d, `event.objectiveDeltas[${i}]`),
        ),
        threatDeltas: threatDeltas.map((d, i) => parseThreatDelta(d, `event.threatDeltas[${i}]`)),
        bloodDelta: expectNumber(value.bloodDelta, "event.bloodDelta"),
        itemRestoreDeltas: itemRestoreDeltas.map((d, i) =>
          parseItemUseRestoreDelta(d, `event.itemRestoreDeltas[${i}]`),
        ),
        injuryClearedCount: expectNumber(value.injuryClearedCount, "event.injuryClearedCount"),
        remainingAttackSuccessesAfterAllocation: expectNumber(
          value.remainingAttackSuccessesAfterAllocation,
          "event.remainingAttackSuccessesAfterAllocation",
        ),
        attackBumpThreatId: expectNullableString(
          value.attackBumpThreatId,
          "event.attackBumpThreatId",
        ),
        injuryMark:
          injuryMark === null ? null : parseInjuryMarkResult(injuryMark, "event.injuryMark"),
        injuryChoicePendingMode,
      };
    }
    case "InjuryCategoryChosen":
      return {
        type: "InjuryCategoryChosen",
        rollId: expectString(value.rollId, "event.rollId"),
        characterId: expectString(value.characterId, "event.characterId"),
        mark: parseInjuryMarkResult(value.mark, "event.mark"),
      };
    default:
      return fail("event.type", `unknown event type ${String(value.type)}`);
  }
}

// --- View ------------------------------------------------------------------------

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

function parseObjectiveView(value: unknown, where: string): ObjectiveView {
  return parseObjective(value, where);
}

function parseThreatView(value: unknown, where: string): ThreatPublicView | ThreatGmView {
  if (!isRecord(value)) fail(where, "expected an object");
  const status = value.status;
  if (status !== "active" && status !== "beaten" && status !== "removed") {
    fail(`${where}.status`, "expected active|beaten|removed");
  }
  const base: ThreatPublicView = {
    id: expectString(value.id, `${where}.id`),
    name: expectString(value.name, `${where}.name`),
    rating: expectNumber(value.rating, `${where}.rating`),
    attack: expectNumber(value.attack, `${where}.attack`),
    challenge: expectNumber(value.challenge, `${where}.challenge`),
    solo: expectBoolean(value.solo, `${where}.solo`),
    elite: expectBoolean(value.elite, `${where}.elite`),
    flags: parseThreatFlags(value.flags, `${where}.flags`),
    status,
  };
  return "revealed" in value
    ? { ...base, revealed: expectBoolean(value.revealed, `${where}.revealed`) }
    : base;
}

function parseRollView(value: unknown, where: string): RollView {
  if (!isRecord(value)) fail(where, "expected an object");
  const status = value.status;
  if (typeof status !== "string" || !(ROLL_STATUSES as readonly string[]).includes(status)) {
    fail(`${where}.status`, `expected one of ${ROLL_STATUSES.join(", ")}`);
  }
  const rollId = expectString(value.rollId, `${where}.rollId`);
  const characterId = expectString(value.characterId, `${where}.characterId`);
  if (status === "declared" && !("declaredStat" in value)) {
    return { rollId, characterId, status: "declared" };
  }
  const approvedBonusClaims = value.approvedBonusClaims;
  const engagedThreatIds = value.engagedThreatIds;
  const playerFaces = value.playerFaces;
  const keptDice = value.keptDice;
  const attackFaces = value.attackFaces;
  return {
    rollId,
    characterId,
    status: status as RollStatus,
    declaredStat: expectStatOrNone(value.declaredStat, `${where}.declaredStat`),
    declaredItemIds: expectStringArray(value.declaredItemIds, `${where}.declaredItemIds`),
    declaredAbilityIds: expectStringArray(value.declaredAbilityIds, `${where}.declaredAbilityIds`),
    declaredBonusClaimIds: expectStringArray(
      value.declaredBonusClaimIds,
      `${where}.declaredBonusClaimIds`,
    ),
    declaredEngagedThreatIds: expectStringArray(
      value.declaredEngagedThreatIds,
      `${where}.declaredEngagedThreatIds`,
    ),
    note: expectNullableString(value.note, `${where}.note`),
    ...(approvedBonusClaims === undefined
      ? {}
      : {
          approvedBonusClaims: Array.isArray(approvedBonusClaims)
            ? approvedBonusClaims.map((c, i) =>
                parseBonusClaimRecord(c, `${where}.approvedBonusClaims[${i}]`),
              )
            : fail(`${where}.approvedBonusClaims`, "expected an array"),
        }),
    ...(engagedThreatIds === undefined
      ? {}
      : { engagedThreatIds: expectStringArray(engagedThreatIds, `${where}.engagedThreatIds`) }),
    ...(playerFaces === undefined
      ? {}
      : { playerFaces: expectNumberArray(playerFaces, `${where}.playerFaces`) }),
    ...(keptDice === undefined
      ? {}
      : {
          keptDice: Array.isArray(keptDice)
            ? keptDice.map((k, i) => parseKeptDie(k, `${where}.keptDice[${i}]`))
            : fail(`${where}.keptDice`, "expected an array"),
        }),
    ...(value.attackDiceRolled === undefined
      ? {}
      : { attackDiceRolled: expectNumber(value.attackDiceRolled, `${where}.attackDiceRolled`) }),
    ...(attackFaces === undefined
      ? {}
      : { attackFaces: expectNumberArray(attackFaces, `${where}.attackFaces`) }),
    ...(value.attackSuccessesRolled === undefined
      ? {}
      : {
          attackSuccessesRolled: expectNumber(
            value.attackSuccessesRolled,
            `${where}.attackSuccessesRolled`,
          ),
        }),
    ...(value.remainingAttackSuccessesAfterAllocation === undefined
      ? {}
      : {
          remainingAttackSuccessesAfterAllocation: expectNumber(
            value.remainingAttackSuccessesAfterAllocation,
            `${where}.remainingAttackSuccessesAfterAllocation`,
          ),
        }),
    ...(value.injuryChoicePending === undefined
      ? {}
      : {
          injuryChoicePending: parseInjuryChoicePending(
            value.injuryChoicePending,
            `${where}.injuryChoicePending`,
          ),
        }),
  };
}

export function parseView(value: unknown): EatTheReichView {
  if (!isRecord(value)) fail("view", "expected an object");
  const roster = value.roster;
  const gmSheets = value.gmSheets;
  const objectives = value.objectives;
  const threats = value.threats;
  const rolls = value.rolls;
  if (!Array.isArray(roster)) fail("view.roster", "expected an array");
  if (!Array.isArray(gmSheets)) fail("view.gmSheets", "expected an array");
  if (!Array.isArray(objectives)) fail("view.objectives", "expected an array");
  if (!Array.isArray(threats)) fail("view.threats", "expected an array");
  if (!Array.isArray(rolls)) fail("view.rolls", "expected an array");
  const self = value.self;
  return {
    self: self === null ? null : parseFullSheet(self, "view.self"),
    roster: roster.map((entry, index) => parsePartySummary(entry, `view.roster[${index}]`)),
    gmSheets: gmSheets.map((entry, index) => parseFullSheet(entry, `view.gmSheets[${index}]`)),
    objectives: objectives.map((entry, index) =>
      parseObjectiveView(entry, `view.objectives[${index}]`),
    ),
    threats: threats.map((entry, index) => parseThreatView(entry, `view.threats[${index}]`)),
    rolls: rolls.map((entry, index) => parseRollView(entry, `view.rolls[${index}]`)),
  };
}
