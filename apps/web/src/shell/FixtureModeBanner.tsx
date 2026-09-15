/**
 * docs/ETR_SESSION_FLOW.md section 11: "With no Firebase configuration the
 * app runs the in-memory repository. It must: label itself 'Local fixture'
 * in the header and title." Every screen this milestone renders is in
 * fixture mode (A05's live repository has not landed), so this banner is
 * unconditional for now; once a live-mode check exists it gates here.
 */
export function FixtureModeBanner(): JSX.Element {
  return (
    <p className="fixture-banner" role="note">
      Local fixture — not a live room. Nothing here leaves this browser tab.
    </p>
  );
}
