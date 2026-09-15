import type {
  AbilityState,
  AdvanceState,
  InjuryCategoryState,
  ItemState,
  LastStandState,
  Stat,
} from "./state.js";

/**
 * Every viewer (player/GM/table) sees this much about every roster
 * character, including one they have not claimed (docs/ETR_SESSION_FLOW.md
 * §4.3 claim screen needs stats to choose from; §10 table party strip needs
 * Blood/injury pips/downed).
 */
export interface CharacterPartySummary {
  readonly id: string;
  readonly name: string;
  readonly concept: string;
  readonly portraitId: string;
  readonly claimedByMemberId: string | null;
  readonly stats: Readonly<Record<Stat, number>>;
  readonly blood: number;
  /** Count of marked injury boxes, 0-6. Detail (which box, penalty) is sheet-only. */
  readonly injuryBoxesMarked: number;
  readonly downed: boolean;
  readonly retired: boolean;
}

/**
 * The full sheet: visible only to the claiming member (as `self`) and the
 * GM (docs/ETR_SESSION_FLOW.md §7 "every character's full sheet"). Never
 * present in another player's or the table's projection.
 */
export interface CharacterFullSheet extends CharacterPartySummary {
  readonly items: readonly ItemState[];
  readonly abilities: readonly AbilityState[];
  readonly advances: readonly AdvanceState[];
  readonly injuries: readonly InjuryCategoryState[];
  readonly lastStand: LastStandState;
  readonly activeLootId: string | null;
}

export interface EatTheReichView {
  /** The viewer's own claimed character's full sheet, or null if they have none (or are GM/table). */
  readonly self: CharacterFullSheet | null;
  /** Every roster character's public summary, including the viewer's own. */
  readonly roster: readonly CharacterPartySummary[];
  /** GM only: every character's full sheet, keyed by character id. Empty for non-GM viewers. */
  readonly gmSheets: readonly CharacterFullSheet[];
}
