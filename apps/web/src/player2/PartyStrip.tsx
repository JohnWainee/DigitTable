import type { RosterEntry } from "../session/FixtureSessionGateway.js";
import { fixturePlayLoopStore as store } from "../session/fixturePlayLoopStore.js";

export interface PartyStripProps {
  readonly roomId: string;
  readonly roster: readonly RosterEntry[];
  readonly selfCharacterId?: string;
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

/** docs/ETR_SESSION_FLOW.md section 6/10: party strip — portrait, Blood, injury pips, downed, per claimed character. Shared by the player, GM, and table surfaces. */
export function PartyStrip({ roomId, roster, selfCharacterId }: PartyStripProps): JSX.Element {
  const claimed = roster.filter((c) => c.claimedBy !== null);
  return (
    <section className="party-strip" aria-labelledby="party-heading">
      <h2 id="party-heading">Party</h2>
      <ul>
        {claimed.map((character) => {
          const record = store.getCharacterRecord(roomId, character.id);
          const blood = record?.character.blood ?? 0;
          const injuriesMarked = record?.character.injuriesMarked ?? 0;
          const downed = record?.character.downed ?? false;
          return (
            <li
              key={character.id}
              className={
                character.id === selfCharacterId
                  ? "party-member party-member--self"
                  : "party-member"
              }
            >
              <span
                className={
                  downed
                    ? "roster-card-portrait party-portrait party-portrait--downed"
                    : "roster-card-portrait party-portrait"
                }
                aria-hidden="true"
              >
                {initials(character.name)}
              </span>
              <span className="party-member-details">
                <span className="party-member-name">
                  {character.name}
                  {character.id === selfCharacterId ? " (you)" : ""}
                  {downed ? " — downed" : ""}
                </span>
                <span className="party-member-stats">
                  Blood {blood}/10 &middot; Injuries {injuriesMarked}/6
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
