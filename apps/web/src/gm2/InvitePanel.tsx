export interface InvitePanelProps {
  readonly roomCode: string;
  /** From the GM's own real projection (`view.roster`) — omitted on the just-created reveal screen, where no projection has been fetched yet. */
  readonly claimedCount?: number;
  readonly rosterSize?: number;
}

/**
 * docs/ETR_SESSION_FLOW.md section 4.1: `InvitePanel` (GM only) — room
 * code and how many of the roster's characters are claimed so far, read
 * from the real projection (C06) rather than a fixture-only join counter
 * the real system has no equivalent of.
 */
export function InvitePanel({ roomCode, claimedCount, rosterSize }: InvitePanelProps): JSX.Element {
  return (
    <section className="invite-panel" aria-labelledby="gm-invite-heading">
      <h2 id="gm-invite-heading">Invite</h2>
      <p>
        Room code: <strong>{roomCode}</strong>
      </p>
      <p className="form-hint">
        Share the room code and your passphrase with your players. The room code stays on this
        screen; the passphrase is shown only when you create the session, so keep your own copy.
      </p>
      {claimedCount !== undefined && rosterSize !== undefined && (
        <p>
          Characters claimed: {claimedCount}/{rosterSize}.
        </p>
      )}
    </section>
  );
}
