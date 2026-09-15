import {
  ETR_ROSTER_FIXTURE,
  type RosterAbilityFixture,
  type RosterCharacterFixture,
  type RosterItemFixture,
  type SceneFixture,
  type SceneThreatFixture,
} from "../../test/fixtures/etrTemp.js";

/**
 * TEMPORARY stand-in for B03's real resolution engine
 * (`templates/eat-the-reich`). Sonnet C does not edit
 * `templates/eat-the-reich` or `packages/engine`, and B03 ("correct
 * resolution loop") has not landed — `origin/sonnet-b/b02-characters` is
 * still a non-compiling WIP. This module implements a simplified but real
 * (not scripted) version of the loop described in
 * `docs/ETR_SESSION_FLOW.md` section 6 and `docs/ETR_RULES_MATRIX.md`
 * sections 3.2-3.6, entirely client-side, so C02's screens have a working
 * compose -> declared -> allocate -> confirm loop to render against.
 *
 * Deliberately simplified relative to the rules matrix (each cut is
 * P1/manual in the matrix, never a P0 item): no GM strike-a-claim review
 * (C03 adds the GM screen; here every claim is auto-approved, matching the
 * *current* real engine's declare-then-roll shape until C03 wires GM
 * review in front of this), no SPECIAL-ability allocation target, no
 * Flashback, no late-bonus dice, no per-injury penalty tags (a marked box
 * is just counted), engagement's extra-threat Attack bonus uses the O1
 * formula but reinforcement (S6/S7) is not implemented since scenes don't
 * yet end a round here. Replace this whole file with real
 * `@digitable/engine`/`@digitable/template-eat-the-reich` calls once B03
 * lands (issue #14, C02).
 */

export interface FixtureItemState extends RosterItemFixture {
  readonly usesRemaining: number;
}

export type FixtureAbilityState = RosterAbilityFixture;

export interface FixtureCharacterState {
  readonly id: string;
  readonly name: string;
  readonly concept: string;
  readonly stats: readonly [number, number, number, number, number, number, number];
  readonly blood: number;
  readonly items: readonly FixtureItemState[];
  readonly abilities: readonly FixtureAbilityState[];
  readonly injuriesMarked: number;
  readonly downed: boolean;
  readonly retired: boolean;
}

export interface FixtureSceneState {
  readonly id: string;
  readonly location: string;
  readonly objectiveTitle: string;
  readonly objectiveRating: number;
  readonly objectiveChallenge: number;
  readonly threats: readonly SceneThreatFixture[];
}

export function characterStateFromFixture(fixture: RosterCharacterFixture): FixtureCharacterState {
  return {
    id: fixture.id,
    name: fixture.name,
    concept: fixture.concept,
    stats: fixture.stats,
    blood: 0,
    items: fixture.items.map((item) => ({ ...item, usesRemaining: item.maxUses })),
    abilities: fixture.abilities,
    injuriesMarked: 0,
    downed: false,
    retired: false,
  };
}

export function sceneStateFromFixture(fixture: SceneFixture): FixtureSceneState {
  return {
    id: fixture.id,
    location: fixture.location,
    objectiveTitle: fixture.objectiveTitle,
    objectiveRating: fixture.objectiveRating,
    objectiveChallenge: fixture.objectiveChallenge,
    threats: fixture.threats,
  };
}

export function lookupCharacterFixture(characterId: string): RosterCharacterFixture | undefined {
  return ETR_ROSTER_FIXTURE.find((c) => c.id === characterId);
}

// -- dice --------------------------------------------------------------

export type DieKind = "discard" | "success" | "critical";

export interface RolledDie {
  readonly id: string;
  readonly face: number;
  readonly kind: DieKind;
}

/** D1: 1-3 discard, 4-5 success (1 point), 6 critical (2 points). */
export function interpretDie(face: number): DieKind {
  if (face >= 6) return "critical";
  if (face >= 4) return "success";
  return "discard";
}

export function diePoints(kind: DieKind): number {
  return kind === "critical" ? 2 : kind === "success" ? 1 : 0;
}

function rollD6(): number {
  return 1 + Math.floor((globalThis.crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32) * 6);
}

function rollDice(count: number, prefix: string): RolledDie[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const face = rollD6();
    return { id: `${prefix}-${i}`, face, kind: interpretDie(face) };
  });
}

// -- compose / declare ---------------------------------------------------

export interface DeclareChoice {
  readonly statIndex: number | null; // null = "no stat fits" (2 dice)
  readonly itemIds: readonly string[];
  readonly abilityIds: readonly string[]; // blood1/free only, never "special"
  readonly bonusClaimIds: readonly string[]; // subset of the above ids the player claims a bonus for
  readonly engagedThreatIds: readonly string[];
}

export interface PoolLineItem {
  readonly label: string;
  readonly dice: number;
}

