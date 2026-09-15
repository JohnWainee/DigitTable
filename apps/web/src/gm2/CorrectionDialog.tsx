import { useState } from "react";

export interface CorrectionDialogProps {
  readonly characterName: string;
  readonly currentBlood: number;
  readonly onApply: (delta: number, reason: string) => void;
  readonly onClose: () => void;
}

/** docs/ETR_SESSION_FLOW.md section 7: `CorrectCharacter` — bounded, reason-required. This first cut covers Blood only. */
export function CorrectionDialog({
  characterName,
  currentBlood,
  onApply,
  onClose,
}: CorrectionDialogProps): JSX.Element {
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const next = Math.max(0, Math.min(10, currentBlood + delta));
  const canApply = reason.trim().length > 0 && delta !== 0;

  return (
    <div className="modal-backdrop" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="correction-heading" className="modal">
        <h2 id="correction-heading">Correct {characterName}</h2>
        <div className="form-field">
          <label htmlFor="correction-delta">Blood change</label>
          <div className="stepper-controls">
            <button type="button" onClick={() => setDelta((d) => d - 1)} aria-label="Decrease">
              −
            </button>
            <span id="correction-delta" className="stepper-value">
              {delta > 0 ? `+${delta}` : delta}
            </span>
            <button type="button" onClick={() => setDelta((d) => d + 1)} aria-label="Increase">
              +
            </button>
          </div>
          <p className="form-hint">
            Blood {currentBlood} &rarr; {next}
          </p>
        </div>
        <div className="form-field">
          <label htmlFor="correction-reason">Reason (required)</label>
          <input
            id="correction-reason"
            type="text"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="landing-actions">
          <button
            type="button"
            className="primary-action"
            disabled={!canApply}
            onClick={() => onApply(delta, reason)}
          >
            Apply correction
          </button>
          <button type="button" className="secondary-action" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
