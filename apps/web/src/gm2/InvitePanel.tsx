import { useState } from "react";
import { fixtureSessionGateway as gateway } from "../session/gateway.js";

export interface InvitePanelProps {
  readonly roomId: string;
  readonly roomCode: string;
}

/** docs/ETR_SESSION_FLOW.md section 4.1: `InvitePanel` (GM only) — room code, passphrase hint, join count. */
export function InvitePanel({ roomId, roomCode }: InvitePanelProps): JSX.Element {
  // Fixture mode has no live subscription to re-render from automatically.
  const [, forceRefresh] = useState(0);
  const stats = gateway.roomStats(roomId);
  const hint = gateway.passphraseHint(roomId);

  return (
    <section className="invite-panel" aria-labelledby="gm-invite-heading">
      <h2 id="gm-invite-heading">Invite</h2>
      <p>
        Room code: <strong>{roomCode}</strong>
      </p>
      <p>
        Passphrase hint: starts with &quot;{hint?.firstChar}&quot;, {hint?.length} characters long.
        The full passphrase is never shown again.
      </p>
      <p>
        Players joined: {stats?.playerCount ?? 0}/6. Table display:{" "}
        {stats?.tableClaimed ? "connected" : "not connected"}.
      </p>
      <button type="button" className="secondary-action" onClick={() => forceRefresh((t) => t + 1)}>
        Refresh
      </button>
    </section>
  );
}
