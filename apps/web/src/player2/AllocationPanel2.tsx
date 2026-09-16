import { useState } from "react";
import {
  eatTheReichTemplate,
  type AllocationTarget,
  type CharacterFullSheet,
  type EatTheReichView,
  type KeptDie,
  type RollViewFull,
} from "@digitable/template-eat-the-reich";
import type { AllocationOption, ViewerProjection } from "@digitable/contracts";
import { Icon } from "../shared/Icon.js";

export interface AllocationPanel2Props {
  readonly projection: ViewerProjection<EatTheReichView>;
  readonly roll: RollViewFull;
  readonly character: CharacterFullSheet;
  readonly onConfirm: (
    allocations: readonly { readonly dieFaceIndex: number; readonly target: AllocationTarget }[],
  ) => void;
}

/** The real `validAllocations` option ids are exactly `allocationTargetKey`'s format (engine.ts); parse one back into the structured target `AllocateResults` needs. */
function parseTargetFromOptionId(id: string): AllocationTarget {
  if (id === "defend") return { kind: "defend" };
  if (id === "feed") return { kind: "feed" };
  if (id.startsWith("objective:")) {
    return { kind: "objective", objectiveId: id.slice("objective:".length) };
  }
  if (id.startsWith("threat:")) {
    return { kind: "threat", threatId: id.slice("threat:".length) };
  }
  if (id.startsWith("special:")) {
    return { kind: "special", abilityId: id.slice("special:".length) };
  }
  // Defensive only: `validAllocations` is the sole source of these ids; an
  // unrecognised prefix means the template grew a new family this UI does
  // not know about yet, not a state a player can reach.
  throw new Error(`Unknown allocation target id: ${id}`);
}

/**
 * docs/ETR_SESSION_FLOW.md section 6.3: every kept die is allocated to
 * exactly one target (matrix 3.5) — the real `decide` rejects a roll with
 * an unassigned or double-assigned die (engine.ts's `decideAllocateResults`
 * loop), so this is a per-die tap-to-assign control, not a shared points
 * budget. Targets (including F05's SPECIAL row, gated to critical dice,
 * and every active Objective/Threat) come entirely from the real
 * `validAllocations` — this component derives no rules of its own.
 */
export function AllocationPanel2({
  projection,
  roll,
  character,
  onConfirm,
}: AllocationPanel2Props): JSX.Element {
  const keptDice = roll.keptDice ?? [];
  const options = eatTheReichTemplate.validAllocations(projection, {
    rollId: roll.rollId,
    status: "awaiting_allocation",
    netSuccesses: null,
  });
  const [assignments, setAssignments] = useState<Record<number, string>>({});

  const keptFaceIndexes = new Set(keptDice.map((die) => die.faceIndex));
  const discardedFaces = (roll.playerFaces ?? []).filter(
    (_face, index) => !keptFaceIndexes.has(index),
  );
  const unassignedCount = keptDice.filter((die) => !assignments[die.faceIndex]).length;

  function optionsForDie(die: KeptDie): readonly AllocationOption[] {
    return options.filter(
      (option) => die.result === "critical" || !option.id.startsWith("special:"),
    );
  }

  function handleConfirm(): void {
    if (unassignedCount !== 0) return;
    const allocations = keptDice.map((die) => ({
      dieFaceIndex: die.faceIndex,
      target: parseTargetFromOptionId(assignments[die.faceIndex]!),
    }));
    onConfirm(allocations);
  }

  return (
    <section className="step" aria-labelledby="allocation-heading">
      <h2 id="allocation-heading">Your roll</h2>

      <ul className="dice-chip-row" aria-label="Kept dice">
        {keptDice.map((die) => (
          <li key={die.faceIndex} className={`die-chip die-chip--${die.result}`}>
            <Icon name={die.result === "critical" ? "die-critical" : "die-success"} />
            {die.face} ({die.result})
          </li>
        ))}
      </ul>
      {discardedFaces.length > 0 && (
        <ul className="dice-chip-row" aria-label="Discarded dice">
          {discardedFaces.map((face, i) => (
            <li key={`discard-${i}`} className="die-chip die-chip--discard">
              <Icon name="die-discard" />
              {face} (discarded)
            </li>
          ))}
        </ul>
      )}

      {(roll.attackSuccessesRolled ?? 0) > 0 && (
        <p>
          Opposition: {roll.attackSuccessesRolled} attack success
          {roll.attackSuccessesRolled === 1 ? "" : "es"}.
        </p>
      )}
      <p>
        {unassignedCount} of {keptDice.length} {keptDice.length === 1 ? "die" : "dice"} still need a
        target.
      </p>

      <div className="allocation-list">
        {keptDice.map((die) => (
          <fieldset key={die.faceIndex} className="allocation-die-group">
            <legend>
              Die: {die.face} ({die.result})
            </legend>
            <div className="gear-list">
              {optionsForDie(die).map((option) => (
                <label key={option.id} className="gear-option">
                  <input
                    type="radio"
                    name={`die-${die.faceIndex}`}
                    checked={assignments[die.faceIndex] === option.id}
                    onChange={() =>
                      setAssignments((prev) => ({ ...prev, [die.faceIndex]: option.id }))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      <button
        type="button"
        className="primary-action"
        disabled={unassignedCount !== 0}
        onClick={handleConfirm}
      >
        Confirm allocation
      </button>
      {character.downed && <p role="alert">You&rsquo;re down. A teammate must rescue you.</p>}
    </section>
  );
}
