import { useEffect, useRef, useState } from "react";

export interface CorrectionDialogProps {
  readonly characterName: string;
  readonly currentBlood: number;
  readonly onApply: (delta: number, reason: string) => void;
  readonly onClose: () => void;
}

/**
 * docs/ETR_SESSION_FLOW.md section 7: `CorrectCharacter` — bounded,
 * reason-required. This first cut covers Blood only.
 *
 * Accessibility (C05): focus moves into the dialog on open and returns to
 * whatever triggered it on close (a native `<dialog>`-like contract for a
 * plain `role="dialog"` element, since browser support for `<dialog>`'s own
 * focus handling is inconsistent); Escape closes it; the Blood preview is a
 * polite live region so a screen-reader user hears the pending value change
 * as they step it, not just at submit time.
 */
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
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    headingRef.current?.focus();
    return () => {
      previouslyFocused.current?.focus();
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="correction-heading" className="modal">
        <h2 id="correction-heading" tabIndex={-1} ref={headingRef}>
          Correct {characterName}
        </h2>
        <div className="form-field">
          <label htmlFor="correction-delta">Blood change</label>
          <div className="stepper-controls">
            <button
              type="button"
              onClick={() => setDelta((d) => d - 1)}
              aria-label="Decrease Blood change"
            >
              −
            </button>
            <span id="correction-delta" className="stepper-value">
              {delta > 0 ? `+${delta}` : delta}
            </span>
            <button
              type="button"
              onClick={() => setDelta((d) => d + 1)}
              aria-label="Increase Blood change"
            >
              +
            </button>
          </div>
          <p className="form-hint" role="status" aria-live="polite">
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
