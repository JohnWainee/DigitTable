import {
  allow,
  broadcastEvent,
  decided,
  deny,
  rejected,
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
  type ViewerContext,
  type ViewerProjection,
  type VisibleRoll,
} from "@digitable/contracts";
import {
  ADVANCE_OBJECTIVE_OPTION_ID,
  DAMAGE_THREAT_OPTION_ID,
  allocationOptionsFor,
} from "./allocations.js";
import type { EatTheReichCommand } from "./commands.js";
import {
  ACTION_ID,
  PLACEHOLDER_LOCATION,
  PLACEHOLDER_OBJECTIVE,
  PLACEHOLDER_THREAT,
  placeholderCharacter,
} from "./content.js";
import type { EatTheReichEvent } from "./events.js";
import { EAT_THE_REICH_MANIFEST } from "./manifest.js";
import { computeVisiblePool, rollPool } from "./pool.js";
import { DICE_SIDES, SUCCESS_THRESHOLD } from "./content.js";
import { parseCommand, parseEvent, parseState, parseView } from "./schemas.js";
import type { EatTheReichState, RollState } from "./state.js";
import type {
  ActiveRollView,
  CharacterFullView,
  CharacterPublicSummary,
  EatTheReichView,
  ThreatGmSummary,
  ThreatPublicSummary,
} from "./view.js";

/** The GM's opposition push-dice input is bounded to this range (0..MAX_PUSH_DICE), inclusive. */
export const MAX_PUSH_DICE = 2;

function decideBeginAction(
  ctx: DecisionContext<EatTheReichState>,
  command: Extract<EatTheReichCommand, { type: "BeginAction" }>,
): Decision<EatTheReichEvent> {
  const character = ctx.state.characters[command.actorMemberId];
  if (!character) {
    return rejected(stableError("UNKNOWN_ACTION", "No character is bound to this member."));
  }
  const threat = ctx.state.threats[command.threatId];
  if (!threat || threat.status !== "active") {
    return rejected(stableError("UNKNOWN_ACTION", "No such active threat."));
  }
  if (command.actionId !== ACTION_ID) {
    return rejected(stableError("UNKNOWN_ACTION", "Unknown action."));
  }
  const hasUnresolvedRoll = Object.values(ctx.state.rolls).some(
    (roll) => roll.actorMemberId === command.actorMemberId && roll.status !== "resolved",
  );
  if (hasUnresolvedRoll) {
    return rejected(
      stableError("ROLL_ALREADY_RESOLVED", "Resolve your current action before starting another."),
    );
  }

  const visible = computeVisiblePool(character, command.actionId, command.gearIds);
  const totalPool = visible.total + threat.hiddenDifficultyModifier;
  const { faces, hits } = rollPool(ctx.random, totalPool);

  const rollId = `roll-${ctx.state.nextRollSequence}`;
  const hiddenAdjustmentApplied = threat.hiddenDifficultyModifier !== 0;
  const poolComponents = {
    nerve: visible.nerve,
    gear: visible.gear,
    hiddenModifier: threat.hiddenDifficultyModifier,
  };

  const fullEvent: EatTheReichEvent = {
    type: "ActionRolled",
    rollId,
    actorMemberId: command.actorMemberId,
    threatId: command.threatId,
    actionId: command.actionId,
    faces,
    hits,
    poolComponents,
    hiddenAdjustmentApplied,
  };
  const redactedForPlayers: EatTheReichEvent = {
    ...fullEvent,
    faces: hiddenAdjustmentApplied ? null : faces,
    poolComponents: { ...poolComponents, hiddenModifier: null },
  };

  return decided([
    {
      eventId: rollId,
      event: fullEvent,
      effects: [
        { destination: { kind: "shared" }, payload: redactedForPlayers },
        { destination: { kind: "gm" }, payload: fullEvent },
      ],
    },
  ]);
}

