import { useState } from "react";
import { navigate } from "../router.js";
import {
  ConnectionStatusStrip,
  useFixtureConnectionState,
} from "../shell/ConnectionStatusStrip.js";
import { FixtureModeBanner } from "../shell/FixtureModeBanner.js";
import {
  writeOwnershipRecord,
  type RoomAdmissionAccepted,
} from "../session/FixtureSessionGateway.js";
import { fixtureSessionGateway as gateway } from "../session/gateway.js";
import type { SessionRequestState } from "../session/sessionRequestState.js";
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
    try {
      const result = await gateway.joinRoom({
        requestId,
        roomCode: roomCode.toUpperCase(),
        passphrase,
        requestedCapability: "player",
        displayName,
      });
      setRequest({ status: "accepted", requestId, result });
      writeOwnershipRecord({
        roomId: result.roomId,
        roomCode: result.roomCode,
        memberId: result.memberId,
        capability: result.capability,
        recoveryCode: result.recoveryCode,
        displayName,
        sessionName: gateway.sessionNameFor(result.roomId) ?? "",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "That didn't go through. Try again.";
      const code =
        error instanceof Error && "code" in error
          ? String((error as { code: unknown }).code)
          : "INVALID_REQUEST";
      setRequest({ status: "rejected", requestId, code, message });
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
