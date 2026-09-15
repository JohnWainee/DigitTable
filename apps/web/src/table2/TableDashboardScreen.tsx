import { navigate } from "../router.js";
import {
  ConnectionStatusStrip,
  useFixtureConnectionState,
} from "../shell/ConnectionStatusStrip.js";
import { FixtureModeBanner } from "../shell/FixtureModeBanner.js";
import { readOwnershipRecord } from "../session/FixtureSessionGateway.js";
import { fixtureSessionGateway as gateway } from "../session/gateway.js";
import { SceneCard } from "../player2/SceneCard.js";
import { PartyStrip } from "../player2/PartyStrip.js";
import { RouteMap } from "./RouteMap.js";
import { useTableFixture } from "./useTableFixture.js";

export interface TableDashboardScreenProps {
  readonly roomId: string;
}

/**
 * docs/ETR_SESSION_FLOW.md section 1/10: `/room/:roomId/table` — the
 * shared, read-only display. Renders no controls, no inputs, and nothing
 * beyond what section 10 allows (no GM notes, no unrevealed threats, no
 * bonus-claim notes, no code/passphrase, pending declarations reduced to a
 * name only).
 */
export function TableDashboardScreen({ roomId }: TableDashboardScreenProps): JSX.Element {
  const connection = useFixtureConnectionState();
  const ownership = readOwnershipRecord();
  const roomExists = gateway.roomExists(roomId);
  const roster = roomExists ? gateway.listRoster(roomId) : [];
  const isTable = ownership?.roomId === roomId && ownership.capability === "table";
  const fixture = useTableFixture(roomId, roster);

  if (!roomExists || !isTable) {
    return (
      <main className="table-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p role="alert">
          {!roomExists
            ? "This session has ended, or fixture mode lost it on reload."
            : "This display isn't connected to a room."}
        </p>
        <button type="button" className="secondary-action" onClick={() => navigate("/")}>
          Back to start
        </button>
      </main>
    );
  }

  const clearedSceneIds = fixture.scene.objectiveRating === 0 ? [fixture.scene.id] : [];

  return (
    <main className="table-screen">
      <ConnectionStatusStrip state={connection} />
      <FixtureModeBanner />
      <h1>Eat the Reich</h1>
      <RouteMap currentSceneId={fixture.scene.id} clearedSceneIds={clearedSceneIds} />
      <SceneCard scene={fixture.scene} />
      <PartyStrip roomId={roomId} roster={roster} />

      {fixture.acting.length > 0 && (
        <section aria-labelledby="acting-heading">
          <h2 id="acting-heading">Acting</h2>
          <ul>
            {fixture.acting.map((name) => (
              <li key={name}>{name} is acting&hellip;</li>
            ))}
          </ul>
        </section>
      )}

      {fixture.activeRolls.length > 0 && (
        <section aria-labelledby="current-roll-heading">
          <h2 id="current-roll-heading">Current roll</h2>
          {fixture.activeRolls.map(({ name, roll }) => (
            <div key={name}>
              <p>{name}</p>
              <ul className="dice-chip-row" aria-label={`${name}'s kept dice`}>
                {roll.keptDice.map((die) => (
                  <li key={die.id} className={`die-chip die-chip--${die.kind}`}>
                    {die.face}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {fixture.history.length > 0 && (
        <section aria-labelledby="recent-heading">
          <h2 id="recent-heading">Recent</h2>
          <ul>
            {fixture.history.map((entry, i) => (
              <li key={i}>
                <strong>{entry.characterName}:</strong> {entry.lines.map((l) => l.label).join(", ")}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
