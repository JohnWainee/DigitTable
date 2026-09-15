import { useEffect, useRef, useState } from "react";

export interface CorrectionDialogProps {
  readonly characterName: string;
  readonly currentBlood: number;
  readonly onApply: (delta: number, reason: string) => void;
  readonly onClose: () => void;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * docs/ETR_SESSION_FLOW.md section 7: `CorrectCharacter` — bounded,
 * reason-required. This first cut covers Blood only.
 *
 * Accessibility (C05, hardened after independent review — see
 * docs/reviews/2026-09-15-etr-screens-independent-review.md): focus moves
 * into the dialog on open and returns to whatever triggered it on close;
 * Escape closes it; Tab is trapped inside the dialog while it's open (a
 * keyboard user can no longer tab into the backdrop-covered console behind
 * it); the Blood preview is a polite live region; the stepper is grouped
 * under one accessible label instead of a `<label>` pointing at a
 * non-control `<span>`.
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
  const dialogRef = useRef<HTMLDivElement>(null);
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
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      // The dialog's initial focus lands on its (non-interactive,
      // tabIndex=-1) heading, not on `first` — treat that the same as
      // "first" for wrap purposes so the very first Shift+Tab doesn't
      // escape the trap before any real control has been visited.
      const atStart = active === first || active === headingRef.current;
      if (event.shiftKey && atStart) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialogRef.current.contains(active)) {
        // Focus escaped the dialog (e.g. programmatically) - pull it back in.
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="correction-heading"
        className="modal"
        ref={dialogRef}
      >
        <h2 id="correction-heading" tabIndex={-1} ref={headingRef}>
          Correct {characterName}
        </h2>
        <div className="form-field">
          <div role="group" aria-labelledby="correction-delta-label">
            <span id="correction-delta-label">Blood change</span>
            <div className="stepper-controls">
              <button
                type="button"
                onClick={() => setDelta((d) => d - 1)}
                aria-label="Decrease Blood change"
              >
                −
              </button>
              <span className="stepper-value">{delta > 0 ? `+${delta}` : delta}</span>
              <button
                type="button"
                onClick={() => setDelta((d) => d + 1)}
                aria-label="Increase Blood change"
              >
                +
              </button>
            </div>
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
