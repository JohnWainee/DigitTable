import type {
  CharacterFullSheet,
  EatTheReichEvent,
  EatTheReichView,
  InjuryPenaltyTag,
} from "@digitable/template-eat-the-reich";
import { Icon } from "../shared/Icon.js";

export type ActionResolvedEvent = Extract<EatTheReichEvent, { type: "ActionResolved" }>;

export interface ConfirmSummary2Props {
  readonly resolved: ActionResolvedEvent;
  /** The character's sheet as it stood immediately before this resolution (for injury/item names — the projection has already moved on by the time this renders). */
  readonly character: CharacterFullSheet;
  readonly objectives: EatTheReichView["objectives"];
  readonly threats: EatTheReichView["threats"];
  /** The roll's `attackSuccessesRolled`, captured before allocation cleared it from view — lets a Defend-only line report how many were removed. */
  readonly attackSuccessesRolled: number;
  readonly onContinue: () => void;
}

function describePenalty(tag: InjuryPenaltyTag): string {
  switch (tag.kind) {
    case "noBonusDice":
      return "No bonus dice from items or abilities.";
    case "noSpecials":
      return "SPECIAL abilities are unusable.";
    case "oneItemPerTurn":
      return "Only one item may be used per turn.";
    case "statDelta":
      return Object.entries(tag.deltas)
        .map(([stat, delta]) => `${stat} ${delta >= 0 ? "+" : ""}${delta}`)
        .join(", ");
    case "allStatsDelta":
      return `All stats ${tag.amount >= 0 ? "+" : ""}${tag.amount}.`;
    case "noBloodSpend":
      return "Blood cannot be spent.";
    case "noBloodGain":
      return "Blood cannot be gained.";
    case "bloodUpkeep":
      return `Lose ${tag.amount} Blood each round.`;
    default:
      return "";
  }
}

/**
 * docs/ETR_SESSION_FLOW.md section 6.4: summary built entirely from the
 * real `ActionResolved` event's deltas (never re-derived arithmetic) —
 * F05 P1: the injury line names the category and states its penalty text
 * by looking up `injuryMark.categoryId`/`boxIndexes` against the
 * character's own `injuries` sheet, instead of just "an injury was
 * marked."
 */
export function ConfirmSummary2({
  resolved,
  character,
  objectives,
  threats,
  attackSuccessesRolled,
  onContinue,
}: ConfirmSummary2Props): JSX.Element {
  const lines: { readonly label: string; readonly detail: string }[] = [];
  // c07 P1: a Defend-only line — every attack success that was rolled got
  // absorbed (by `defend` and/or a SPECIAL's `removeAttackSuccesses`) and
  // no injury resulted, so nothing else in `resolved` otherwise says so.
  const removedAttackSuccesses =
    attackSuccessesRolled - resolved.remainingAttackSuccessesAfterAllocation;
  if (
    removedAttackSuccesses > 0 &&
    resolved.remainingAttackSuccessesAfterAllocation === 0 &&
    !resolved.injuryMark
  ) {
    lines.push({
      label: "Defended",
      detail: `Removed ${removedAttackSuccesses} attack success${removedAttackSuccesses === 1 ? "" : "es"}, no injury.`,
    });
  }

  for (const delta of resolved.objectiveDeltas) {
    const objective = objectives.find((o) => o.id === delta.objectiveId);
    lines.push({
      label: objective?.title ?? "Objective",
      detail: delta.status === "complete" ? "Complete!" : `Rating now ${delta.ratingAfter}.`,
    });
  }
  for (const delta of resolved.threatDeltas) {
    const threat = threats.find((t) => t.id === delta.threatId);
    lines.push({
      label: threat?.name ?? "Threat",
      detail:
        delta.status === "active"
          ? `Rating ${delta.ratingAfter}, attack ${delta.attackAfter}.`
          : delta.status === "removed"
            ? "Destroyed!"
            : "Beaten back.",
    });
  }
  if (resolved.bloodDelta !== 0) {
    lines.push({
      label: "Blood",
      detail: `${resolved.bloodDelta > 0 ? "+" : ""}${resolved.bloodDelta}.`,
    });
  }
  for (const restore of resolved.itemRestoreDeltas) {
    const item = character.items.find((i) => i.id === restore.itemId);
    lines.push({ label: item?.name ?? "Item", detail: `+${restore.amount} use(s) restored.` });
  }
  if (resolved.injuryClearedCount > 0) {
    lines.push({
      label: "Injuries cleared",
      detail: `${resolved.injuryClearedCount} box(es).`,
    });
  }
  if (resolved.attackBumpThreatId) {
    const threat = threats.find((t) => t.id === resolved.attackBumpThreatId);
    lines.push({
      label: threat?.name ?? "Threat",
      detail: "Attack increased — no successes were removed this roll.",
    });
  }
  // While an injury choice is pending its mark has not arrived yet: the choice
  // is what resolves these successes, so they are not "unresolved".
  if (
    resolved.remainingAttackSuccessesAfterAllocation > 0 &&
    !resolved.injuryMark &&
    !resolved.injuryChoicePendingMode
  ) {
    lines.push({
      label: "Unresolved opposition",
      detail: `${resolved.remainingAttackSuccessesAfterAllocation} attack success(es) got through.`,
    });
  }

  const injuryMark = resolved.injuryMark;
  const injuryCategory = injuryMark
    ? character.injuries.find((c) => c.id === injuryMark.categoryId)
    : null;

  return (
    <section className="step" aria-labelledby="resolved-heading">
      <h2 id="resolved-heading">Resolved</h2>
      <ul>
        {lines.map((line, i) => (
          <li key={`${line.label}-${i}`}>
            <strong>{line.label}:</strong> {line.detail}
          </li>
        ))}
      </ul>

      {injuryMark && injuryCategory && (
        <div className="injury-summary" role="status">
          <p>
            <Icon name="injury-marked" /> <strong>{injuryCategory.label}</strong> marked
            {injuryMark.downed ? " — downed!" : ""}
          </p>
          <ul>
            {injuryMark.boxIndexes.map((boxIndex) => {
              const box = injuryCategory.boxes[boxIndex];
              const penaltyText = box?.penalty ? describePenalty(box.penalty) : null;
              return (
                <li key={boxIndex}>
                  Box {boxIndex + 1}
                  {penaltyText ? `: ${penaltyText}` : " marked."}
                </li>
              );
            })}
          </ul>
          {injuryMark.rescueObjective && (
            <p>
              A rescue Objective, &ldquo;{injuryMark.rescueObjective.title}&rdquo;, has been added
              to the scene.
            </p>
          )}
        </div>
      )}

      <p>Your turn is done this round.</p>
      <button type="button" className="primary-action" onClick={onContinue}>
        Back to scene
      </button>
    </section>
  );
}
