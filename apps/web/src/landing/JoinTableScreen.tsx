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
import { newUuid } from "../shared/uuid.js";

/**
 * docs/ETR_SESSION_FLOW.md section 4.4: `/table` — join a shared display.
 * No secrets, no controls after admission. `apps/functions`'s
 * `admitMember` checks a *separate* table secret for `requestedCapability:
 * "table"` (never the room passphrase) — the `passphrase` field on the
 * wire request carries whichever secret this capability actually needs.
 */
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
    const requestId = newUuid();
    setRequest({ status: "pending", requestId });
    const result = await joinRoom({
      requestId,
      roomCode: roomCode.toUpperCase(),
      passphrase: tableCode.toUpperCase(),
      requestedCapability: "table",
      displayName: "Table",
    });
    if (result.ok) {
      setRequest({ status: "accepted", requestId, result });
      writeOwnershipRecord(ownershipFromAcceptedWithNames(result, "Table", ""));
    } else {
      setRequest({ status: "rejected", requestId, code: result.code, message: result.message });
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
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
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
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
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
          <p>Connected.</p>
          <button
            type="button"
            className="primary-action"
            onClick={() => navigate(`/room/${accepted.roomId}/table`)}
          >
            Open the table display
          </button>
        </section>
      )}
    </main>
  );
}
