import type { KeyboardEvent } from "react";
import type { AllocationOption } from "@digitable/contracts";

export interface AllocationStepperProps {
  readonly option: AllocationOption;
  readonly value: number;
  /** Net successes still available if this stepper's own current value were zero. */
  readonly budgetIfZero: number;
  readonly onChange: (next: number) => void;
}

/**
 * A tap/select- and keyboard-operable bounded-integer control (docs/UX_
 * RESOLUTION_THEATRE.md: "Never require drag; allocations also support
 * tap/select and keyboard input"). Deliberately not a native `<input
 * type="number">`: on a phone, a numeric text field summons the on-screen
 * keyboard for a value that only ever needs a handful of small integer
 * steps, which both risks covering the control and offers no benefit over
 * direct +/- taps or arrow keys. The spinbutton role keeps it a first-class
 * accessible control without ever needing that keyboard. Shared between the
 * player's net-success allocation and the GM's opposition push-dice input
 * (docs/PHASE_1C_PLAN.md: "reusing Phase 1B's shared UI primitives").
 */
export function AllocationStepper({
  option,
  value,
  budgetIfZero,
  onChange,
}: AllocationStepperProps): JSX.Element {
  const max = Math.min(option.maxUses, Math.floor(budgetIfZero / option.costPerUse));

  function clamp(next: number): number {
    return Math.max(0, Math.min(max, next));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    switch (event.key) {
      case "ArrowUp":
      case "ArrowRight":
        event.preventDefault();
        onChange(clamp(value + 1));
        break;
      case "ArrowDown":
      case "ArrowLeft":
        event.preventDefault();
        onChange(clamp(value - 1));
        break;
      case "Home":
        event.preventDefault();
        onChange(0);
        break;
      case "End":
        event.preventDefault();
        onChange(max);
        break;
      default:
        break;
    }
  }

  const labelId = `allocation-${option.id}-label`;

  return (
    <div className="allocation-stepper">
      <span id={labelId}>
        {option.label} (costs {option.costPerUse} each, up to {option.maxUses})
      </span>
      <div className="stepper-controls">
        <button
          type="button"
          aria-label={`Decrease ${option.label}`}
          onClick={() => onChange(clamp(value - 1))}
          disabled={value <= 0}
        >
          −
        </button>
        <div
          role="spinbutton"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${value} of up to ${option.maxUses}`}
          onKeyDown={handleKeyDown}
          className="stepper-value"
        >
          {value}
        </div>
        <button
          type="button"
          aria-label={`Increase ${option.label}`}
          onClick={() => onChange(clamp(value + 1))}
          disabled={value >= max}
        >
          +
        </button>
      </div>
    </div>
  );
}
