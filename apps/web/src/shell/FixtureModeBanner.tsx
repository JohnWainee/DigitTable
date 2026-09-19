import { isLiveMode } from "../session/roomClient.js";

/**
 * docs/ETR_SESSION_FLOW.md section 11: "With no Firebase configuration the
 * app runs the in-memory repository. It must: label itself 'Local fixture'
 * in the header." (C06 also labels the document title in fixture
 * mode — see `shell/documentTitle.ts`.) Now conditional on `roomClient.ts`'s real live/fixture
 * decision (`hasFirebaseConfig`), not unconditional — a live build renders
 * nothing here.
 */
export function FixtureModeBanner(): JSX.Element | null {
  if (isLiveMode) return null;
  return (
    <p className="fixture-banner" role="note">
      Local fixture — not a live room. Nothing here leaves this browser tab.
    </p>
  );
}