function decideSubmitOpposition(
  ctx: DecisionContext<EatTheReichState>,
  command: Extract<EatTheReichCommand, { type: "SubmitOpposition" }>,
): Decision<EatTheReichEvent> {
  const roll = ctx.state.rolls[command.rollId];
  if (!roll) {
    return rejected(stableError("UNKNOWN_ACTION", "No such roll."));
  }
  if (roll.status !== "awaiting_opposition") {
    return rejected(stableError("ROLL_ALREADY_RESOLVED", "This roll is not awaiting opposition."));
  }
  const threat = ctx.state.threats[roll.threatId];
  if (!threat) {
    return rejected(stableError("UNKNOWN_ACTION", "No such threat."));
  }
  if (
    !Number.isInteger(command.pushDice) ||
    command.pushDice < 0 ||
    command.pushDice > MAX_PUSH_DICE
  ) {
    return rejected(
      stableError(
        "INVALID_ALLOCATION",
        `Push dice must be an integer between 0 and ${MAX_PUSH_DICE}.`,
      ),
    );
  }

  const { faces, hits } = rollPool(ctx.random, threat.basePool + command.pushDice);
  const netSuccesses = Math.max(0, roll.playerHits - hits);

  const event: EatTheReichEvent = {
    type: "OppositionRolled",
    rollId: roll.id,
    threatId: roll.threatId,
    pushDice: command.pushDice,
    faces,
    hits,
    netSuccesses,
  };

  return decided([broadcastEvent(`${roll.id}-opposition`, event, [{ kind: "shared" }])]);
}

function decideAllocateResults(
  ctx: DecisionContext<EatTheReichState>,
  command: Extract<EatTheReichCommand, { type: "AllocateResults" }>,
): Decision<EatTheReichEvent> {
  const roll = ctx.state.rolls[command.rollId];
  if (!roll) {
    return rejected(stableError("UNKNOWN_ACTION", "No such roll."));
  }
  if (roll.actorMemberId !== ctx.actor.memberId) {
    return rejected(stableError("ROLE_FORBIDDEN", "You may only allocate your own roll."));
  }
  if (roll.status !== "awaiting_allocation" || roll.netSuccesses === undefined) {
    return rejected(stableError("ROLL_ALREADY_RESOLVED", "This roll is not awaiting allocation."));
  }
  const threat = ctx.state.threats[roll.threatId];
  if (!threat) {
    return rejected(stableError("UNKNOWN_ACTION", "No such threat."));
  }

  const options = allocationOptionsFor(threat, ctx.state.objective, roll.netSuccesses);
  const optionById = new Map(options.map((option) => [option.id, option]));

  let totalCost = 0;
  const seenOptionIds = new Set<string>();
  for (const allocation of command.allocations) {
    if (seenOptionIds.has(allocation.optionId)) {
      return rejected(
        stableError("INVALID_ALLOCATION", `Duplicate allocation option "${allocation.optionId}".`),
      );
    }
    seenOptionIds.add(allocation.optionId);
    const option = optionById.get(allocation.optionId);
    if (!option || !Number.isInteger(allocation.uses) || allocation.uses < 0) {
      return rejected(
        stableError(
          "INVALID_ALLOCATION",
          `Unknown or invalid allocation option "${allocation.optionId}".`,
        ),
      );
    }
    if (allocation.uses > option.maxUses) {
      return rejected(
        stableError("INVALID_ALLOCATION", `"${allocation.optionId}" exceeds its available uses.`),
      );
    }
    totalCost += allocation.uses * option.costPerUse;
  }
  if (totalCost > roll.netSuccesses) {
    return rejected(
      stableError("INVALID_ALLOCATION", "Allocation spends more successes than were earned."),
    );
  }

  const damageUses =
    command.allocations.find((a) => a.optionId === DAMAGE_THREAT_OPTION_ID)?.uses ?? 0;
  const advanceUses =
    command.allocations.find((a) => a.optionId === ADVANCE_OBJECTIVE_OPTION_ID)?.uses ?? 0;

  const threatResolveRemaining = Math.max(0, threat.resolveRemaining - damageUses);
  const threatStatus = threatResolveRemaining <= 0 ? "defeated" : "active";
  const objectiveAdvancesRemaining = Math.max(
    0,
    ctx.state.objective.advancesRemaining - advanceUses,
  );
  const objectiveStatus = objectiveAdvancesRemaining <= 0 ? "complete" : "active";

  const event: EatTheReichEvent = {
    type: "ActionResolved",
    rollId: roll.id,
    allocations: command.allocations,
    threatId: roll.threatId,
    threatResolveRemaining,
    threatStatus,
    objectiveAdvancesRemaining,
    objectiveStatus,
  };

  return decided([broadcastEvent(`${roll.id}-resolved`, event, [{ kind: "shared" }])]);
}

