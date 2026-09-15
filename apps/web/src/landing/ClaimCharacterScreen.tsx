import { useState } from "react";
import { navigate } from "../router.js";
import {
  ConnectionStatusStrip,
  useFixtureConnectionState,
} from "../shell/ConnectionStatusStrip.js";
import { FixtureModeBanner } from "../shell/FixtureModeBanner.js";
import { readOwnershipRecord, type RosterEntry } from "../session/FixtureSessionGateway.js";
import { fixtureSessionGateway as gateway } from "../session/gateway.js";
import { ETR_STAT_LABELS } from "../../test/fixtures/etrTemp.js";
import { LiveRegion } from "../accessibility/LiveRegion.js";

export interface ClaimCharacterScreenProps {
  readonly roomId: string;
}

/** docs/ETR_SESSION_FLOW.md section 4.3: `ClaimCharacterScreen`. */
export function ClaimCharacterScreen({ roomId }: ClaimCharacterScreenProps): JSX.Element {
  const connection = useFixtureConnectionState();
  const ownership = readOwnershipRecord();
  const roomExists = gateway.roomExists(roomId);
  const [roster, setRoster] = useState<readonly RosterEntry[] | null>(() =>
    roomExists ? gateway.listRoster(roomId) : null,
  );
  const [announcement, setAnnouncement] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleClaim(character: RosterEntry): Promise<void> {
    if (!ownership || ownership.roomId !== roomId) return;
    setError(null);
    try {
      await gateway.claimCharacter(roomId, ownership.memberId, character.id, character.revision);
      setRoster(gateway.listRoster(roomId));
      setAnnouncement(`You claimed ${character.name}.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not claim that character.";
      setRoster(gateway.listRoster(roomId));
      setError(message);
      setAnnouncement(message);
    }
  }

  if (!roomExists) {
    return (
      <main className="landing-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p role="alert">
          This session has ended, or fixture mode lost it on reload (fixture mode keeps no state
          across a full page reload — see docs/ETR_SESSION_FLOW.md section 11). Create or join a new
          one.
        </p>
        <button type="button" className="primary-action" onClick={() => navigate("/")}>
          Back to start
        </button>
      </main>
    );
  }

  const mine =
    ownership && roster ? roster.find((c) => c.claimedBy === ownership.memberId) : undefined;

  return (
    <main className="landing-screen">
      <ConnectionStatusStrip state={connection} />
      <FixtureModeBanner />
      <h1>Pick your character</h1>
      <LiveRegion politeness="polite" message={announcement} />
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}

      {roster === null ? (
        <p>Loading roster…</p>
      ) : (
        <ul className="roster-grid" aria-label="Roster">
          {roster.map((character) => {
            const isMine = ownership?.memberId === character.claimedBy;
            const isTaken = character.claimedBy !== null && !isMine;
            return (
              <li key={character.id} className="roster-card">
                <div className="roster-card-portrait" aria-hidden="true">
                  {initials(character.name)}
                </div>
                <h2>{character.name}</h2>
                <p>{character.concept}</p>
                <ul className="stat-line" aria-label={`${character.name} stats`}>
                  {ETR_STAT_LABELS.map((label, i) => (
                    <li key={label}>
                      <span className="stat-label">{label}</span> {character.stats[i]}
                    </li>
                  ))}
                </ul>
                {isMine ? (
                  <p className="roster-status roster-status--mine">Yours</p>
                ) : isTaken ? (
                  <p className="roster-status">Claimed by {character.claimedByDisplayName}</p>
                ) : (
                  <button
                    type="button"
                    className="primary-action"
                    disabled={!ownership || ownership.capability === "gm" || Boolean(mine)}
                    onClick={() => {
                      void handleClaim(character);
                    }}
                  >
                    Claim
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {mine && (
        <button
          type="button"
          className="primary-action"
          onClick={() => navigate(`/room/${roomId}/player`)}
        >
          Continue to your dashboard
        </button>
      )}
    </main>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
