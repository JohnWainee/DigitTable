export interface ActionFeedbackProps {
  readonly pending: boolean;
  readonly error: string | null | undefined;
}

/**
 * Keeps command progress and rejection visible while a long mobile surface is
 * scrolled. The shared component prevents GM, player, and roster flows from
 * drifting into different feedback semantics.
 */
export function ActionFeedback({ pending, error }: ActionFeedbackProps): JSX.Element {
  return (
    <section className="action-feedback" aria-label="Action feedback">
      {pending && (
        <p role="status">
          Your action is awaiting confirmation. Reconnecting will check it automatically.
        </p>
      )}
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
    </section>
  );
}
