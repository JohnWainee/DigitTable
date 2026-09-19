import { navigate } from "../router.js";
import type { LocalOwnershipRecord } from "../session/ownership.js";

export interface GmSeatRequiredProps {
  readonly roomId: string;
  /** This browser's own saved seat, if any. Never anything fetched from the room. */
  readonly ownership: LocalOwnershipRecord | null;
}

/**
 * What `/room/:roomId/gm` shows a visitor who does not hold the GM seat
 * (review F6). It says what the page is and where to go next, using only
 * what this browser already knows about itself (its own saved seat): it
 * fetches nothing from the room and never echoes the room id or any seat
 * detail, so an unauthorized visitor cannot use it to learn whether the
 * room exists or who is in it. A seat saved for a different room is
 * treated exactly like no seat.
 */
export function GmSeatRequired({ roomId, ownership }: GmSeatRequiredProps): JSX.Element {
  const ownSeat = ownership?.roomId === roomId ? ownership : null;

  if (ownSeat?.capability === "player") {
    return (
      <>
        <p role="alert">
          You have a player seat in this session. The director console is only for the GM.
        </p>
        <div className="landing-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => navigate(`/room/${roomId}/player`)}
          >
            Go to your dashboard
          </button>
          <button type="button" className="secondary-action" onClick={() => navigate("/")}>
            Back to start
          </button>
        </div>
      </>
    );
  }

  if (ownSeat?.capability === "table") {
    return (
      <>
        <p role="alert">
          This browser is connected as the shared table display. The director console is only for
          the GM.
        </p>
        <div className="landing-actions">
          <button
            type="button"
            className="primary-action"
            onClick={() => navigate(`/room/${roomId}/table`)}
          >
            Open the table display
          </button>
          <button type="button" className="secondary-action" onClick={() => navigate("/")}>
            Back to start
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <p role="alert">
        The director console is only for the GM of a session. If you are the GM, open this page in
        the browser where you created the session. If you are a player, join with the room code and
        passphrase your GM gave you.
      </p>
      <div className="landing-actions">
        <button type="button" className="primary-action" onClick={() => navigate("/join")}>
          Join a session
        </button>
        <button type="button" className="secondary-action" onClick={() => navigate("/")}>
          Back to start
        </button>
      </div>
    </>
  );
}
