import type { ActionResolvedSummary } from "./usePlayerActionFlow.js";

export interface ConfirmStepProps {
  readonly summary: ActionResolvedSummary;
  readonly onPlayAgain: () => void;
}

/** confirm (docs/IMPLEMENTATION_ROADMAP.md, Phase 1B: "compose, explain, roll, wait, allocate, and confirm"). */
export function ConfirmStep({ summary, onPlayAgain }: ConfirmStepProps): JSX.Element {
  return (
    <section aria-labelledby="confirm-heading" className="step">
      <h2 id="confirm-heading">Resolved</h2>
      <p>
        The Enforcer is{" "}
        {summary.threatStatus === "defeated"
          ? "defeated."
          : `still standing (${summary.threatResolveRemaining} resolve remaining).`}
      </p>
      <p>
        The objective is{" "}
        {summary.objectiveStatus === "complete"
          ? "complete."
          : `still active (${summary.objectiveAdvancesRemaining} advance${summary.objectiveAdvancesRemaining === 1 ? "" : "s"} remaining).`}
      </p>
      <button type="button" className="primary-action" onClick={onPlayAgain}>
        Play again
      </button>
    </section>
  );
}
