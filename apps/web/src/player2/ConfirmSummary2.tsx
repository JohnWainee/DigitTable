import type { ResolvedOutcome } from "../session/fixturePlayLoop.js";

export interface ConfirmSummary2Props {
  readonly resolved: ResolvedOutcome;
  readonly onPlayAgain: () => void;
}

/** docs/ETR_SESSION_FLOW.md section 6.4: summary from the projection, never local arithmetic. */
export function ConfirmSummary2({ resolved, onPlayAgain }: ConfirmSummary2Props): JSX.Element {
  return (
    <section className="step" aria-labelledby="resolved-heading">
      <h2 id="resolved-heading">Resolved</h2>
      <ul>
        {resolved.lines.map((line, i) => (
          <li key={`${line.label}-${i}`}>
            <strong>{line.label}:</strong> {line.detail}
          </li>
        ))}
      </ul>
      <p>Your turn is done this round.</p>
      <button type="button" className="primary-action" onClick={onPlayAgain}>
        Back to scene
      </button>
    </section>
  );
}
