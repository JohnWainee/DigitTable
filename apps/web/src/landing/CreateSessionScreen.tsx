import { useRef, useState } from "react";
import { navigate } from "../router.js";
import {
  ConnectionStatusStrip,
  useFixtureConnectionState,
} from "../shell/ConnectionStatusStrip.js";
import { FixtureModeBanner } from "../shell/FixtureModeBanner.js";
import {
  getOrMintCreateRequestId,
  clearCreateRequestId,
  writeOwnershipRecord,
  ownershipFromAcceptedWithNames,
} from "../session/ownership.js";
import { createRoom } from "../session/roomClient.js";
import type { SessionRequestState } from "@digitable/contracts";
import type { CreateRoomAccepted } from "@digitable/contracts";
import { LiveRegion } from "../accessibility/LiveRegion.js";
import { InvitePanel } from "../gm2/InvitePanel.js";

/** docs/ETR_SESSION_FLOW.md section 3: `/create` — Create session (GM). */
export function CreateSessionScreen(): JSX.Element {
  const connection = useFixtureConnectionState();
  const [sessionName, setSessionName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [creatorDisplayName, setCreatorDisplayName] = useState("");
  const [request, setRequest] = useState<SessionRequestState<CreateRoomAccepted>>({
    status: "idle",
  });
  const [wroteDownSecrets, setWroteDownSecrets] = useState(false);
  const [readyAcknowledged, setReadyAcknowledged] = useState(false);
  const requestIdRef = useRef(getOrMintCreateRequestId());

  const accepted = request.status === "accepted" ? request.result : null;

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (request.status === "pending") return; // double-click cannot mint a second request
    const requestId = requestIdRef.current;
    setRequest({ status: "pending", requestId });
    const result = await createRoom({ requestId, sessionName, passphrase, creatorDisplayName });
    if (result.ok) {
      setRequest({ status: "accepted", requestId, result });
      clearCreateRequestId();
    } else {
      setRequest({ status: "rejected", requestId, code: result.code, message: result.message });
    }
  }

  function handleAcknowledgeSecrets(): void {
    if (!accepted) return;
    writeOwnershipRecord(ownershipFromAcceptedWithNames(accepted, creatorDisplayName, sessionName));
    // c07 P1: the secrets card (passphrase/recovery/table code) never
    // renders again after this — nothing here re-shows a shown-once secret.
    setReadyAcknowledged(true);
  }

  return (
    <main className="landing-screen">
      <ConnectionStatusStrip state={connection} />
      <FixtureModeBanner />
      <h1>Create a session</h1>

      {!accepted && (
        <form
          className="session-form"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div className="form-field">
            <label htmlFor="session-name">Session name</label>
            <input
              id="session-name"
              type="text"
              required
              maxLength={60}
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="passphrase">Passphrase</label>
            <input
              id="passphrase"
              type="text"
              required
              minLength={4}
              maxLength={128}
              autoComplete="off"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
            <p className="form-hint">
              Share this with your players. It is never shown again after this screen.
            </p>
          </div>
          <div className="form-field">
            <label htmlFor="creator-display-name">Your display name</label>
            <input
              id="creator-display-name"
              type="text"
              required
              maxLength={40}
              value={creatorDisplayName}
              onChange={(e) => setCreatorDisplayName(e.target.value)}
            />
          </div>
          <p>
            Template: <strong>Eat the Reich</strong> (fixed for this session)
          </p>
          <button type="submit" className="primary-action" disabled={request.status === "pending"}>
            {request.status === "pending" ? "Creating…" : "Create session"}
          </button>
          {request.status === "rejected" && (
            <p role="alert" className="error-message">
              {request.message}
            </p>
          )}
        </form>
      )}

      <LiveRegion
        politeness="polite"
        message={
          request.status === "pending"
            ? "Creating your session…"
            : request.status === "accepted"
              ? "Session created."
              : ""
        }
      />

      {accepted && !readyAcknowledged && (
        <section className="reveal-card" aria-labelledby="reveal-heading">
          <h2 id="reveal-heading">Write these down — shown once</h2>
          <dl>
            <dt>Room code</dt>
            <dd>{accepted.roomCode}</dd>
            <dt>Passphrase</dt>
            <dd>{passphrase}</dd>
            <dt>Table code</dt>
            <dd>{accepted.tableCode ?? <em>Already shown once; not re-issued.</em>}</dd>
            <dt>GM recovery code</dt>
            <dd>{accepted.recoveryCode ?? <em>Already shown once; not re-issued.</em>}</dd>
          </dl>
          {/* The whole row is the label, so the tap target is the row (>= 48px), not just the box. */}
          <label className="gear-option form-field--checkbox" htmlFor="wrote-down">
            <input
              id="wrote-down"
              type="checkbox"
              checked={wroteDownSecrets}
              onChange={(e) => setWroteDownSecrets(e.target.checked)}
            />
            I have written these down
          </label>
          <button
            type="button"
            className="primary-action"
            disabled={!wroteDownSecrets}
            onClick={handleAcknowledgeSecrets}
          >
            I'm ready — continue
          </button>
        </section>
      )}

      {accepted && readyAcknowledged && (
        <>
          <InvitePanel roomCode={accepted.roomCode} />
          <button
            type="button"
            className="primary-action"
            onClick={() => navigate(`/room/${accepted.roomId}/gm`)}
          >
            Open the director console
          </button>
        </>
      )}
    </main>
  );
}
