import {
  allow,
  deny,
  decided,
  rejected,
  stableError,
  broadcastEvent,
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
import type { EatTheReichCommand } from "./commands.js";
import type { EatTheReichEvent } from "./events.js";
import { EAT_THE_REICH_MANIFEST } from "./manifest.js";
import { buildPool, DICE_SIDES, SUCCESS_THRESHOLD } from "./pool.js";
import { ORIGINAL_ROSTER } from "./roster.js";
import { parseCommand, parseEvent, parseState, parseView } from "./schemas.js";
import {
  isStat,
  type CharacterState,
  type EatTheReichState,
  type InjuryPenaltyTag,
} from "./state.js";
import type { CharacterFullSheet, CharacterPartySummary, EatTheReichView } from "./view.js";

const HEAL_INJURY_BLOOD_COST = 3;
const MAX_BLOOD = 10;

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
  const penaltyTags: readonly InjuryPenaltyTag[] = character.injuries
    .flatMap((c) => c.boxes)
    .filter((b) => b.marked && b.penalty)
    .map((b) => b.penalty as InjuryPenaltyTag);
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

function authorizeGameAction(
  ctx: AuthorizedMemberContext,
  command: EatTheReichCommand,
): AuthorizationResult {
  switch (command.type) {
    case "ClaimCharacter":
      if (ctx.capability !== "player") {
        return deny(stableError("ROLE_FORBIDDEN", "Only a player may claim a character."));
      }
      return allow();
    case "ReleaseCharacter":
      if (ctx.capability !== "player") {
        return deny(stableError("ROLE_FORBIDDEN", "Only a player may release a character."));
      }
      return allow();
    case "HealInjury":
      if (ctx.capability !== "player") {
        return deny(stableError("ROLE_FORBIDDEN", "Only a player may heal an injury."));
      }
      return allow();
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
  }
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
  }
}

function project(state: EatTheReichState, viewer: ViewerContext): EatTheReichView {
  const roster = Object.values(state.characters).map(toPartySummary);
  const isGm = viewer.capability === "gm";
  const ownCharacter =
    viewer.capability === "player"
      ? Object.values(state.characters).find((c) => c.claimedByMemberId === viewer.viewerId)
      : undefined;
  return {
    self: ownCharacter ? toFullSheet(ownCharacter) : null,
    roster,
    gmSheets: isGm ? Object.values(state.characters).map(toFullSheet) : [],
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
 * (`actionId`, `gearIds`). Until it is extended for the new pool model
 * (stat/items/abilities — a follow-up contract proposal to Sonnet A, not
 * blocking), this adapts it: `actionId` doubles as the chosen stat name (or
 * `"none"`), and `gearIds` doubles as `itemIds`. Ability-die preview is not
 * yet representable and is simply omitted from this preview; B03's `decide`
 * is not constrained by `PoolInput` and computes the real pool in full.
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

/** No active-roll concept exists until B03; there are never valid allocation targets yet. */
function validAllocations(
  _projection: ViewerProjection<EatTheReichView>,
  _roll: VisibleRoll,
): readonly AllocationOption[] {
  return [];
}

function theatre(event: EatTheReichEvent, prefs: PresentationPreferences): TheatreScene | null {
  const durationHintMs = prefs.reducedMotion ? 0 : 500;
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
  }
}

function initialState(_input: InitialCampaignInput): EatTheReichState {
  const characters = Object.fromEntries(
    ORIGINAL_ROSTER.map((character) => [
      character.id,
      { ...character, claimedByMemberId: null, blood: Math.min(MAX_BLOOD, character.blood) },
    ]),
  );
  return { schemaVersion: 2, characters };
}

function migrate(
  record: VersionedTemplateRecord & { readonly state: unknown },
): MigrationResult<EatTheReichState> {
  if (record.templateId !== EAT_THE_REICH_MANIFEST.templateId) {
    return { ok: false, reason: `Unexpected templateId "${record.templateId}".` };
  }
  if (record.schemaVersion !== 2) {
    return {
      ok: false,
      reason: `No migration path from schemaVersion ${record.schemaVersion} (docs/ETR_RULES_IMPLEMENTATION_PLAN.md §1: fresh start, no live rooms exist under the old shape).`,
    };
  }
  return { ok: true, state: parseState(record.state), schemaVersion: 2 };
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
