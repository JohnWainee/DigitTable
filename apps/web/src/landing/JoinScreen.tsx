import { useState } from "react";
import { navigate } from "../router.js";
import {
  ConnectionStatusStrip,
  useFixtureConnectionState,
} from "../shell/ConnectionStatusStrip.js";
import { FixtureModeBanner } from "../shell/FixtureModeBanner.js";
import { writeOwnershipRecord, ownershipFromAcceptedWithNames } from "../session/ownership.js";
import { joinRoom } from "../session/roomClient.js";
import type { RoomAdmissionAccepted, SessionRequestState } from "@digitable/contracts";
import { LiveRegion } from "../accessibility/LiveRegion.js";

/** docs/ETR_SESSION_FLOW.md section 4.2: `/join` — Player join by code + passphrase. */
export function JoinScreen(): JSX.Element {
  const connection = useFixtureConnectionState();
  const [roomCode, setRoomCode] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [request, setRequest] = useState<SessionRequestState<RoomAdmissionAccepted>>({
    status: "idle",
  });

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (request.status === "pending") return;
    const requestId = globalThis.crypto.randomUUID();
    setRequest({ status: "pending", requestId });
    const result = await joinRoom({
      requestId,
      roomCode: roomCode.toUpperCase(),
      passphrase,
      requestedCapability: "player",
      displayName,
    });
    if (result.ok) {
      setRequest({ status: "accepted", requestId, result });
      writeOwnershipRecord(ownershipFromAcceptedWithNames(result, displayName, ""));
    } else {
      setRequest({ status: "rejected", requestId, code: result.code, message: result.message });
    }
  }

  const accepted = request.status === "accepted" ? request.result : null;

  return (
    <main className="landing-screen">
      <ConnectionStatusStrip state={connection} />
      <FixtureModeBanner />
      <h1>Join a session</h1>

      {!accepted && (
        <form
          className="session-form"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div className="form-field">
            <label htmlFor="room-code">Room code</label>
            <input
              id="room-code"
              type="text"
              required
              autoCapitalize="characters"
              pattern="[A-Za-z0-9-]+"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="join-passphrase">Passphrase</label>
            <input
              id="join-passphrase"
              type="text"
              required
              autoComplete="off"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="join-display-name">Your display name</label>
            <input
              id="join-display-name"
              type="text"
              required
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <button type="submit" className="primary-action" disabled={request.status === "pending"}>
            {request.status === "pending" ? "Joining…" : "Join session"}
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
        message={request.status === "pending" ? "Joining…" : accepted ? "Joined." : ""}
      />

      {accepted && accepted.recoveryCode && (
        <section className="reveal-card" aria-labelledby="join-reveal-heading">
          <h2 id="join-reveal-heading">Your recovery code — shown once</h2>
          <p>
            If you lose access to this browser, use this code to get your seat back. Nobody else can
            see it.
          </p>
          <p className="reveal-code">{accepted.recoveryCode}</p>
          <button
            type="button"
            className="primary-action"
            onClick={() => navigate(`/claim/${accepted.roomId}`)}
          >
            I wrote it down — pick a character
          </button>
        </section>
      )}

      {accepted && !accepted.recoveryCode && (
        <section aria-live="polite">
          <p>Welcome back. Continuing to your character.</p>
          <button
            type="button"
            className="primary-action"
            onClick={() => navigate(`/claim/${accepted.roomId}`)}
          >
            Continue
          </button>
        </section>
      )}
    </main>
  );
}
