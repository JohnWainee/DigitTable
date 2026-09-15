import { useState } from "react";
import { navigate } from "../router.js";
import {
  ConnectionStatusStrip,
  useFixtureConnectionState,
} from "../shell/ConnectionStatusStrip.js";
import { FixtureModeBanner } from "../shell/FixtureModeBanner.js";
import {
  clearOwnershipRecord,
  readOwnershipRecord,
  resumeRoute,
  type LocalOwnershipRecord,
} from "../session/ownership.js";
import { isLiveMode } from "../session/roomClient.js";

/** docs/ETR_SESSION_FLOW.md section 1: `/` — Landing: Create / Join / Resume. */
export function LandingScreen(): JSX.Element {
  const connection = useFixtureConnectionState();
  const [ownership, setOwnership] = useState<LocalOwnershipRecord | null>(() =>
    readOwnershipRecord(),
  );

  function handleForgetSession(): void {
    clearOwnershipRecord();
    setOwnership(null);
  }

  return (
    <main className="landing-screen">
      <ConnectionStatusStrip state={connection} />
      <FixtureModeBanner />
      <header className="landing-hero">
        <h1>Eat the Reich</h1>
        <p>
          Vampire commandos, occupied Paris. Start a session, join one, or pick up where you left
          off.
        </p>
      </header>

      {ownership && (
        <section className="landing-resume" aria-labelledby="resume-heading">
          <h2 id="resume-heading">Resume</h2>
          <p>
            You were <strong>{ownership.displayName}</strong> ({ownership.capability})
            {ownership.sessionName ? (
              <>
                {" "}
                in <strong>{ownership.sessionName}</strong>
              </>
            ) : null}
            .
          </p>
          {!isLiveMode && (
            <p className="landing-resume-caveat">
              Fixture mode keeps no state after a full page reload, so resuming may say the session
              has ended.
            </p>
          )}
          <div className="landing-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => navigate(resumeRoute(ownership))}
            >
              Resume session
            </button>
            <button type="button" className="secondary-action" onClick={handleForgetSession}>
              Forget this session
            </button>
          </div>
        </section>
      )}

      <nav className="landing-actions landing-actions--primary" aria-label="Start">
        <button type="button" className="primary-action" onClick={() => navigate("/create")}>
          Create a session
        </button>
        <button type="button" className="primary-action" onClick={() => navigate("/join")}>
          Join by code
        </button>
        <button type="button" className="secondary-action" onClick={() => navigate("/table")}>
          Join as the table display
        </button>
      </nav>
    </main>
  );
}
