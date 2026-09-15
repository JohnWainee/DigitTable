import { useEffect, useState } from "react";
import { Icon } from "../shared/Icon.js";

export type ConnectionState = "connecting" | "live" | "reconnecting" | "signed-out";

const MESSAGES: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  live: "Connected",
  reconnecting: "Reconnecting… showing last known state",
  "signed-out": "Your seat is on another identity. Enter your recovery code.",
};

/** `online`/`offline` per docs/ETR_ART_BRIEF.md section 3.5: connected states get the filled dot, everything else the hollow one. */
function iconFor(state: ConnectionState): "online" | "offline" {
  return state === "live" ? "online" : "offline";
}

/**
 * The persistent status strip every surface shows, per
 * docs/ETR_SESSION_FLOW.md section 2. `role="status"` + `aria-live="polite"`
 * so a screen reader announces changes without interrupting.
 */
export function ConnectionStatusStrip({ state }: { readonly state: ConnectionState }): JSX.Element {
  return (
    <p role="status" aria-live="polite" className={`connection-status connection-status--${state}`}>
      <Icon name={iconFor(state)} className="connection-status-icon" />
      {MESSAGES[state]}
    </p>
  );
}

/**
 * Fixture mode has no real subscription to lose, so this only models the
 * brief `connecting` flash every real surface shows on first projection
 * load (docs/ETR_SESSION_FLOW.md section 2), then settles on `live`.
 */
export function useFixtureConnectionState(): ConnectionState {
  const [state, setState] = useState<ConnectionState>("connecting");
  useEffect(() => {
    const timer = setTimeout(() => setState("live"), 150);
    return () => clearTimeout(timer);
  }, []);
  return state;
}
