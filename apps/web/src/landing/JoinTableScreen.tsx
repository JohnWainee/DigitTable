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

/** docs/ETR_SESSION_FLOW.md section 4.4: `/table` — join a shared display. No secrets, no controls after admission. */
export function JoinTableScreen(): JSX.Element {
  const connection = useFixtureConnectionState();
  const [roomCode, setRoomCode] = useState("");
  const [tableCode, setTableCode] = useState("");
  const [request, setRequest] = useState<SessionRequestState<RoomAdmissionAccepted>>({
    status: "idle",
  });

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (request.status === "pending") return;
    const requestId = globalThis.crypto.randomUUID();
    setRequest({ status: "pending", requestId });
    try {
      const result = await gateway.joinTable({
        requestId,
        roomCode: roomCode.toUpperCase(),
        tableCode: tableCode.toUpperCase(),
      });
      setRequest({ status: "accepted", requestId, result });
      writeOwnershipRecord({
        roomId: result.roomId,
        roomCode: result.roomCode,
        memberId: result.memberId,
        capability: result.capability,
        recoveryCode: null,
        displayName: "Table",
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
      <h1>Join as the table display</h1>
      <p>For the shared screen everyone can see — no controls, no private information.</p>

      {!accepted && (
        <form
          className="session-form"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div className="form-field">
            <label htmlFor="table-room-code">Room code</label>
            <input
              id="table-room-code"
              type="text"
              required
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="table-code">Table code</label>
            <input
              id="table-code"
              type="text"
              required
              value={tableCode}
              onChange={(e) => setTableCode(e.target.value)}
            />
          </div>
          <button type="submit" className="primary-action" disabled={request.status === "pending"}>
            {request.status === "pending" ? "Connecting…" : "Connect display"}
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
        message={request.status === "pending" ? "Connecting…" : accepted ? "Connected." : ""}
      />

      {accepted && (
        <section aria-live="polite">
          <p>Connected. The full table display (scene, party strip, route map) arrives with C03.</p>
          <button type="button" className="primary-action" onClick={() => navigate("/demo")}>
            Open the fixture demo table view
          </button>
        </section>
      )}
    </main>
  );
}
