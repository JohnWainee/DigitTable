import type { RosterEntry } from "../session/FixtureSessionGateway.js";

export interface PartyStripProps {
  readonly roster: readonly RosterEntry[];
  readonly selfCharacterId: string;
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

/** docs/ETR_SESSION_FLOW.md section 6/10: party strip — portrait, Blood, injury pips, downed, per claimed character. */
export function PartyStrip({ roster, selfCharacterId }: PartyStripProps): JSX.Element {
  const claimed = roster.filter((c) => c.claimedBy !== null);
  return (
    <section className="party-strip" aria-labelledby="party-heading">
      <h2 id="party-heading">Party</h2>
      <ul>
        {claimed.map((character) => (
          <li
            key={character.id}
            className={
              character.id === selfCharacterId ? "party-member party-member--self" : "party-member"
            }
          >
            <span className="roster-card-portrait party-portrait" aria-hidden="true">
              {initials(character.name)}
            </span>
            <span className="party-member-name">
              {character.name}
              {character.id === selfCharacterId ? " (you)" : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
