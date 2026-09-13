import { useState } from "react";
import type { AllocationOption, VisibleRoll } from "@digitable/contracts";
import type { ActiveRollView, RollAllocation } from "@digitable/template-eat-the-reich";
import { AllocationStepper } from "../shared/AllocationStepper.js";

export interface ActiveRollPanelProps {
  readonly roll: ActiveRollView;
  readonly validAllocations: (roll: VisibleRoll) => readonly AllocationOption[];
  readonly onAllocate: (allocations: readonly RollAllocation[]) => void;
}

/** roll, wait for opposition, and allocate (docs/UX_RESOLUTION_THEATRE.md / docs/EAT_THE_REICH_BUILD_GUIDE.md). */
export function ActiveRollPanel({
  roll,
  validAllocations,
  onAllocate,
}: ActiveRollPanelProps): JSX.Element {
  const netSuccesses = roll.netSuccesses ?? 0;
  const visibleRoll: VisibleRoll = {
    rollId: roll.rollId,
    status: roll.status,
    netSuccesses: roll.netSuccesses ?? null,
  };
  // `validAllocations` is a cheap pure lookup over projection-scale data (docs/TEMPLATE_ARCHITECTURE.md);
  // recomputing per render avoids a memo dependency on a freshly-built `visibleRoll` object every time.
  const options = validAllocations(visibleRoll);
  const [uses, setUses] = useState<Record<string, number>>({});

  const spentSoFar = options.reduce(
    (sum, option) => sum + (uses[option.id] ?? 0) * option.costPerUse,
    0,
  );
  const remaining = netSuccesses - spentSoFar;

  function setUsesFor(optionId: string, next: number): void {
    setUses((current) => ({ ...current, [optionId]: next }));
  }

  function submit(): void {
    const allocations: RollAllocation[] = options
      .map((option) => ({ optionId: option.id, uses: uses[option.id] ?? 0 }))
      .filter((allocation) => allocation.uses > 0);
    onAllocate(allocations);
  }

  return (
    <section aria-labelledby="roll-heading" className="step">
      <h2 id="roll-heading">Your roll</h2>
      <p>
        {roll.playerFaces === null
          ? `${roll.playerHits} success${roll.playerHits === 1 ? "" : "es"} (exact dice concealed by scene difficulty).`
          : `Faces: ${roll.playerFaces.join(", ")} — ${roll.playerHits} success${roll.playerHits === 1 ? "" : "es"}.`}
      </p>

      {roll.status === "awaiting_opposition" && <p role="status">Waiting on the opposition…</p>}

      {roll.status === "awaiting_allocation" && roll.oppositionHits !== undefined && (
        <>
          <p>
            Opposition: {roll.oppositionHits} success{roll.oppositionHits === 1 ? "" : "es"}. Net
            successes: <strong>{netSuccesses}</strong>.
          </p>

          {options.length === 0 ? (
            <p>No successes to allocate.</p>
          ) : (
            <div className="allocation-list" role="group" aria-label="Allocate net successes">
              {options.map((option) => (
                <AllocationStepper
                  key={option.id}
                  option={option}
                  value={uses[option.id] ?? 0}
                  budgetIfZero={remaining + (uses[option.id] ?? 0) * option.costPerUse}
                  onChange={(next) => setUsesFor(option.id, next)}
                />
              ))}
            </div>
          )}

          <p aria-live="polite">
            {remaining >= 0
              ? `${remaining} success${remaining === 1 ? "" : "es"} unspent.`
              : `Over-allocated by ${-remaining}.`}
          </p>

          <button
            type="button"
            className="primary-action"
            onClick={submit}
            disabled={remaining < 0}
          >
            Confirm allocation
          </button>
        </>
      )}
    </section>
  );
}