function authorizeGameAction(
  ctx: AuthorizedMemberContext,
  command: EatTheReichCommand,
): AuthorizationResult {
  switch (command.type) {
    case "BeginAction":
      if (ctx.capability !== "player") {
        return deny(stableError("ROLE_FORBIDDEN", "Only a player may begin an action."));
      }
      if (ctx.memberId !== command.actorMemberId) {
        return deny(stableError("ROLE_FORBIDDEN", "A player may only act as themselves."));
      }
      return allow();
    case "SubmitOpposition":
      if (ctx.capability !== "gm") {
        return deny(stableError("ROLE_FORBIDDEN", "Only the GM may submit opposition."));
      }
      return allow();
    case "AllocateResults":
      if (ctx.capability !== "player") {
        return deny(stableError("ROLE_FORBIDDEN", "Only a player may allocate results."));
      }
      return allow();
  }
}

function decide(
  ctx: DecisionContext<EatTheReichState>,
  command: EatTheReichCommand,
): Decision<EatTheReichEvent> {
  switch (command.type) {
    case "BeginAction":
      return decideBeginAction(ctx, command);
    case "SubmitOpposition":
      return decideSubmitOpposition(ctx, command);
    case "AllocateResults":
      return decideAllocateResults(ctx, command);
  }
}

function reduce(state: EatTheReichState, event: EatTheReichEvent): EatTheReichState {
  switch (event.type) {
    case "ActionRolled": {
      if (event.faces === null || event.poolComponents.hiddenModifier === null) {
        throw new Error("reduce requires the full-fidelity ActionRolled event");
      }
      const roll: RollState = {
        id: event.rollId,
        actorMemberId: event.actorMemberId,
        threatId: event.threatId,
        actionId: event.actionId,
        status: "awaiting_opposition",
        playerFaces: event.faces,
        playerHits: event.hits,
        poolComponents: {
          nerve: event.poolComponents.nerve,
          gear: event.poolComponents.gear,
          hiddenModifier: event.poolComponents.hiddenModifier,
        },
        hiddenAdjustmentApplied: event.hiddenAdjustmentApplied,
      };
      return {
        ...state,
        rolls: { ...state.rolls, [roll.id]: roll },
        nextRollSequence: state.nextRollSequence + 1,
      };
    }
    case "OppositionRolled": {
      const existing = state.rolls[event.rollId];
      if (!existing) return state;
      const updated: RollState = {
        ...existing,
        status: "awaiting_allocation",
        pushDice: event.pushDice,
        oppositionFaces: event.faces,
        oppositionHits: event.hits,
        netSuccesses: event.netSuccesses,
      };
      return { ...state, rolls: { ...state.rolls, [updated.id]: updated } };
    }
    case "ActionResolved": {
      const existingRoll = state.rolls[event.rollId];
      const rolls = existingRoll
        ? {
            ...state.rolls,
            [existingRoll.id]: {
              ...existingRoll,
              status: "resolved" as const,
              allocations: event.allocations,
            },
          }
        : state.rolls;
      const existingThreat = state.threats[event.threatId];
      const threats = existingThreat
        ? {
            ...state.threats,
            [existingThreat.id]: {
              ...existingThreat,
              resolveRemaining: event.threatResolveRemaining,
              status: event.threatStatus,
            },
          }
        : state.threats;
      return {
        ...state,
        rolls,
        threats,
        objective: {
          ...state.objective,
          advancesRemaining: event.objectiveAdvancesRemaining,
          status: event.objectiveStatus,
        },
      };
    }
  }
}