export interface PoolExplanation {
  readonly lines: readonly PoolLineItem[];
  readonly total: number;
}

/** Mirrors the real `GameTemplate.explainPool` shape closely enough for `PoolExplanationDetails` reuse later. */
export function explainDeclareChoice(
  character: FixtureCharacterState,
  choice: DeclareChoice,
): PoolExplanation {
  const lines: PoolLineItem[] = [];
  const statDice = choice.statIndex === null ? 2 : character.stats[choice.statIndex]!;
  lines.push({
    label: choice.statIndex === null ? "No stat fits" : `${statLabel(choice.statIndex)} rating`,
    dice: statDice,
  });
  for (const itemId of choice.itemIds) {
    const item = character.items.find((i) => i.id === itemId);
    if (item) lines.push({ label: item.name, dice: 1 });
  }
  for (const abilityId of choice.abilityIds) {
    const ability = character.abilities.find((a) => a.id === abilityId);
    if (ability) lines.push({ label: ability.name, dice: 1 });
  }
  for (const claimId of choice.bonusClaimIds) {
    const item = character.items.find((i) => i.id === claimId);
    const ability = character.abilities.find((a) => a.id === claimId);
    const source = item ?? ability;
    if (source && "bonusCount" in source && source.bonusCount) {
      lines.push({
        label: `Bonus: ${source.name} (${source.bonusText ?? ""})`,
        dice: source.bonusCount,
      });
    }
  }
  const total = lines.reduce((sum, l) => sum + l.dice, 0);
  return { lines, total };
}

const STAT_LABELS = ["Brawl", "Con", "Fix", "Search", "Shoot", "Sneak", "Terrify"];
function statLabel(index: number): string {
  return STAT_LABELS[index] ?? "Stat";
}

/** O1 (simplified): highest engaged Attack, plus 1 per additional engaged threat. */
function computeAttackDice(scene: FixtureSceneState, engagedThreatIds: readonly string[]): number {
  const engaged = scene.threats.filter((t) => engagedThreatIds.includes(t.id) && t.rating > 0);
  if (engaged.length === 0) return 0;
  const highest = Math.max(...engaged.map((t) => t.attack));
  return highest + (engaged.length - 1);
}

export interface ActiveRollState {
  readonly keptDice: readonly RolledDie[];
  readonly discardedDice: readonly RolledDie[];
  readonly gmAttackSuccessesRemaining: number;
  readonly engagedThreatIds: readonly string[];
  readonly allocations: Readonly<Record<string, number>>; // targetKey -> points assigned
}

export interface DeclareResult {
  readonly character: FixtureCharacterState;
  readonly roll: ActiveRollState;
}

/**
 * Declares, auto-approves every claim (see file doc — C03 adds real GM
 * review), charges Blood/item uses exactly once, and rolls both pools
 * immediately. Returns the updated character (uses/Blood charged) and the
 * resulting roll.
 */
export function declareAndRoll(
  character: FixtureCharacterState,
  scene: FixtureSceneState,
  choice: DeclareChoice,
): DeclareResult {
  let blood = character.blood;
  const items = character.items.map((item) => {
    if (!choice.itemIds.includes(item.id)) return item;
    return { ...item, usesRemaining: Math.max(0, item.usesRemaining - 1) };
  });
  for (const abilityId of choice.abilityIds) {
    const ability = character.abilities.find((a) => a.id === abilityId);
    if (ability?.cost === "blood1") blood = Math.max(0, blood - 1);
  }

  const explanation = explainDeclareChoice(character, choice);
  const playerDice = rollDice(explanation.total, "player");
  const kept = playerDice.filter((d) => d.kind !== "discard");
  const discarded = playerDice.filter((d) => d.kind === "discard");

  const attackDiceCount = computeAttackDice(scene, choice.engagedThreatIds);
  const attackDice = rollDice(attackDiceCount, "gm");
  const gmSuccesses = attackDice.filter((d) => d.face >= 4).length; // D3

  return {
    character: { ...character, blood, items },
    roll: {
      keptDice: kept,
      discardedDice: discarded,
      gmAttackSuccessesRemaining: gmSuccesses,
      engagedThreatIds: choice.engagedThreatIds,
      allocations: {},
    },
  };
}

// -- allocation ----------------------------------------------------------

export type AllocationTargetKind = "objective" | "threat" | "defend" | "feed";

export interface AllocationTarget {
  readonly key: string; // "objective" | `threat:{id}` | "defend" | "feed"
  readonly kind: AllocationTargetKind;
  readonly label: string;
  readonly detail: string;
  readonly challenge: number;
}

