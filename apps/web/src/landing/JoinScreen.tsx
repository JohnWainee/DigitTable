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
  writeOwnershipRecord,
  type LocalOwnershipRecord,
} from "../session/ownership.js";
import { joinRoom, recoverSeat } from "../session/roomClient.js";
import type { RecoverSeatResult } from "../session/FirebaseSessionClient.js";
import type { RoomAdmissionAccepted, SessionRequestState } from "@digitable/contracts";
import { LiveRegion } from "../accessibility/LiveRegion.js";
import { newUuid } from "../shared/uuid.js";
import { normalizeRecoveryCodeEntry } from "./secretEntry.js";
import { resumeRoute } from "./resumeRoute.js";
import {
  FieldError,
  FormErrorSummary,
  useInlineValidation,
  type FieldRule,
} from "./inlineValidation.js";

type JoinMode = "join" | "recover";

// The rule lives here only. The HTML `pattern` attribute is deliberately not used: Chrome compiles it with
// the `v` flag, where a trailing `-` in a class is a syntax error, so the browser never enforced it and
// logged "Pattern attribute value ... is not a valid regular expression" instead.
const ROOM_CODE_PATTERN = /^[A-Za-z0-9-]+$/;
const ROOM_CODE_MESSAGE = "Room code can only use letters, numbers and dashes.";

const JOIN_RULES: readonly FieldRule[] = [
  {
    id: "room-code",
    label: "Room code",
    required: true,
    pattern: ROOM_CODE_PATTERN,
    patternMessage: ROOM_CODE_MESSAGE,
  },
  { id: "join-passphrase", label: "Passphrase", required: true },
  { id: "join-display-name", label: "Your display name", required: true, visible: true },
];

const RECOVER_RULES: readonly FieldRule[] = [
  {
    id: "recover-room-code",
    label: "Room code",
    required: true,
    pattern: ROOM_CODE_PATTERN,
    patternMessage: ROOM_CODE_MESSAGE,
  },
  { id: "recovery-code", label: "Recovery code", required: true },
  // Local only (the recover callable takes just the room and recovery codes): no server rule to mirror.
  { id: "recover-display-name", label: "Your display name", required: true },
];

/** docs/ETR_SESSION_FLOW.md section 4.2: `/join` — Player join by code + passphrase. */
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
  const joinValidation = useInlineValidation(JOIN_RULES, {
    "room-code": roomCode,
    "join-passphrase": passphrase,
    "join-display-name": displayName,
  });
  const recoverValidation = useInlineValidation(RECOVER_RULES, {
    "recover-room-code": recoveryRoomCode,
    "recovery-code": recoveryCode,
    "recover-display-name": recoveryDisplayName,
  });

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (request.status === "pending") return;
    if (!joinValidation.check()) return;
    const requestId = newUuid();
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
    if (!recoverValidation.check()) return;
    const requestId = newUuid();
    setRecoveryRequest({ status: "pending", requestId });
    const normalizedRoomCode = recoveryRoomCode.toUpperCase();
    const result = await recoverSeat({
      roomCode: normalizedRoomCode,
      recoveryCode: normalizeRecoveryCodeEntry(recoveryCode),
    });
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
            noValidate
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
                autoCorrect="off"
                spellCheck={false}
                value={recoveryRoomCode}
                onChange={(event) => setRecoveryRoomCode(event.target.value)}
                {...recoverValidation.field("recover-room-code")}
              />
              <FieldError
                id="recover-room-code"
                message={recoverValidation.errors["recover-room-code"]}
              />
            </div>
            <div className="form-field">
              <label htmlFor="recovery-code">Recovery code</label>
              <input
                id="recovery-code"
                type="text"
                required
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="off"
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value)}
                {...recoverValidation.field("recovery-code")}
              />
              <FieldError id="recovery-code" message={recoverValidation.errors["recovery-code"]} />
            </div>
            <div className="form-field">
              <label htmlFor="recover-display-name">Your display name</label>
              <input
                id="recover-display-name"
                type="text"
                required
                maxLength={40}
                value={recoveryDisplayName}
                onChange={(event) => setRecoveryDisplayName(event.target.value)}
                {...recoverValidation.field("recover-display-name")}
              />
              <FieldError
                id="recover-display-name"
                message={recoverValidation.errors["recover-display-name"]}
              />
            </div>
            <FormErrorSummary
              show={recoverValidation.failed}
              attempt={recoverValidation.attempts}
            />
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
              Redeeming a code invalidates it. Save this replacement somewhere private; it is not
              stored in this browser.
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
          noValidate
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
              autoCorrect="off"
              spellCheck={false}
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              {...joinValidation.field("room-code")}
            />
            <FieldError id="room-code" message={joinValidation.errors["room-code"]} />
          </div>
          <div className="form-field">
            <label htmlFor="join-passphrase">Passphrase</label>
            <input
              id="join-passphrase"
              type="text"
              required
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              {...joinValidation.field("join-passphrase")}
            />
            <FieldError id="join-passphrase" message={joinValidation.errors["join-passphrase"]} />
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
              {...joinValidation.field("join-display-name")}
            />
            <FieldError
              id="join-display-name"
              message={joinValidation.errors["join-display-name"]}
            />
          </div>
          <FormErrorSummary show={joinValidation.failed} attempt={joinValidation.attempts} />
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
