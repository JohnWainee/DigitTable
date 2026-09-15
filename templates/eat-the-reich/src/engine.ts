import {
  allow,
  broadcastEvent,
  decided,
  deny,
  rejected,
  rollDice,
  stableError,
  type AllocationOption,
  type AuthorizationResult,
  type AuthorizedMemberContext,
  type Decision,
  type DecisionContext,
  type GameTemplate,
  type InitialCampaignInput,
  type MigrationResult,
  type PoolExplanation,
  type PoolInput,
  type PresentationPreferences,
  type TheatreScene,
  type VersionedTemplateRecord,
  type StableError,
  type ViewerContext,
  type ViewerProjection,
  type VisibleRoll,
} from "@digitable/contracts";
import type { AllocationTarget } from "./allocations.js";
import type { EatTheReichCommand } from "./commands.js";
import type {
  ItemUseRestoreDelta,
  ObjectiveDelta,
  ThreatDelta,
  EatTheReichEvent,
  InjuryMarkResult,
} from "./events.js";
import { EAT_THE_REICH_MANIFEST } from "./manifest.js";
import {
  activePenaltyTags,
  buildPool,
  DICE_SIDES,
  interpretAttackDie,
  interpretDie,
  lastUseBonusDice,
  SUCCESS_THRESHOLD,
  type PoolBuildRejection,
} from "./pool.js";
import { ORIGINAL_ROSTER } from "./roster.js";
import {
  challengeDamage,
  computeAttackDiceCount,
  groupAllocationsByTarget,
  rollCategoryIndex,
} from "./resolution.js";
import { parseCommand, parseEvent, parseState, parseView } from "./schemas.js";
import {
  isStat,
  type AbilityEffect,
  type BonusClaimRecord,
  type CharacterState,
  type EatTheReichState,
  type InjuryPenaltyTag,
  type KeptDie,
  type ObjectiveState,
  type RollRecord,
  type ThreatState,
} from "./state.js";
import type {
  CharacterFullSheet,
  CharacterPartySummary,
  EatTheReichView,
  ObjectiveView,
  RollView,
  ThreatGmView,
  ThreatPublicView,
} from "./view.js";

const HEAL_INJURY_BLOOD_COST = 3;
const MAX_BLOOD = 10;

// ---------------------------------------------------------------------------
// Projection helpers
// ---------------------------------------------------------------------------

function injuryBoxesMarked(character: CharacterState): number {
  return character.injuries.reduce(
    (sum, category) => sum + category.boxes.filter((box) => box.marked).length,
    0,
  );
}

function toPartySummary(character: CharacterState): CharacterPartySummary {
  return {
    id: character.id,
    name: character.name,
    concept: character.concept,
    portraitId: character.portraitId,
    claimedByMemberId: character.claimedByMemberId,
    stats: character.stats,
    blood: character.blood,
    injuryBoxesMarked: injuryBoxesMarked(character),
    downed: character.downed,
    retired: character.retired,
  };
}

function toFullSheet(character: CharacterState): CharacterFullSheet {
  return {
    ...toPartySummary(character),
    items: character.items,
    abilities: character.abilities,
    advances: character.advances,
    injuries: character.injuries,
    lastStand: character.lastStand,
    activeLootId: character.activeLootId,
  };
}

function toThreatPublicView(threat: ThreatState): ThreatPublicView {
  return {
    id: threat.id,
    name: threat.name,
    rating: threat.rating,
    attack: threat.attack,
    challenge: threat.challenge,
    solo: threat.solo,
    elite: threat.elite,
    flags: threat.flags,
    status: threat.status,
  };
}

function toThreatGmView(threat: ThreatState): ThreatGmView {
  return { ...toThreatPublicView(threat), revealed: threat.revealed };
}

function toObjectiveView(objective: ObjectiveState): ObjectiveView {
  return {
    id: objective.id,
    title: objective.title,
    kind: objective.kind,
    rating: objective.rating,
    challenge: objective.challenge,
    status: objective.status,
  };
}

