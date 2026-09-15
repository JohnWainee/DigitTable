import type { CharacterFullSheet } from "@digitable/template-eat-the-reich";

export interface RosterPanelProps {
  readonly gmSheets: readonly CharacterFullSheet[];
  readonly onOpenCorrection: (characterId: string) => void;
}

/**
 * docs/ETR_SESSION_FLOW.md section 7: every character's full sheet,
 * GM-only, from the real `gmSheets` projection (C06). The real projection
 * carries no member display name (matrix's `claimedByMemberId` is a bare
 * id) — "claimed"/"unclaimed" only, matching `ClaimCharacterScreen`'s own
 * simplification.
 */
export function RosterPanel({ gmSheets, onOpenCorrection }: RosterPanelProps): JSX.Element {
  return (
    <section className="step" aria-labelledby="roster-panel-heading">
      <h2 id="roster-panel-heading">Roster</h2>
      <ul className="roster-panel-list">
        {gmSheets.map((character) => (
          <li key={character.id}>
            <strong>{character.name}</strong>
            {character.claimedByMemberId ? " — claimed" : " — unclaimed"} &middot; Blood{" "}
            {character.blood}/10 &middot; Injuries {character.injuryBoxesMarked}/6
            {character.downed ? " · DOWNED" : ""}
            {character.retired ? " · RETIRED" : ""}{" "}
            <button
              type="button"
              className="secondary-action"
              onClick={() => onOpenCorrection(character.id)}
            >
              Correct
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
