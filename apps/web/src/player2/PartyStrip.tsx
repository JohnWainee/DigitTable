import type { RosterEntry } from "../session/FixtureSessionGateway.js";
import { fixturePlayLoopStore as store } from "../session/fixturePlayLoopStore.js";
import { Icon } from "../shared/Icon.js";
import { PortraitImage } from "../shared/PortraitImage.js";

export interface PartyStripProps {
  readonly roomId: string;
  readonly roster: readonly RosterEntry[];
  readonly selfCharacterId?: string;
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
              <PortraitImage
                characterId={character.id}
                name={character.name}
                className="party-portrait"
                downed={downed}
              />
              <span className="party-member-details">
                <span className="party-member-name">
                  {character.name}
                  {character.id === selfCharacterId ? " (you)" : ""}
                  {downed ? " — downed" : ""}
                </span>
                <span className="party-member-stats">
                  <Icon name="blood" /> Blood {blood}/10 &middot;{" "}
                  <Icon name={injuriesMarked > 0 ? "injury-marked" : "injury-empty"} /> Injuries{" "}
                  {injuriesMarked}/6
                  {downed && <Icon name="downed" label="Downed" />}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
