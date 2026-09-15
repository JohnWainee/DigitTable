import type {
  AbilityState,
  AdvanceState,
  BonusClaimRecord,
  InjuryCategoryState,
  InjuryChoicePending,
  ItemState,
  KeptDie,
  LastStandState,
  ObjectiveState,
  RollStatus,
  Stat,
  ThreatFlags,
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

export interface ObjectiveView {
  readonly id: string;
  readonly title: string;
  readonly kind: ObjectiveState["kind"];
  readonly rating: number;
  readonly challenge: number;
  readonly status: "active" | "complete";
}

export interface ThreatPublicView {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  readonly attack: number;
  readonly challenge: number;
  readonly solo: boolean;
  readonly elite: boolean;
  readonly flags: ThreatFlags;
  readonly status: "active" | "beaten" | "removed";
}

/** GM-only: every Threat, including unrevealed ones, carries `revealed` and its foreshadowing `notes`. */
export interface ThreatGmView extends ThreatPublicView {
  readonly revealed: boolean;
  readonly notes: string;
}

/**
 * A roll another viewer (not its owner, not the GM) may not yet see the
 * detail of: while `status` is `"declared"` (awaiting GM review), only that
 * a character is acting is shown (docs/ETR_SESSION_FLOW.md §6.1: "other
 * players' pending declarations visible only as acting").
 */
export interface RollViewActing {
  readonly rollId: string;
  readonly characterId: string;
  readonly status: "declared";
}

/**
 * Full roll detail: always shown to the roll's owner and the GM; shown to
 * every viewer once the roll has moved past `"declared"` — matrix §6.2:
 * "nothing hidden here in ETR" once dice are rolled.
 */
export interface RollViewFull {
  readonly rollId: string;
  readonly characterId: string;
  readonly status: RollStatus;
  readonly declaredStat: Stat | "none";
  readonly declaredItemIds: readonly string[];
  readonly declaredAbilityIds: readonly string[];
  readonly declaredBonusClaimIds: readonly string[];
  readonly declaredEngagedThreatIds: readonly string[];
  readonly note: string | null;
  readonly approvedBonusClaims?: readonly BonusClaimRecord[];
  readonly engagedThreatIds?: readonly string[];
  readonly playerFaces?: readonly number[];
  readonly keptDice?: readonly KeptDie[];
  readonly attackDiceRolled?: number;
  readonly attackFaces?: readonly number[];
  readonly attackSuccessesRolled?: number;
  readonly remainingAttackSuccessesAfterAllocation?: number;
  readonly injuryChoicePending?: InjuryChoicePending;
}

export type RollView = RollViewActing | RollViewFull;

/** Public scene summary (matrix flow §5, §10): every viewer sees the same fields. */
export interface SceneView {
  readonly id: string;
  readonly title: string;
  readonly locationLabel: string;
  readonly round: number;
  readonly actedThisRound: readonly string[];
  readonly reinforcementsMode: "book" | "simplified";
  readonly status: "active" | "completed";
}

export interface EatTheReichView {
  /** The viewer's own claimed character's full sheet, or null if they have none (or are GM/table). */
  readonly self: CharacterFullSheet | null;
  /** Every roster character's public summary, including the viewer's own. */
  readonly roster: readonly CharacterPartySummary[];
  /** GM only: every character's full sheet, keyed by character id. Empty for non-GM viewers. */
  readonly gmSheets: readonly CharacterFullSheet[];
  /** `null` before the GM's first `LoadScene` (matrix flow §5's empty state). */
  readonly scene: SceneView | null;
  readonly objectives: readonly ObjectiveView[];
  /** GM sees every Threat (as `ThreatGmView`); everyone else sees only revealed ones (as `ThreatPublicView`). */
  readonly threats: readonly (ThreatPublicView | ThreatGmView)[];
  /**
   * Every non-resolved roll, viewer-appropriate detail (see `RollView`).
   * Resolved rolls are dropped from the projection once seen (their effects
   * already live in `roster`/`objectives`/`threats`).
   */
  readonly rolls: readonly RollView[];
  /** matrix 3.8 T1: shown to every viewer with no actor identity (never who paused). */
  readonly paused: boolean;
  readonly missionEnded: boolean;
}