function toRollView(roll: RollRecord, viewer: ViewerContext, isGm: boolean): RollView {
  const isOwner = viewer.capability === "player" && roll.actorMemberId === viewer.viewerId;
  if (roll.status === "declared" && !isOwner && !isGm) {
    return { rollId: roll.id, characterId: roll.characterId, status: "declared" };
  }
  return {
    rollId: roll.id,
    characterId: roll.characterId,
    status: roll.status,
    declaredStat: roll.declaredStat,
    declaredItemIds: roll.declaredItemIds,
    declaredAbilityIds: roll.declaredAbilityIds,
    declaredBonusClaimIds: roll.declaredBonusClaimIds,
    declaredEngagedThreatIds: roll.declaredEngagedThreatIds,
    note: roll.note,
    ...(roll.approvedBonusClaims !== undefined
      ? { approvedBonusClaims: roll.approvedBonusClaims }
      : {}),
    ...(roll.engagedThreatIds !== undefined ? { engagedThreatIds: roll.engagedThreatIds } : {}),
    ...(roll.playerFaces !== undefined ? { playerFaces: roll.playerFaces } : {}),
    ...(roll.keptDice !== undefined ? { keptDice: roll.keptDice } : {}),
    ...(roll.attackDiceRolled !== undefined ? { attackDiceRolled: roll.attackDiceRolled } : {}),
    ...(roll.attackFaces !== undefined ? { attackFaces: roll.attackFaces } : {}),
    ...(roll.attackSuccessesRolled !== undefined
      ? { attackSuccessesRolled: roll.attackSuccessesRolled }
      : {}),
    ...(roll.remainingAttackSuccessesAfterAllocation !== undefined
      ? { remainingAttackSuccessesAfterAllocation: roll.remainingAttackSuccessesAfterAllocation }
      : {}),
    ...(roll.injuryChoicePending !== undefined
      ? { injuryChoicePending: roll.injuryChoicePending }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Shared helpers used by decide()
// ---------------------------------------------------------------------------

function poolRejectionToStableError(rejection: PoolBuildRejection): StableError {
  switch (rejection.kind) {
    case "itemDepleted":
      return stableError("ITEM_DEPLETED", `"${rejection.itemId}" has no uses left.`);
    case "insufficientBlood":
      return stableError(
        "INSUFFICIENT_BLOOD",
        `Needs ${rejection.needed} Blood; you have ${rejection.available}.`,
      );
    case "bloodSpendForbidden":
      return stableError("INSUFFICIENT_BLOOD", "An injury forbids spending Blood right now.");
    case "unknownItem":
      return stableError("UNKNOWN_ACTION", `No such item "${rejection.itemId}".`);
    case "unknownAbility":
      return stableError("UNKNOWN_ACTION", `No such ability "${rejection.abilityId}".`);
    case "abilityNotUsable":
      return stableError("UNKNOWN_ACTION", `"${rejection.abilityId}" cannot be used to add a die.`);
    case "oneItemPerTurn":
      return stableError("UNKNOWN_ACTION", "An injury limits you to one item this turn.");
  }
}

function hasUnresolvedRoll(state: EatTheReichState, characterId: string): boolean {
  return Object.values(state.rolls).some(
    (roll) => roll.characterId === characterId && roll.status !== "resolved",
  );
}

function findActiveRevealedThreat(state: EatTheReichState, threatId: string): ThreatState | null {
  const threat = state.threats[threatId];
  return threat && threat.status === "active" && threat.revealed ? threat : null;
}

function makeRescueObjective(character: CharacterState): ObjectiveState {
  return {
    id: `rescue-${character.id}`,
    title: `Rescue ${character.name}`,
    kind: "rescue",
    rating: 3,
    challenge: 0,
    status: "active",
  };
}

// ---------------------------------------------------------------------------
// B02: character claim/release/heal
// ---------------------------------------------------------------------------

function decideClaimCharacter(
  ctx: DecisionContext<EatTheReichState>,
  command: Extract<EatTheReichCommand, { type: "ClaimCharacter" }>,
): Decision<EatTheReichEvent> {
  const character = ctx.state.characters[command.characterId];
  if (!character) {
    return rejected(stableError("UNKNOWN_ACTION", "No such character."));
  }
  if (character.claimedByMemberId !== null) {
    return rejected(
      stableError("CHARACTER_TAKEN", `${character.name} was just claimed by someone else.`),
    );
  }
  const alreadyHeld = Object.values(ctx.state.characters).find(
    (candidate) => candidate.claimedByMemberId === ctx.actor.memberId,
  );
  if (alreadyHeld) {
    return rejected(
      stableError(
        "ROLE_FORBIDDEN",
        `You already hold ${alreadyHeld.name}; release them before claiming another character.`,
      ),
    );
  }
  const event: EatTheReichEvent = {
    type: "CharacterClaimed",
    characterId: character.id,
    memberId: ctx.actor.memberId,
  };
  return decided([broadcastEvent(`${character.id}-claimed`, event, [{ kind: "shared" }])]);
}

function decideReleaseCharacter(
  ctx: DecisionContext<EatTheReichState>,
  command: Extract<EatTheReichCommand, { type: "ReleaseCharacter" }>,
): Decision<EatTheReichEvent> {
  const character = ctx.state.characters[command.characterId];
  if (!character) {
    return rejected(stableError("UNKNOWN_ACTION", "No such character."));
  }
  if (character.claimedByMemberId !== ctx.actor.memberId) {
    return rejected(stableError("ROLE_FORBIDDEN", "You may only release your own character."));
  }
  const event: EatTheReichEvent = {
    type: "CharacterReleased",
    characterId: character.id,
    memberId: ctx.actor.memberId,
  };
  return decided([broadcastEvent(`${character.id}-released`, event, [{ kind: "shared" }])]);
}

function decideHealInjury(
  ctx: DecisionContext<EatTheReichState>,
  command: Extract<EatTheReichCommand, { type: "HealInjury" }>,
): Decision<EatTheReichEvent> {
  const character = ctx.state.characters[command.characterId];
  if (!character) {
    return rejected(stableError("UNKNOWN_ACTION", "No such character."));
  }
  if (character.claimedByMemberId !== ctx.actor.memberId) {
    return rejected(stableError("ROLE_FORBIDDEN", "You may only heal your own character."));
  }
  if (character.retired) {
    return rejected(
      stableError("CHARACTER_RETIRED", "Your story is told; there is nothing left to heal."),
    );
  }
  const category = character.injuries.find((candidate) => candidate.id === command.categoryId);
  if (!category) {
    return rejected(stableError("UNKNOWN_ACTION", "No such injury category."));
  }
  const box = category.boxes[command.boxIndex];
  if (!box.marked) {
    return rejected(stableError("UNKNOWN_ACTION", "That injury box is not marked."));
  }
  const penaltyTags: readonly InjuryPenaltyTag[] = activePenaltyTags(character);
  if (penaltyTags.some((tag) => tag.kind === "noBloodSpend")) {
    return rejected(
      stableError("INSUFFICIENT_BLOOD", "An injury forbids spending Blood right now."),
    );
  }
  if (character.blood < HEAL_INJURY_BLOOD_COST) {
    return rejected(
      stableError(
        "INSUFFICIENT_BLOOD",
        `Healing costs ${HEAL_INJURY_BLOOD_COST} Blood; you have ${character.blood}.`,
      ),
    );
  }
  const event: EatTheReichEvent = {
    type: "InjuryHealed",
    characterId: character.id,
    categoryId: category.id,
    boxIndex: command.boxIndex,
    bloodSpent: HEAL_INJURY_BLOOD_COST,
  };
  return decided([
    broadcastEvent(`${character.id}-healed-${category.id}-${command.boxIndex}`, event, [
      { kind: "shared" },
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// B03: declare -> review -> roll -> allocate
// ---------------------------------------------------------------------------

function decideBeginAction(
  ctx: DecisionContext<EatTheReichState>,
  command: Extract<EatTheReichCommand, { type: "BeginAction" }>,
): Decision<EatTheReichEvent> {
  const character = ctx.state.characters[command.characterId];
  if (!character) {
    return rejected(stableError("UNKNOWN_ACTION", "No such character."));
  }
  if (character.claimedByMemberId !== ctx.actor.memberId) {
    return rejected(stableError("ROLE_FORBIDDEN", "You may only act as your own character."));
  }
  if (character.downed) {
    return rejected(stableError("CHARACTER_DOWNED", "You're down. A teammate must rescue you."));
  }
  if (character.retired) {
    return rejected(stableError("CHARACTER_RETIRED", "Your story is told."));
  }
  if (hasUnresolvedRoll(ctx.state, character.id)) {
    return rejected(
      stableError("ROLL_ALREADY_RESOLVED", "Resolve your current action before starting another."),
    );
  }
  const poolOutcome = buildPool(character, {
    stat: command.stat,
    itemIds: command.itemIds,
    abilityIds: command.abilityIds,
  });
  if (!poolOutcome.ok) {
    return rejected(poolRejectionToStableError(poolOutcome.rejection));
  }
  const allowedBonusSources = new Set([...command.itemIds, ...command.abilityIds]);
  for (const claimId of command.bonusClaimIds) {
    if (!allowedBonusSources.has(claimId)) {
      return rejected(
        stableError("UNKNOWN_ACTION", "A bonus claim must be for a selected item or ability."),
      );
    }
  }
  for (const threatId of command.engagedThreatIds) {
    if (!findActiveRevealedThreat(ctx.state, threatId)) {
      return rejected(stableError("UNKNOWN_ACTION", "No such active, revealed Threat."));
    }
  }

  const rollId = `roll-${ctx.state.nextRollSequence}`;
  const fullEvent: EatTheReichEvent = {
    type: "ActionDeclared",
    rollId,
    characterId: character.id,
    actorMemberId: ctx.actor.memberId,
    stat: command.stat,
    itemIds: command.itemIds,
    abilityIds: command.abilityIds,
    bonusClaimIds: command.bonusClaimIds,
    engagedThreatIds: command.engagedThreatIds,
    note: command.note,
  };
  const redactedForOthers: EatTheReichEvent = {
    type: "ActionDeclared",
    rollId,
    characterId: character.id,
    actorMemberId: ctx.actor.memberId,
    stat: "none",
    itemIds: [],
    abilityIds: [],
    bonusClaimIds: [],
    engagedThreatIds: [],
    note: null,
  };
  return decided([
    {
      eventId: rollId,
      event: fullEvent,
      effects: [
        { destination: { kind: "gm" }, payload: fullEvent },
        { destination: { kind: "member", memberId: ctx.actor.memberId }, payload: fullEvent },
        { destination: { kind: "shared" }, payload: redactedForOthers },
      ],
    },
  ]);
}

function decideReviewAction(
  ctx: DecisionContext<EatTheReichState>,
  command: Extract<EatTheReichCommand, { type: "ReviewAction" }>,
): Decision<EatTheReichEvent> {
  const roll = ctx.state.rolls[command.rollId];
  if (!roll) return rejected(stableError("UNKNOWN_ACTION", "No such roll."));
  if (roll.status !== "declared") {
    return rejected(stableError("ROLL_ALREADY_RESOLVED", "This roll is not awaiting review."));
  }
  const character = ctx.state.characters[roll.characterId];
  if (!character) return rejected(stableError("UNKNOWN_ACTION", "No such character."));

  for (const claimId of command.approvedClaimIds) {
    if (!roll.declaredBonusClaimIds.includes(claimId)) {
      return rejected(
        stableError("UNKNOWN_ACTION", "Cannot approve a claim that was not declared."),
      );
    }
  }
  for (const threatId of command.engagedThreatIds) {
    if (!findActiveRevealedThreat(ctx.state, threatId)) {
      return rejected(stableError("UNKNOWN_ACTION", "No such active, revealed Threat."));
    }
  }

  const poolOutcome = buildPool(character, {
    stat: roll.declaredStat,
    itemIds: roll.declaredItemIds,
    abilityIds: roll.declaredAbilityIds,
  });
  if (!poolOutcome.ok) {
    return rejected(poolRejectionToStableError(poolOutcome.rejection));
  }

  const tags = activePenaltyTags(character);
  const noBonusDice = tags.some((tag) => tag.kind === "noBonusDice");
  const bonusPlusFor = (sourceId: string): number => {
    const item = character.items.find((candidate) => candidate.id === sourceId);
    if (item) return item.bonusPlus;
    const ability = character.abilities.find((candidate) => candidate.id === sourceId);
    return ability?.bonusPlus ?? 0;
  };
  const approvedBonusClaims: BonusClaimRecord[] = roll.declaredBonusClaimIds.map((sourceId) => ({
    sourceId,
    approved: command.approvedClaimIds.includes(sourceId),
    plus: bonusPlusFor(sourceId),
  }));
  const bonusDice = noBonusDice
    ? 0
    : approvedBonusClaims
        .filter((claim) => claim.approved)
        .reduce((sum, claim) => sum + claim.plus, 0);
  const lastUseDice = lastUseBonusDice(character, roll.declaredItemIds);
  const totalPoolSize = poolOutcome.result.total + bonusDice + lastUseDice;

  const playerFaces = rollDice(ctx.random, totalPoolSize, DICE_SIDES);
  const discardBelow = Math.max(
    SUCCESS_THRESHOLD,
    ...command.engagedThreatIds
      .map((id) => ctx.state.threats[id]?.flags.discardBelow)
      .filter((value): value is number => value !== undefined),
  );
  const keptDice: KeptDie[] = [];
  playerFaces.forEach((face, faceIndex) => {
    const result = interpretDie(face, discardBelow);
    if (result !== "discard") {
      keptDice.push({ faceIndex, face, result, points: result === "critical" ? 2 : 1 });
    }
  });

  let passiveBloodGained = 0;
  let passiveRemoveAttack = 0;
  const onesRolled = playerFaces.filter((face) => face === 1).length;
  if (onesRolled > 0) {
    for (const ability of character.abilities) {
      if (ability.trigger !== "passive") continue;
      if (ability.effect.kind === "onOnesGainBlood") {
        passiveBloodGained += ability.effect.amount * onesRolled;
      } else if (ability.effect.kind === "onOnesRemoveAttack") {
        passiveRemoveAttack += ability.effect.amount * onesRolled;
      }
    }
  }

  const primaryEngagedThreatId = command.engagedThreatIds[0] ?? null;
  const primaryThreat = primaryEngagedThreatId
    ? ctx.state.threats[primaryEngagedThreatId]
    : undefined;
  const attackDiceRolled = computeAttackDiceCount(
    Object.values(ctx.state.threats),
    command.engagedThreatIds,
  );
  const attackFaces = rollDice(ctx.random, attackDiceRolled, DICE_SIDES);
  const rawAttackSuccesses = attackFaces.reduce(
    (sum, face) => sum + interpretAttackDie(face, primaryThreat?.flags.attackCritOnSix ?? false),
    0,
  );
  const attackSuccessesRolled = Math.max(0, rawAttackSuccesses - passiveRemoveAttack);

  const event: EatTheReichEvent = {
    type: "ActionRolled",
    rollId: roll.id,
    characterId: character.id,
    approvedBonusClaims,
    engagedThreatIds: command.engagedThreatIds,
    primaryEngagedThreatId,
    playerFaces,
    keptDice,
    attackDiceRolled,
    attackFaces,
    attackSuccessesRolled,
    itemIdsCharged: [...new Set(roll.declaredItemIds)],
    bloodSpent: poolOutcome.result.bloodCost,
    passiveBloodGained,
  };
  return decided([broadcastEvent(`${roll.id}-rolled`, event, [{ kind: "shared" }])]);
}

interface SpecialWorkingEffect {
  readonly bloodDelta: number;
  readonly itemRestore: { readonly itemId: string; readonly amount: number } | null;
  readonly injuryCleared: number;
  readonly attackSuccessesRemoved: number;
  readonly threatRatingDelta: number;
  readonly threatAttackDelta: number;
}

const NO_SPECIAL_EFFECT: SpecialWorkingEffect = {
  bloodDelta: 0,
  itemRestore: null,
  injuryCleared: 0,
  attackSuccessesRemoved: 0,
  threatRatingDelta: 0,
  threatAttackDelta: 0,
};

function resolveSpecialEffect(
  effect: AbilityEffect,
  primaryThreat: { readonly elite: boolean } | undefined,
): SpecialWorkingEffect {
  switch (effect.kind) {
    case "reduceThreatAttack":
      return { ...NO_SPECIAL_EFFECT, threatAttackDelta: -effect.amount };
    case "reduceRating":
      return { ...NO_SPECIAL_EFFECT, threatRatingDelta: -effect.amount };
    case "damageElite":
      return primaryThreat?.elite
        ? { ...NO_SPECIAL_EFFECT, threatRatingDelta: -effect.amount }
        : NO_SPECIAL_EFFECT;
    case "gainBlood":
      return { ...NO_SPECIAL_EFFECT, bloodDelta: effect.amount };
    case "clearInjury":
      return { ...NO_SPECIAL_EFFECT, injuryCleared: effect.count };
    case "removeAttackSuccesses":
      return { ...NO_SPECIAL_EFFECT, attackSuccessesRemoved: effect.amount };
    case "restoreItemUse":
      return {
        ...NO_SPECIAL_EFFECT,
        itemRestore: { itemId: effect.itemId, amount: effect.amount },
      };
    default:
      // "none", "text", and the passive-only onOnes* effects have no automatic
      // allocation-time effect (matrix Appendix B: "text" is manual, GM-applied).
      return NO_SPECIAL_EFFECT;
  }
}

function decideAllocateResults(
  ctx: DecisionContext<EatTheReichState>,
  command: Extract<EatTheReichCommand, { type: "AllocateResults" }>,
): Decision<EatTheReichEvent> {
  const roll = ctx.state.rolls[command.rollId];
  if (!roll) return rejected(stableError("UNKNOWN_ACTION", "No such roll."));
  if (roll.actorMemberId !== ctx.actor.memberId) {
    return rejected(stableError("ROLE_FORBIDDEN", "You may only allocate your own roll."));
  }
  if (roll.status !== "awaiting_allocation") {
    return rejected(stableError("ROLL_ALREADY_RESOLVED", "This roll is not awaiting allocation."));
  }
  const character = ctx.state.characters[roll.characterId];
  if (!character) return rejected(stableError("UNKNOWN_ACTION", "No such character."));

  const keptDice = roll.keptDice ?? [];
  const keptByIndex = new Map(keptDice.map((die) => [die.faceIndex, die]));
  const seen = new Set<number>();
  for (const allocation of command.allocations) {
    if (!keptByIndex.has(allocation.dieFaceIndex)) {
      return rejected(stableError("INVALID_ALLOCATION", "That die was not kept."));
    }
    if (seen.has(allocation.dieFaceIndex)) {
      return rejected(stableError("INVALID_ALLOCATION", "Each die may be allocated once."));
    }
    seen.add(allocation.dieFaceIndex);
  }
  for (const die of keptDice) {
    if (!seen.has(die.faceIndex)) {
      return rejected(stableError("INVALID_ALLOCATION", "Every kept die must be allocated."));
    }
  }

  const engagedThreatIds = roll.engagedThreatIds ?? [];
  const noSpecials = activePenaltyTags(character).some((tag) => tag.kind === "noSpecials");

  for (const allocation of command.allocations) {
    const die = keptByIndex.get(allocation.dieFaceIndex);
    if (!die) continue;
    const target: AllocationTarget = allocation.target;
    switch (target.kind) {
      case "objective": {
        const objective = ctx.state.objectives[target.objectiveId];
        if (!objective || objective.status !== "active") {
          return rejected(stableError("INVALID_ALLOCATION", "No such active Objective."));
        }
        break;
      }
      case "threat": {
        const threat = ctx.state.threats[target.threatId];
        if (!threat || threat.status !== "active") {
          return rejected(stableError("INVALID_ALLOCATION", "No such active Threat."));
        }
        break;
      }
      case "defend":
        break;
      case "feed": {
        if (engagedThreatIds.length === 1) {
          const only = ctx.state.threats[engagedThreatIds[0] ?? ""];
          if (only?.flags.noFeeding) {
            return rejected(stableError("INVALID_ALLOCATION", "This Threat forbids feeding."));
          }
        }
        break;
      }
      case "special": {
        const ability = character.abilities.find((candidate) => candidate.id === target.abilityId);
        if (!ability || ability.trigger !== "special") {
          return rejected(stableError("INVALID_ALLOCATION", "No such SPECIAL."));
        }
        if (die.result !== "critical") {
          return rejected(
            stableError("INVALID_ALLOCATION", "Only a critical die may activate a SPECIAL."),
          );
        }
        if (noSpecials) {
          return rejected(
            stableError("INVALID_ALLOCATION", "An injury forbids SPECIALs right now."),
          );
        }
        break;
      }
    }
  }

  const pointsByFaceIndex = new Map(keptDice.map((die) => [die.faceIndex, die.points]));
  const grouped = groupAllocationsByTarget(command.allocations, pointsByFaceIndex);

  type ThreatWorking = { rating: number; attack: number; elite: boolean };
  const threatWorking = new Map<string, ThreatWorking>();
  const getThreatWorking = (id: string): ThreatWorking => {
    let working = threatWorking.get(id);
    if (!working) {
      // Invariant: every id reaching here was already validated to exist in the
      // per-die target-legality loop above `decideAllocateResults` runs before grouping.
      const threat = ctx.state.threats[id]!;
      working = { rating: threat.rating, attack: threat.attack, elite: threat.elite };
      threatWorking.set(id, working);
    }
    return working;
  };
  type ObjectiveWorking = { rating: number };
  const objectiveWorking = new Map<string, ObjectiveWorking>();
  const getObjectiveWorking = (id: string): ObjectiveWorking => {
    let working = objectiveWorking.get(id);
    if (!working) {
      // Invariant: same as `getThreatWorking` above.
      working = { rating: ctx.state.objectives[id]!.rating };
      objectiveWorking.set(id, working);
    }
    return working;
  };

  let bloodWorking = character.blood;
  const itemRestoreWorking = new Map<string, number>();
  let injuryClearedCount = 0;
  let defendPoints = 0;

  const primaryEngagedThreatId = roll.primaryEngagedThreatId ?? null;
  const primaryThreatForSpecials = primaryEngagedThreatId
    ? { elite: ctx.state.threats[primaryEngagedThreatId]?.elite ?? false }
    : undefined;

  for (const group of grouped) {
    const target = group.target;
    switch (target.kind) {
      case "objective": {
        const working = getObjectiveWorking(target.objectiveId);
        const objective = ctx.state.objectives[target.objectiveId]!;
        const damage = challengeDamage(group.points, objective.challenge);
        working.rating = Math.max(0, working.rating - damage);
        break;
      }
      case "threat": {
        const working = getThreatWorking(target.threatId);
        const threat = ctx.state.threats[target.threatId]!;
        const damage = challengeDamage(group.points, threat.challenge);
        working.rating = Math.max(0, working.rating - damage);
        if (working.rating <= 0) working.attack = 0;
        break;
      }
      case "defend":
        defendPoints += group.points;
        break;
      case "feed":
        bloodWorking = Math.min(MAX_BLOOD, bloodWorking + group.points);
        break;
      case "special": {
        const ability = character.abilities.find((candidate) => candidate.id === target.abilityId);
        if (!ability) break;
        for (const _dieIndex of group.dieFaceIndexes) {
          const result = resolveSpecialEffect(ability.effect, primaryThreatForSpecials);
          bloodWorking = Math.min(MAX_BLOOD, bloodWorking + result.bloodDelta);
          injuryClearedCount += result.injuryCleared;
          // Folded into the same "points removed from the GM's remaining successes"
          // accounting as `defend` (both ultimately subtract from rawAttackSuccesses below).
          defendPoints += result.attackSuccessesRemoved;
          if (result.itemRestore) {
            itemRestoreWorking.set(
              result.itemRestore.itemId,
              (itemRestoreWorking.get(result.itemRestore.itemId) ?? 0) + result.itemRestore.amount,
            );
          }
          if (
            primaryEngagedThreatId &&
            (result.threatRatingDelta !== 0 || result.threatAttackDelta !== 0)
          ) {
            const working = getThreatWorking(primaryEngagedThreatId);
            working.rating = Math.max(0, working.rating + result.threatRatingDelta);
            working.attack = Math.max(0, working.attack + result.threatAttackDelta);
            if (working.rating <= 0) working.attack = 0;
          }
        }
        break;
      }
    }
  }

  const rawAttackSuccesses = roll.attackSuccessesRolled ?? 0;
  const remainingAttackSuccessesAfterAllocation = Math.max(0, rawAttackSuccesses - defendPoints);

  // matrix O4: zero-success bump uses the RAW roll, not the post-defend remainder.
  const attackBumpThreatId =
    (roll.attackDiceRolled ?? 0) > 0 && rawAttackSuccesses === 0 ? primaryEngagedThreatId : null;
  if (attackBumpThreatId) {
    const working = getThreatWorking(attackBumpThreatId);
    working.attack += 1;
  }

  const objectiveDeltas: ObjectiveDelta[] = [...objectiveWorking.entries()].map(
    ([id, working]) => ({
      objectiveId: id,
      ratingAfter: working.rating,
      status: working.rating <= 0 ? "complete" : "active",
    }),
  );
  const threatDeltas: ThreatDelta[] = [...threatWorking.entries()].map(([id, working]) => ({
    threatId: id,
    ratingAfter: working.rating,
    attackAfter: working.attack,
    status: working.rating <= 0 ? (working.elite ? "removed" : "beaten") : "active",
  }));
  const itemRestoreDeltas: ItemUseRestoreDelta[] = [...itemRestoreWorking.entries()].map(
    ([itemId, amount]) => ({ itemId, amount }),
  );
  const bloodDelta = bloodWorking - character.blood;

  let injuryMark: InjuryMarkResult | null = null;
  let injuryChoicePendingMode: "single" | "downed" | null = null;
  if (remainingAttackSuccessesAfterAllocation > 0) {
    const categoryFace = ctx.random.rollDie(6);
    const categoryIndex = rollCategoryIndex(categoryFace);
    // Invariant: every roster character has exactly 3 injury categories (matrix C3,
    // enforced by test/roster.test.ts), and rollCategoryIndex only returns 0-2.
    const category = character.injuries[categoryIndex]!;
    const downed = remainingAttackSuccessesAfterAllocation >= 3;
    const primaryThreatFlags = primaryEngagedThreatId
      ? ctx.state.threats[primaryEngagedThreatId]?.flags
      : undefined;
    const wholeCategory = downed || (primaryThreatFlags?.injuryMarksWholeCategory ?? false);
    const openBoxIndexes: (0 | 1)[] = [];
    category.boxes.forEach((box, index) => {
      if (!box.marked) openBoxIndexes.push(index as 0 | 1);
    });
    if (openBoxIndexes.length === 0) {
      injuryChoicePendingMode = downed ? "downed" : "single";
    } else {
      const boxIndexes = wholeCategory ? openBoxIndexes : [openBoxIndexes[0]!];
      injuryMark = {
        categoryId: category.id,
        boxIndexes,
        downed,
        rescueObjective: downed ? makeRescueObjective(character) : null,
      };
    }
  }

  const event: EatTheReichEvent = {
    type: "ActionResolved",
    rollId: roll.id,
    characterId: character.id,
    allocations: command.allocations,
    objectiveDeltas,
    threatDeltas,
    bloodDelta,
    itemRestoreDeltas,
    injuryClearedCount,
    remainingAttackSuccessesAfterAllocation,
    attackBumpThreatId,
    injuryMark,
    injuryChoicePendingMode,
  };
  return decided([broadcastEvent(`${roll.id}-resolved`, event, [{ kind: "shared" }])]);
}

function decideChooseInjuryCategory(
  ctx: DecisionContext<EatTheReichState>,
  command: Extract<EatTheReichCommand, { type: "ChooseInjuryCategory" }>,
): Decision<EatTheReichEvent> {
  const roll = ctx.state.rolls[command.rollId];
  if (!roll) return rejected(stableError("UNKNOWN_ACTION", "No such roll."));
  if (roll.actorMemberId !== ctx.actor.memberId) {
    return rejected(stableError("ROLE_FORBIDDEN", "You may only resolve your own roll."));
  }
  if (roll.status !== "awaiting_injury_choice" || !roll.injuryChoicePending) {
    return rejected(stableError("ROLL_ALREADY_RESOLVED", "No injury choice is pending."));
  }
  const character = ctx.state.characters[roll.characterId];
  if (!character) return rejected(stableError("UNKNOWN_ACTION", "No such character."));
  const category = character.injuries.find((candidate) => candidate.id === command.categoryId);
  if (!category) return rejected(stableError("UNKNOWN_ACTION", "No such injury category."));
  const openBoxIndexes: (0 | 1)[] = [];
  category.boxes.forEach((box, index) => {
    if (!box.marked) openBoxIndexes.push(index as 0 | 1);
  });
  if (openBoxIndexes.length === 0) {
    return rejected(stableError("INVALID_ALLOCATION", "That category has no open box either."));
  }
  const downed = roll.injuryChoicePending.mode === "downed";
  const boxIndexes = downed ? openBoxIndexes : [openBoxIndexes[0]!];
  const mark: InjuryMarkResult = {
    categoryId: category.id,
    boxIndexes,
    downed,
    rescueObjective: downed ? makeRescueObjective(character) : null,
  };
  const event: EatTheReichEvent = {
    type: "InjuryCategoryChosen",
    rollId: roll.id,
    characterId: character.id,
    mark,
  };
  return decided([broadcastEvent(`${roll.id}-injury-choice`, event, [{ kind: "shared" }])]);
}

// ---------------------------------------------------------------------------
// GameTemplate wiring
// ---------------------------------------------------------------------------

function authorizeGameAction(
  ctx: AuthorizedMemberContext,
  command: EatTheReichCommand,
): AuthorizationResult {
  switch (command.type) {
    case "ClaimCharacter":
      return ctx.capability === "player"
        ? allow()
        : deny(stableError("ROLE_FORBIDDEN", "Only a player may claim a character."));
    case "ReleaseCharacter":
      return ctx.capability === "player"
        ? allow()
        : deny(stableError("ROLE_FORBIDDEN", "Only a player may release a character."));
    case "HealInjury":
      return ctx.capability === "player"
        ? allow()
        : deny(stableError("ROLE_FORBIDDEN", "Only a player may heal an injury."));
    case "BeginAction":
      return ctx.capability === "player"
        ? allow()
        : deny(stableError("ROLE_FORBIDDEN", "Only a player may declare an action."));
    case "ReviewAction":
      return ctx.capability === "gm"
        ? allow()
        : deny(stableError("ROLE_FORBIDDEN", "Only the GM may review a declared action."));
    case "AllocateResults":
      return ctx.capability === "player"
        ? allow()
        : deny(stableError("ROLE_FORBIDDEN", "Only a player may allocate results."));
    case "ChooseInjuryCategory":
      return ctx.capability === "player"
        ? allow()
        : deny(stableError("ROLE_FORBIDDEN", "Only a player may choose an injury category."));
  }
}

function decide(
  ctx: DecisionContext<EatTheReichState>,
  command: EatTheReichCommand,
): Decision<EatTheReichEvent> {
  switch (command.type) {
    case "ClaimCharacter":
      return decideClaimCharacter(ctx, command);
    case "ReleaseCharacter":
      return decideReleaseCharacter(ctx, command);
    case "HealInjury":
      return decideHealInjury(ctx, command);
    case "BeginAction":
      return decideBeginAction(ctx, command);
    case "ReviewAction":
      return decideReviewAction(ctx, command);
    case "AllocateResults":
      return decideAllocateResults(ctx, command);
    case "ChooseInjuryCategory":
      return decideChooseInjuryCategory(ctx, command);
  }
}

function applyThreatDelta(state: EatTheReichState, delta: ThreatDelta): EatTheReichState {
  const threat = state.threats[delta.threatId];
  if (!threat) return state;
  return {
    ...state,
    threats: {
      ...state.threats,
      [delta.threatId]: {
        ...threat,
        rating: delta.ratingAfter,
        attack: delta.attackAfter,
        status: delta.status,
      },
    },
  };
}

function applyObjectiveDelta(state: EatTheReichState, delta: ObjectiveDelta): EatTheReichState {
  const objective = state.objectives[delta.objectiveId];
  if (!objective) return state;
  return {
    ...state,
    objectives: {
      ...state.objectives,
      [delta.objectiveId]: { ...objective, rating: delta.ratingAfter, status: delta.status },
    },
  };
}

function applyInjuryMark(
  state: EatTheReichState,
  characterId: string,
  mark: InjuryMarkResult,
): EatTheReichState {
  const character = state.characters[characterId];
  if (!character) return state;
  const injuries = character.injuries.map((category) => {
    if (category.id !== mark.categoryId) return category;
    const boxes = [...category.boxes] as [(typeof category.boxes)[0], (typeof category.boxes)[1]];
    for (const boxIndex of mark.boxIndexes) {
      boxes[boxIndex] = { ...boxes[boxIndex], marked: true };
    }
    return { ...category, boxes };
  });
  const nextCharacters = {
    ...state.characters,
    [characterId]: { ...character, injuries, downed: mark.downed || character.downed },
  };
  const nextObjectives = mark.rescueObjective
    ? { ...state.objectives, [mark.rescueObjective.id]: mark.rescueObjective }
    : state.objectives;
  return { ...state, characters: nextCharacters, objectives: nextObjectives };
}

function reduce(state: EatTheReichState, event: EatTheReichEvent): EatTheReichState {
  switch (event.type) {
    case "CharacterClaimed": {
      const character = state.characters[event.characterId];
      if (!character) return state;
      return {
        ...state,
        characters: {
          ...state.characters,
          [character.id]: { ...character, claimedByMemberId: event.memberId },
        },
      };
    }
    case "CharacterReleased": {
      const character = state.characters[event.characterId];
      if (!character) return state;
      return {
        ...state,
        characters: {
          ...state.characters,
          [character.id]: { ...character, claimedByMemberId: null },
        },
      };
    }
    case "InjuryHealed": {
      const character = state.characters[event.characterId];
      if (!character) return state;
      const injuries = character.injuries.map((category) => {
        if (category.id !== event.categoryId) return category;
        const boxes = [...category.boxes] as [
          (typeof category.boxes)[0],
          (typeof category.boxes)[1],
        ];
        boxes[event.boxIndex] = { ...boxes[event.boxIndex], marked: false };
        return { ...category, boxes };
      });
      return {
        ...state,
        characters: {
          ...state.characters,
          [character.id]: {
            ...character,
            injuries,
            blood: Math.max(0, character.blood - event.bloodSpent),
          },
        },
      };
    }
    case "ActionDeclared": {
      const roll: RollRecord = {
        id: event.rollId,
        characterId: event.characterId,
        actorMemberId: event.actorMemberId,
        status: "declared",
        declaredStat: event.stat,
        declaredItemIds: event.itemIds,
        declaredAbilityIds: event.abilityIds,
        declaredBonusClaimIds: event.bonusClaimIds,
        declaredEngagedThreatIds: event.engagedThreatIds,
        note: event.note,
      };
      return {
        ...state,
        rolls: { ...state.rolls, [roll.id]: roll },
        nextRollSequence: state.nextRollSequence + 1,
      };
    }
    case "ActionRolled": {
      const existingRoll = state.rolls[event.rollId];
      const character = state.characters[event.characterId];
      if (!existingRoll || !character) return state;
      const updatedRoll: RollRecord = {
        ...existingRoll,
        status: "awaiting_allocation",
        approvedBonusClaims: event.approvedBonusClaims,
        engagedThreatIds: event.engagedThreatIds,
        primaryEngagedThreatId: event.primaryEngagedThreatId,
        playerFaces: event.playerFaces,
        keptDice: event.keptDice,
        attackDiceRolled: event.attackDiceRolled,
        attackFaces: event.attackFaces,
        attackSuccessesRolled: event.attackSuccessesRolled,
      };
      const chargedItemIds = new Set(event.itemIdsCharged);
      const items = character.items.map((item) =>
        chargedItemIds.has(item.id)
          ? { ...item, usesRemaining: Math.max(0, item.usesRemaining - 1) }
          : item,
      );
      const blood = Math.min(
        MAX_BLOOD,
        Math.max(0, character.blood - event.bloodSpent + event.passiveBloodGained),
      );
      return {
        ...state,
        rolls: { ...state.rolls, [updatedRoll.id]: updatedRoll },
        characters: { ...state.characters, [character.id]: { ...character, items, blood } },
      };
    }
    case "ActionResolved": {
      let next = state;
      for (const delta of event.objectiveDeltas) next = applyObjectiveDelta(next, delta);
      for (const delta of event.threatDeltas) next = applyThreatDelta(next, delta);

      const character = next.characters[event.characterId];
      if (character) {
        let items = character.items;
        for (const restore of event.itemRestoreDeltas) {
          items = items.map((item) =>
            item.id === restore.itemId
              ? {
                  ...item,
                  usesRemaining: Math.min(item.maxUses, item.usesRemaining + restore.amount),
                }
              : item,
          );
        }
        let injuries = character.injuries;
        if (event.injuryClearedCount > 0) {
          let remaining = event.injuryClearedCount;
          injuries = character.injuries.map((category) => {
            const boxes = category.boxes.map((box) => {
              if (remaining > 0 && box.marked) {
                remaining -= 1;
                return { ...box, marked: false };
              }
              return box;
            }) as [(typeof category.boxes)[0], (typeof category.boxes)[1]];
            return { ...category, boxes };
          });
        }
        const blood = Math.min(MAX_BLOOD, Math.max(0, character.blood + event.bloodDelta));
        next = {
          ...next,
          characters: {
            ...next.characters,
            [character.id]: { ...character, items, injuries, blood },
          },
        };
      }

      const existingRoll = next.rolls[event.rollId];
      if (existingRoll) {
        const updatedRoll: RollRecord = {
          ...existingRoll,
          status: event.injuryChoicePendingMode ? "awaiting_injury_choice" : "resolved",
          remainingAttackSuccessesAfterAllocation: event.remainingAttackSuccessesAfterAllocation,
          ...(event.injuryChoicePendingMode
            ? { injuryChoicePending: { mode: event.injuryChoicePendingMode } }
            : {}),
        };
        next = { ...next, rolls: { ...next.rolls, [updatedRoll.id]: updatedRoll } };
      }

      if (event.injuryMark) {
        next = applyInjuryMark(next, event.characterId, event.injuryMark);
      }
      return next;
    }
    case "InjuryCategoryChosen": {
      let next = applyInjuryMark(state, event.characterId, event.mark);
      const existingRoll = next.rolls[event.rollId];
      if (existingRoll) {
        const { injuryChoicePending: _drop, ...rest } = existingRoll;
        next = {
          ...next,
          rolls: { ...next.rolls, [event.rollId]: { ...rest, status: "resolved" } },
        };
      }
      return next;
    }
  }
}

function project(state: EatTheReichState, viewer: ViewerContext): EatTheReichView {
  const isGm = viewer.capability === "gm";
  const roster = Object.values(state.characters).map(toPartySummary);
  const ownCharacter =
    viewer.capability === "player"
      ? Object.values(state.characters).find((c) => c.claimedByMemberId === viewer.viewerId)
      : undefined;
  const objectives = Object.values(state.objectives).map(toObjectiveView);
  const threats = Object.values(state.threats)
    .filter((threat) => isGm || threat.revealed)
    .map((threat) => (isGm ? toThreatGmView(threat) : toThreatPublicView(threat)));
  const rolls = Object.values(state.rolls)
    .filter((roll) => roll.status !== "resolved")
    .map((roll) => toRollView(roll, viewer, isGm));
  return {
    self: ownCharacter ? toFullSheet(ownCharacter) : null,
    roster,
    gmSheets: isGm ? Object.values(state.characters).map(toFullSheet) : [],
    objectives,
    threats,
    rolls,
  };
}

const EMPTY_POOL_EXPLANATION: PoolExplanation = {
  components: [],
  total: 0,
  diceSides: DICE_SIDES,
  successThreshold: SUCCESS_THRESHOLD,
};

/**
 * `PoolInput` (packages/contracts) is still shaped for the old placeholder
 * (`actionId`, `gearIds`) — proposed for extension to Sonnet A
 * (docs/ETR_RULES_IMPLEMENTATION_PLAN.md §7, GitHub issue #14). This adapts
 * it: `actionId` doubles as the chosen stat name (or `"none"`), `gearIds`
 * doubles as `itemIds`. Ability-die/bonus-claim preview is not
 * representable yet and is simply omitted; `decide` (`ReviewAction`) is not
 * constrained by `PoolInput` and computes the real pool in full.
 */
function explainPool(
  projection: ViewerProjection<EatTheReichView>,
  input: PoolInput,
): PoolExplanation {
  const self = projection.view.self;
  if (!self) return EMPTY_POOL_EXPLANATION;
  const stat = isStat(input.actionId) ? input.actionId : "none";
  const outcome = buildPool(self, { stat, itemIds: input.gearIds, abilityIds: [] });
  if (!outcome.ok) return EMPTY_POOL_EXPLANATION;
  return {
    components: outcome.result.components,
    total: outcome.result.total,
    diceSides: DICE_SIDES,
    successThreshold: SUCCESS_THRESHOLD,
  };
}

/**
 * A UI catalog of legal targets for an `awaiting_allocation` roll (matrix
 * 3.5). `costPerUse`/`maxUses` are informational bounds for the client;
 * the authoritative check is `decide`'s `AllocateResults` validation, which
 * enforces the real per-target Challenge/SPECIAL/noFeeding rules — this
 * catalog does not (e.g. it does not subtract Challenge from `maxUses`).
 */
function validAllocations(
  projection: ViewerProjection<EatTheReichView>,
  roll: VisibleRoll,
): readonly AllocationOption[] {
  const rollView = projection.view.rolls.find((candidate) => candidate.rollId === roll.rollId);
  if (!rollView || !("keptDice" in rollView) || rollView.status !== "awaiting_allocation") {
    return [];
  }
  const keptDice = rollView.keptDice ?? [];
  if (keptDice.length === 0) return [];
  const maxUses = keptDice.length;
  const options: AllocationOption[] = [];
  for (const objective of projection.view.objectives) {
    if (objective.status === "active") {
      options.push({
        id: `objective:${objective.id}`,
        label: objective.title,
        costPerUse: 1,
        maxUses,
      });
    }
  }
  for (const threat of projection.view.threats) {
    if (threat.status === "active") {
      options.push({ id: `threat:${threat.id}`, label: threat.name, costPerUse: 1, maxUses });
    }
  }
  if ((rollView.attackSuccessesRolled ?? 0) > 0) {
    options.push({ id: "defend", label: "Defend", costPerUse: 1, maxUses });
  }
  options.push({ id: "feed", label: "Feed", costPerUse: 1, maxUses });
  const self = projection.view.self;
  const hasCritical = keptDice.some((die) => die.result === "critical");
  if (self && hasCritical) {
    for (const ability of self.abilities) {
      if (ability.trigger === "special") {
        options.push({
          id: `special:${ability.id}`,
          label: ability.name,
          costPerUse: 2,
          maxUses: 1,
        });
      }
    }
  }
  return options;
}

function theatre(event: EatTheReichEvent, prefs: PresentationPreferences): TheatreScene | null {
  const durationHintMs = prefs.reducedMotion ? 0 : 500;
  const rollDurationHintMs = prefs.reducedMotion ? 0 : 900;
  const cues = prefs.reducedMotion ? [] : [{ kind: "dice-roll", atMs: 0 }];
  switch (event.type) {
    case "CharacterClaimed": {
      const announcement = "A character was claimed.";
      return {
        id: `${event.characterId}-claimed`,
        semanticLabel: announcement,
        priority: "ambient",
        durationHintMs,
        cues: [],
        fallback: { announcement },
      };
    }
    case "CharacterReleased": {
      const announcement = "A character was released.";
      return {
        id: `${event.characterId}-released`,
        semanticLabel: announcement,
        priority: "ambient",
        durationHintMs,
        cues: [],
        fallback: { announcement },
      };
    }
    case "InjuryHealed": {
      const announcement = "An injury was healed.";
      return {
        id: `${event.characterId}-healed`,
        semanticLabel: announcement,
        priority: "result",
        durationHintMs,
        cues: [],
        fallback: { announcement },
      };
    }
    case "ActionDeclared": {
      const announcement = "An action was declared.";
      return {
        id: `${event.rollId}-declared`,
        semanticLabel: announcement,
        priority: "ambient",
        durationHintMs,
        cues: [],
        fallback: { announcement },
      };
    }
    case "ActionRolled": {
      const successCount = event.keptDice.filter((d) => d.result === "success").length;
      const criticalCount = event.keptDice.filter((d) => d.result === "critical").length;
      const announcement = `Rolled ${successCount} success${successCount === 1 ? "" : "es"} and ${criticalCount} critical${criticalCount === 1 ? "" : "s"}.`;
      return {
        id: `${event.rollId}-rolled`,
        semanticLabel: announcement,
        priority: "result",
        durationHintMs: rollDurationHintMs,
        cues,
        fallback: { announcement },
      };
    }
    case "ActionResolved": {
      const announcement = event.injuryMark?.downed
        ? "The character is downed."
        : "The action resolves.";
      return {
        id: `${event.rollId}-resolved`,
        semanticLabel: announcement,
        priority: "result",
        durationHintMs,
        cues: [],
        fallback: { announcement },
      };
    }
    case "InjuryCategoryChosen": {
      const announcement = "An injury is marked.";
      return {
        id: `${event.rollId}-injury-choice`,
        semanticLabel: announcement,
        priority: "result",
        durationHintMs,
        cues: [],
        fallback: { announcement },
      };
    }
  }
}

function initialState(_input: InitialCampaignInput): EatTheReichState {
  const characters = Object.fromEntries(
    ORIGINAL_ROSTER.map((character) => [
      character.id,
      { ...character, claimedByMemberId: null, blood: Math.min(MAX_BLOOD, character.blood) },
    ]),
  );
  return {
    schemaVersion: 3,
    characters,
    objectives: {},
    threats: {},
    rolls: {},
    nextRollSequence: 1,
  };
}

function migrate(
  record: VersionedTemplateRecord & { readonly state: unknown },
): MigrationResult<EatTheReichState> {
  if (record.templateId !== EAT_THE_REICH_MANIFEST.templateId) {
    return { ok: false, reason: `Unexpected templateId "${record.templateId}".` };
  }
  if (record.schemaVersion !== 3) {
    return {
      ok: false,
      reason: `No migration path from schemaVersion ${record.schemaVersion} (docs/ETR_RULES_IMPLEMENTATION_PLAN.md §1: fresh start, no live rooms exist under any prior shape).`,
    };
  }
  return { ok: true, state: parseState(record.state), schemaVersion: 3 };
}

export const eatTheReichTemplate: GameTemplate<
  EatTheReichState,
  EatTheReichCommand,
  EatTheReichEvent,
  EatTheReichView
> = {
  manifest: EAT_THE_REICH_MANIFEST,
  schemas: { parseState, parseCommand, parseEvent, parseView },
  initialState,
  authorizeGameAction,
  decide,
  reduce,
  project,
  explainPool,
  validAllocations,
  theatre,
  migrate,
};
