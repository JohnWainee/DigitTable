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
  type CreateRoomReveal,
} from "../session/FixtureSessionGateway.js";
import { fixtureSessionGateway as gateway } from "../session/gateway.js";
import type { SessionRequestState } from "../session/sessionRequestState.js";
import { LiveRegion } from "../accessibility/LiveRegion.js";

/** docs/ETR_SESSION_FLOW.md section 3: `/create` — Create session (GM). */
export function CreateSessionScreen(): JSX.Element {
  const connection = useFixtureConnectionState();
  const [sessionName, setSessionName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [creatorDisplayName, setCreatorDisplayName] = useState("");
  const [request, setRequest] = useState<
    SessionRequestState<{ ok: true; reveal: CreateRoomReveal }>
  >({ status: "idle" });
  const [wroteDownSecrets, setWroteDownSecrets] = useState(false);
  const requestIdRef = useRef(getOrMintCreateRequestId());

  const reveal = request.status === "accepted" ? request.result.reveal : null;

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (request.status === "pending") return; // double-click cannot mint a second request
    const requestId = requestIdRef.current;
    setRequest({ status: "pending", requestId });
    try {
      const result = await gateway.createRoom({
        requestId,
        sessionName,
        passphrase,
        creatorDisplayName,
      });
      setRequest({ status: "accepted", requestId, result: { ok: true, reveal: result } });
      clearCreateRequestId();
    } catch (error) {
      const message = error instanceof Error ? error.message : "That didn't go through. Try again.";
      const code =
        error instanceof Error && "code" in error
          ? String((error as { code: unknown }).code)
          : "INVALID_REQUEST";
      setRequest({ status: "rejected", requestId, code, message });
    }
  }

  function handleAcknowledgeSecrets(): void {
    if (!reveal) return;
    writeOwnershipRecord({
      roomId: reveal.accepted.roomId,
      roomCode: reveal.accepted.roomCode,
      memberId: reveal.accepted.memberId,
      capability: reveal.accepted.capability,
      recoveryCode: reveal.accepted.recoveryCode,
      displayName: creatorDisplayName,
      sessionName,
    });
  }

  return (
    <main className="landing-screen">
      <ConnectionStatusStrip state={connection} />
      <FixtureModeBanner />
      <h1>Create a session</h1>

      {!reveal && (
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

      {reveal && (
        <section className="reveal-card" aria-labelledby="reveal-heading">
          <h2 id="reveal-heading">Write these down — shown once</h2>
          <dl>
            <dt>Room code</dt>
            <dd>{reveal.accepted.roomCode}</dd>
            <dt>Passphrase</dt>
            <dd>{reveal.passphraseTyped}</dd>
            <dt>Table code</dt>
            <dd>
              {reveal.accepted.tableCode ?? (
                <em>
                  Not yet available from the server (A03 gap — a table code slot is reserved here;
                  rotate it from the console once A03 lands).
                </em>
              )}
            </dd>
            <dt>GM recovery code</dt>
            <dd>{reveal.accepted.recoveryCode ?? <em>Already shown once; not re-issued.</em>}</dd>
          </dl>
          {reveal.repeated && (
            <p role="note">
              Secrets were shown once at creation. Rotate the table code from the console if you did
              not record it.
            </p>
          )}
          <div className="form-field form-field--checkbox">
            <input
              id="wrote-down"
              type="checkbox"
              checked={wroteDownSecrets}
              onChange={(e) => setWroteDownSecrets(e.target.checked)}
            />
            <label htmlFor="wrote-down">I have written these down</label>
          </div>
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

      {reveal && wroteDownSecrets && <InvitePanelStub roomId={reveal.accepted.roomId} />}
    </main>
  );
}

/**
 * A minimal stand-in for C03's `InvitePanel` (GM director console): the
 * room code, a passphrase hint that never re-shows the full passphrase, and
 * the current join count. The full desktop director console (scene/roster
 * controls) is C03's scope; this only satisfies C01's "GM-only invite
 * display" requirement so the GM has somewhere useful to land after create.
 */
function InvitePanelStub({ roomId }: { readonly roomId: string }): JSX.Element {
  // Fixture mode has no live subscription to re-render from; a manual
  // refresh re-reads the gateway's in-memory state (join count changes
  // when a player joins in another local surface during this tab's life).
  const [, forceRefresh] = useState(0);
  const stats = gateway.roomStats(roomId);
  const hint = gateway.passphraseHint(roomId);

  return (
    <section className="invite-panel" aria-labelledby="invite-heading">
      <h2 id="invite-heading">Invite</h2>
      <p>
        Passphrase hint: starts with "{hint?.firstChar}", {hint?.length} characters long. The full
        passphrase is never shown again.
      </p>
      <p>
        Players joined: {stats?.playerCount ?? 0}/6. Table display:{" "}
        {stats?.tableClaimed ? "connected" : "not connected"}.
      </p>
      <button type="button" className="secondary-action" onClick={() => forceRefresh((t) => t + 1)}>
        Refresh
      </button>
      <p>
        The full director console (scene control, roster management, corrections) arrives with C03.
      </p>
      <button type="button" className="primary-action" onClick={() => navigate("/demo")}>
        Open the fixture demo dashboard
      </button>
    </section>
  );
}