function project(state: EatTheReichState, viewer: ViewerContext): EatTheReichView {
  const isGm = viewer.capability === "gm";

  const characters: CharacterPublicSummary[] = Object.values(state.characters).map((character) => ({
    memberId: character.memberId,
    name: character.name,
    wounds: character.wounds,
    maxWounds: character.maxWounds,
  }));

  const ownCharacter = state.characters[viewer.viewerId];
  const self: CharacterFullView | null = ownCharacter
    ? {
        memberId: ownCharacter.memberId,
        name: ownCharacter.name,
        wounds: ownCharacter.wounds,
        maxWounds: ownCharacter.maxWounds,
        attributes: ownCharacter.attributes,
        gear: ownCharacter.gear,
      }
    : null;

  const threats: (ThreatPublicSummary | ThreatGmSummary)[] = Object.values(state.threats).map(
    (threat) => {
      const summary: ThreatPublicSummary = {
        id: threat.id,
        name: threat.name,
        description: threat.description,
        resolveRemaining: threat.resolveRemaining,
        maxResolve: threat.maxResolve,
        status: threat.status,
      };
      return isGm
        ? {
            ...summary,
            hiddenDifficultyModifier: threat.hiddenDifficultyModifier,
            hiddenIntel: threat.hiddenIntel,
          }
        : summary;
    },
  );

  const activeRollState = Object.values(state.rolls).find((roll) => roll.status !== "resolved");
  const activeRoll: ActiveRollView | null = activeRollState
    ? {
        rollId: activeRollState.id,
        actorMemberId: activeRollState.actorMemberId,
        threatId: activeRollState.threatId,
        actionId: activeRollState.actionId,
        status: activeRollState.status,
        playerFaces:
          !isGm && activeRollState.hiddenAdjustmentApplied ? null : activeRollState.playerFaces,
        playerHits: activeRollState.playerHits,
        hiddenAdjustmentApplied: activeRollState.hiddenAdjustmentApplied,
        ...(isGm
          ? { hiddenDifficultyModifier: activeRollState.poolComponents.hiddenModifier }
          : {}),
        ...(activeRollState.pushDice !== undefined ? { pushDice: activeRollState.pushDice } : {}),
        ...(activeRollState.oppositionFaces !== undefined
          ? { oppositionFaces: activeRollState.oppositionFaces }
          : {}),
        ...(activeRollState.oppositionHits !== undefined
          ? { oppositionHits: activeRollState.oppositionHits }
          : {}),
        ...(activeRollState.netSuccesses !== undefined
          ? { netSuccesses: activeRollState.netSuccesses }
          : {}),
        ...(activeRollState.allocations !== undefined
          ? { allocations: activeRollState.allocations }
          : {}),
      }
    : null;

  return {
    location: state.location,
    objective: state.objective,
    self,
    characters,
    threats,
    activeRoll,
  };
}

const EMPTY_POOL_EXPLANATION: PoolExplanation = {
  components: [],
  total: 0,
  diceSides: DICE_SIDES,
  successThreshold: SUCCESS_THRESHOLD,
};