export function validAllocationTargets(
  scene: FixtureSceneState,
  character: FixtureCharacterState,
  roll: ActiveRollState,
): readonly AllocationTarget[] {
  const targets: AllocationTarget[] = [];
  if (scene.objectiveRating > 0) {
    targets.push({
      key: "objective",
      kind: "objective",
      label: scene.objectiveTitle,
      detail: `Rating ${scene.objectiveRating}${scene.objectiveChallenge ? `, Challenge ${scene.objectiveChallenge}` : ""}`,
      challenge: scene.objectiveChallenge,
    });
  }
  for (const threatId of roll.engagedThreatIds) {
    const threat = scene.threats.find((t) => t.id === threatId);
    if (threat && threat.rating > 0) {
      targets.push({
        key: `threat:${threat.id}`,
        kind: "threat",
        label: threat.name,
        detail: `Rating ${threat.rating}, Attack ${threat.attack}${threat.challenge ? `, Challenge ${threat.challenge}` : ""}`,
        challenge: threat.challenge,
      });
    }
  }
  if (roll.gmAttackSuccessesRemaining > 0) {
    targets.push({
      key: "defend",
      kind: "defend",
      label: "Defend",
      detail: `${roll.gmAttackSuccessesRemaining} attack success${roll.gmAttackSuccessesRemaining === 1 ? "" : "es"} remaining`,
      challenge: 0,
    });
  }
  if (character.blood < 10) {
    targets.push({
      key: "feed",
      kind: "feed",
      label: "Feed",
      detail: `Blood ${character.blood}/10`,
      challenge: 0,
    });
  }
  return targets;
}

export function totalRollPoints(roll: ActiveRollState): number {
  return roll.keptDice.reduce((sum, d) => sum + diePoints(d.kind), 0);
}

export function allocatedPoints(roll: ActiveRollState): number {
  return Object.values(roll.allocations).reduce((sum, n) => sum + n, 0);
}

export interface ResolvedSummaryLine {
  readonly label: string;
  readonly detail: string;
}

export interface ResolvedOutcome {
  readonly character: FixtureCharacterState;
  readonly scene: FixtureSceneState;
  readonly lines: readonly ResolvedSummaryLine[];
}

/** Applies a completed allocation: challenge absorption, defend, feed, then the injury/downed check (I1/I2, simplified). */
export function resolveAllocation(
  character: FixtureCharacterState,
  scene: FixtureSceneState,
  roll: ActiveRollState,
): ResolvedOutcome {
  const lines: ResolvedSummaryLine[] = [];
  let objectiveRating = scene.objectiveRating;
  const threats = scene.threats.map((t) => ({ ...t }));
  let blood = character.blood;
  let gmRemaining = roll.gmAttackSuccessesRemaining;

  for (const [key, points] of Object.entries(roll.allocations)) {
    if (points <= 0) continue;
    if (key === "objective") {
      const damage = Math.max(0, points - scene.objectiveChallenge);
      objectiveRating = Math.max(0, objectiveRating - damage);
      lines.push({
        label: scene.objectiveTitle,
        detail: `-${damage} (now ${objectiveRating}/${scene.objectiveRating})${objectiveRating === 0 ? " — complete!" : ""}`,
      });
    } else if (key.startsWith("threat:")) {
      const threatId = key.slice("threat:".length);
      const threat = threats.find((t) => t.id === threatId);
      if (threat) {
        const damage = Math.max(0, points - threat.challenge);
        threat.rating = Math.max(0, threat.rating - damage);
        lines.push({
          label: threat.name,
          detail: `-${damage} (now ${threat.rating})${threat.rating === 0 ? " — beaten back!" : ""}`,
        });
      }
    } else if (key === "defend") {
      const removed = Math.min(gmRemaining, points);
      gmRemaining = Math.max(0, gmRemaining - points);
      lines.push({
        label: "Defend",
        detail: `Removed ${removed} attack success${removed === 1 ? "" : "es"}`,
      });
    } else if (key === "feed") {
      const before = blood;
      blood = Math.min(10, blood + points);
      lines.push({ label: "Feed", detail: `Blood ${before} -> ${blood}` });
    }
  }

  let injuriesMarked = character.injuriesMarked;
  let downed = character.downed;
  if (gmRemaining >= 3) {
    downed = true;
    lines.push({
      label: "Downed",
      detail: `${gmRemaining} attack successes got through — you're down.`,
    });
  } else if (gmRemaining >= 1) {
    injuriesMarked = Math.min(6, injuriesMarked + 1);
    lines.push({
      label: "Injury",
      detail: `${gmRemaining} attack success${gmRemaining === 1 ? "" : "es"} got through — one injury marked (${injuriesMarked}/6).`,
    });
  } else {
    lines.push({ label: "No injury", detail: "The GM's attack was fully answered." });
  }

  return {
    character: { ...character, blood, injuriesMarked, downed },
    scene: { ...scene, objectiveRating, threats },
    lines,
  };
}
