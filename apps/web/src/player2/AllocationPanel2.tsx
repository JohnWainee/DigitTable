import { AllocationStepper } from "../shared/AllocationStepper.js";
import {
  allocatedPoints,
  totalRollPoints,
  validAllocationTargets,
  type ActiveRollState,
  type FixtureCharacterState,
  type FixtureSceneState,
} from "../session/fixturePlayLoop.js";

export interface AllocationPanel2Props {
  readonly roll: ActiveRollState;
  readonly character: FixtureCharacterState;
  readonly scene: FixtureSceneState;
  readonly onAssign: (targetKey: string, points: number) => void;
  readonly onConfirm: () => void;
}

/** docs/ETR_SESSION_FLOW.md section 6.3: dice chips (display) + AllocationStepper quick-assign per target. */
export function AllocationPanel2({
  roll,
  character,
  scene,
  onAssign,
  onConfirm,
}: AllocationPanel2Props): JSX.Element {
  const targets = validAllocationTargets(scene, character, roll);
  const total = totalRollPoints(roll);
  const assigned = allocatedPoints(roll);
  const unassigned = total - assigned;

  return (
    <section className="step" aria-labelledby="allocation-heading">
      <h2 id="allocation-heading">Your roll</h2>

      <ul className="dice-chip-row" aria-label="Kept dice">
        {roll.keptDice.map((die) => (
          <li key={die.id} className={`die-chip die-chip--${die.kind}`}>
            {die.face} {die.kind === "critical" ? "(critical)" : "(success)"}
          </li>
        ))}
      </ul>
      {roll.discardedDice.length > 0 && (
        <ul className="dice-chip-row" aria-label="Discarded dice">
          {roll.discardedDice.map((die) => (
            <li key={die.id} className="die-chip die-chip--discard">
              {die.face} (discarded)
            </li>
          ))}
        </ul>
      )}

      <p>
        Opposition: {roll.gmAttackSuccessesRemaining} attack success
        {roll.gmAttackSuccessesRemaining === 1 ? "" : "es"}.
      </p>
      <p>
        {unassigned} of {total} points left to assign.
      </p>

      <div className="allocation-list">
        {targets.map((target) => {
          const value = roll.allocations[target.key] ?? 0;
          return (
            <div key={target.key}>
              <p>
                <strong>{target.label}</strong> &mdash; {target.detail}
              </p>
              <AllocationStepper
                option={{ id: target.key, label: target.label, costPerUse: 1, maxUses: total }}
                value={value}
                budgetIfZero={unassigned + value}
                onChange={(next) => onAssign(target.key, next)}
              />
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="primary-action"
        disabled={unassigned !== 0}
        onClick={onConfirm}
      >
        Confirm allocation
      </button>
    </section>
  );
}
