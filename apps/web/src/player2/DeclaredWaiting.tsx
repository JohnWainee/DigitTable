/** docs/ETR_SESSION_FLOW.md section 6.1: the "declared -> awaiting_gm_review" state. */
export function DeclaredWaiting(): JSX.Element {
  return (
    <section className="step" aria-labelledby="declared-heading">
      <h2 id="declared-heading">Declared</h2>
      <p>Waiting for the GM to confirm bonus dice and opposition&hellip;</p>
    </section>
  );
}