function explainPool(
  projection: ViewerProjection<EatTheReichView>,
  input: PoolInput,
): PoolExplanation {
  const self = projection.view.self;
  if (!self || input.actionId !== ACTION_ID) {
    return EMPTY_POOL_EXPLANATION;
  }
  const visible = computeVisiblePool(self, input.actionId, input.gearIds);
  return {
    components: [
      { label: "Nerve", value: visible.nerve },
      ...(visible.gear > 0 ? [{ label: "Gear", value: visible.gear }] : []),
    ],
    total: visible.total,
    diceSides: DICE_SIDES,
    successThreshold: SUCCESS_THRESHOLD,
  };
}

function validAllocations(
  projection: ViewerProjection<EatTheReichView>,
  roll: VisibleRoll,
): readonly AllocationOption[] {
  const activeRoll = projection.view.activeRoll;
  if (!activeRoll || activeRoll.rollId !== roll.rollId) {
    return [];
  }
  if (roll.status !== "awaiting_allocation" || roll.netSuccesses === null) {
    return [];
  }
  const threat = projection.view.threats.find((candidate) => candidate.id === activeRoll.threatId);
  if (!threat) {
    return [];
  }
  return allocationOptionsFor(threat, projection.view.objective, roll.netSuccesses).map(
    (option) => ({
      id: option.id,
      label: option.label,
      costPerUse: option.costPerUse,
      maxUses: option.maxUses,
    }),
  );
}

function theatre(event: EatTheReichEvent, prefs: PresentationPreferences): TheatreScene | null {
  const durationHintMs = prefs.reducedMotion ? 0 : 900;
  const cues = prefs.reducedMotion ? [] : [{ kind: "dice-roll", atMs: 0 }];

  switch (event.type) {
    case "ActionRolled": {
      const announcement = `Rolled ${event.hits} success${event.hits === 1 ? "" : "es"}.`;
      return {
        id: `${event.rollId}-rolled`,
        semanticLabel: announcement,
        priority: "result",
        durationHintMs,
        cues,
        fallback: { announcement },
      };
    }
    case "OppositionRolled": {
      const announcement = `Opposition rolled ${event.hits} success${event.hits === 1 ? "" : "es"}.`;
      return {
        id: `${event.rollId}-opposition`,
        semanticLabel: announcement,
        priority: "result",
        durationHintMs,
        cues,
        fallback: { announcement },
      };
    }
    case "ActionResolved": {
      const announcement =
        event.threatStatus === "defeated" ? "The Enforcer is defeated." : "The action resolves.";
      return {
        id: `${event.rollId}-resolved`,
        semanticLabel: announcement,
        priority: "result",
        durationHintMs,
        cues: [],
        fallback: { announcement },
      };
    }
  }
}

/**
 * `memberIds` may be empty: board task A03's `createRoom` calls this at room
 * creation time, before any player has joined, so no player member exists
 * yet to own the placeholder character (only the GM seat, which is not a
 * `memberIds` entry — a GM does not hold a player character). Characters is
 * empty until the first player joins; real per-player character assignment
 * is board task B02's job (verified sheet fields, distinct claims), not this
 * placeholder engine's. Passing at least one member ID (as
 * `templates/eat-the-reich/test/fixtures.ts` and
 * `apps/web/src/repository/InMemoryRoomRepository.ts`'s local-only
 * single-browser simulation both still do) keeps today's placeholder
 * behavior of pre-assigning the one placeholder character unchanged.
 */
function initialState(input: InitialCampaignInput): EatTheReichState {
  const [firstMemberId] = input.memberIds;
  const character = firstMemberId === undefined ? null : placeholderCharacter(firstMemberId);
  const characters = character === null ? {} : { [character.memberId]: character };
  return {
    schemaVersion: 1,
    location: PLACEHOLDER_LOCATION,
    objective: PLACEHOLDER_OBJECTIVE,
    characters,
    threats: { [PLACEHOLDER_THREAT.id]: PLACEHOLDER_THREAT },
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
  if (record.schemaVersion !== 1) {
    return { ok: false, reason: `No migration path from schemaVersion ${record.schemaVersion}.` };
  }
  return { ok: true, state: parseState(record.state), schemaVersion: 1 };
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
