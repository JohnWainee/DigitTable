import type { RosterEntry } from "../session/FixtureSessionGateway.js";
import type { FixtureCharacterState } from "../session/fixturePlayLoop.js";

export interface RosterPanelProps {
  readonly roster: readonly RosterEntry[];
  readonly characterStates: ReadonlyMap<string, FixtureCharacterState>;
  readonly onOpenCorrection: (characterId: string) => void;
}

/** docs/ETR_SESSION_FLOW.md section 7: every character's full sheet, GM-only. */
export function RosterPanel({
  roster,
  characterStates,
  onOpenCorrection,
}: RosterPanelProps): JSX.Element {
  return (
    <section className="step" aria-labelledby="roster-panel-heading">
      <h2 id="roster-panel-heading">Roster</h2>
      <ul className="roster-panel-list">
        {roster.map((entry) => {
          const state = characterStates.get(entry.id);
          return (
            <li key={entry.id}>
              <strong>{entry.name}</strong>
              {entry.claimedByDisplayName
                ? ` — claimed by ${entry.claimedByDisplayName}`
                : " — unclaimed"}
              {state && (
                <>
                  {" "}
                  &middot; Blood {state.blood}/10 &middot; Injuries {state.injuriesMarked}/6
                  {state.downed ? " · DOWNED" : ""}{" "}
                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() => onOpenCorrection(entry.id)}
                  >
                    Correct
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
