import { useState } from "react";
import { navigate } from "../router.js";
import {
  ConnectionStatusStrip,
  useFixtureConnectionState,
} from "../shell/ConnectionStatusStrip.js";
import { FixtureModeBanner } from "../shell/FixtureModeBanner.js";
import {
  ownershipFromAcceptedWithNames,
  ownershipFromRecoverySeat,
  resumeRoute,
  writeOwnershipRecord,
  type LocalOwnershipRecord,
} from "../session/ownership.js";
import { joinRoom, recoverSeat } from "../session/roomClient.js";
import type { RecoverSeatResult } from "../session/FirebaseSessionClient.js";
import type { RoomAdmissionAccepted, SessionRequestState } from "@digitable/contracts";
import { LiveRegion } from "../accessibility/LiveRegion.js";

type JoinMode = "join" | "recover";

/** docs/ETR_SESSION_FLOW.md section 4.2: `/join` — Player join by code + passphrase, or recover a lost seat by recovery code. */
export function JoinScreen(): JSX.Element {
  const connection = useFixtureConnectionState();
  const [mode, setMode] = useState<JoinMode>("join");
  const [roomCode, setRoomCode] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [request, setRequest] = useState<SessionRequestState<RoomAdmissionAccepted>>({
    status: "idle",
  });

  const [recoveryRoomCode, setRecoveryRoomCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryDisplayName, setRecoveryDisplayName] = useState("");
  const [recoveryRequest, setRecoveryRequest] = useState<
    SessionRequestState<Extract<RecoverSeatResult, { readonly ok: true }>>
  >({ status: "idle" });
  const [recoveredOwnership, setRecoveredOwnership] = useState<LocalOwnershipRecord | null>(null);

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

  async function handleRecoverSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (recoveryRequest.status === "pending") return;
    const requestId = globalThis.crypto.randomUUID();
    setRecoveryRequest({ status: "pending", requestId });
    const normalizedRoomCode = recoveryRoomCode.toUpperCase();
    const result = await recoverSeat({ roomCode: normalizedRoomCode, recoveryCode });
    if (result.ok) {
      setRecoveryRequest({ status: "accepted", requestId, result });
      const ownership = ownershipFromRecoverySeat(
        result,
        normalizedRoomCode,
        recoveryDisplayName,
        "",
      );
      writeOwnershipRecord(ownership);
      setRecoveredOwnership(ownership);
    } else {
      setRecoveryRequest({
        status: "rejected",
        requestId,
        code: result.code,
        message: result.message,
      });
    }
  }

  const accepted = request.status === "accepted" ? request.result : null;
  const recovered = recoveryRequest.status === "accepted" ? recoveryRequest.result : null;

  if (mode === "recover") {
    return (
      <main className="landing-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <h1>Recover your seat</h1>
        <p>
          Lost this browser or cleared its storage? Redeem the recovery code you were shown when you
          first joined to get your seat back.
        </p>

        {!recovered && (
          <form
            className="session-form"
            onSubmit={(event) => {
              void handleRecoverSubmit(event);
            }}
          >
            <div className="form-field">
              <label htmlFor="recover-room-code">Room code</label>
              <input
                id="recover-room-code"
                type="text"
                required
                autoCapitalize="characters"
                pattern="[A-Za-z0-9-]+"
                value={recoveryRoomCode}
                onChange={(e) => setRecoveryRoomCode(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="recovery-code">Recovery code</label>
              <input
                id="recovery-code"
                type="text"
                required
                autoComplete="off"
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="recover-display-name">Your display name</label>
              <input
                id="recover-display-name"
                type="text"
                required
                maxLength={40}
                value={recoveryDisplayName}
                onChange={(e) => setRecoveryDisplayName(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="primary-action"
              disabled={recoveryRequest.status === "pending"}
            >
              {recoveryRequest.status === "pending" ? "Recovering…" : "Recover my seat"}
            </button>
            {recoveryRequest.status === "rejected" && (
              <p role="alert" className="error-message">
                {recoveryRequest.message}
              </p>
            )}
          </form>
        )}

        <LiveRegion
          politeness="polite"
          message={
            recoveryRequest.status === "pending"
              ? "Recovering your seat…"
              : recovered
                ? "Seat recovered."
                : ""
          }
        />

        {recovered && (
          <section className="reveal-card" aria-labelledby="recover-reveal-heading">
            <h2 id="recover-reveal-heading">Your new recovery code — shown once</h2>
            <p>
              Redeeming a code invalidates it. If you lose access to this browser again, use this
              new code instead. Nobody else can see it.
            </p>
            <p className="reveal-code">{recovered.recoveryCode}</p>
            <button
              type="button"
              className="primary-action"
              onClick={() => recoveredOwnership && navigate(resumeRoute(recoveredOwnership))}
            >
              I wrote it down — continue
            </button>
          </section>
        )}

        {!recovered && (
          <button type="button" className="secondary-action" onClick={() => setMode("join")}>
            Back to join by code
          </button>
        )}
      </main>
    );
  }

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

      {!accepted && (
        <button type="button" className="secondary-action" onClick={() => setMode("recover")}>
          Lost your browser? Recover your seat
        </button>
      )}
    </main>
  );
}
