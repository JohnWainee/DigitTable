import type { EatTheReichView } from "@digitable/template-eat-the-reich";
import { Icon } from "../shared/Icon.js";
import { PortraitImage } from "../shared/PortraitImage.js";

export interface PartyStripProps {
  readonly roster: EatTheReichView["roster"];
  readonly selfCharacterId?: string;
}

/** docs/ETR_SESSION_FLOW.md section 6/10: party strip — portrait, Blood, injury pips, downed, per claimed character, derived from the real `roster` projection (C06). Shared by the player, GM, and table surfaces. */
export function PartyStrip({ roster, selfCharacterId }: PartyStripProps): JSX.Element {
  const claimed = roster.filter((c) => c.claimedByMemberId !== null);
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
            <PortraitImage
              characterId={character.id}
              name={character.name}
              className="party-portrait"
              downed={character.downed}
            />
            <span className="party-member-details">
              <span className="party-member-name">
                {character.name}
                {character.id === selfCharacterId ? " (you)" : ""}
                {character.downed ? " — downed" : ""}
                {character.retired ? " — retired" : ""}
              </span>
              <span className="party-member-stats">
                <Icon name="blood" /> Blood {character.blood}/10 &middot;{" "}
                <Icon name={character.injuryBoxesMarked > 0 ? "injury-marked" : "injury-empty"} />{" "}
                Injuries {character.injuryBoxesMarked}/6
                {character.downed && <Icon name="downed" label="Downed" />}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
