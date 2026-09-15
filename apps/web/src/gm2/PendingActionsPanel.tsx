import { useState } from "react";
import type { CharacterPlayRecord } from "../session/fixturePlayLoopStore.js";
import type { FixtureSceneState } from "../session/fixturePlayLoop.js";
import { ETR_STAT_LABELS } from "../../test/fixtures/etrTemp.js";

export interface PendingActionsPanelProps {
  readonly pending: readonly CharacterPlayRecord[];
  readonly scene: FixtureSceneState;
  readonly onRoll: (
    characterId: string,
    approvedClaimIds: readonly string[],
    engagedThreatIds: readonly string[],
  ) => void;
}

/** docs/ETR_SESSION_FLOW.md section 6.2: the GM's pending-declarations review — approve/strike each claim, confirm engaged threats, roll. */
export function PendingActionsPanel({
  pending,
  scene,
  onRoll,
}: PendingActionsPanelProps): JSX.Element {
  return (
    <section className="step" aria-labelledby="pending-actions-heading">
      <h2 id="pending-actions-heading">Pending actions</h2>
      {pending.length === 0 ? (
        <p>No one is waiting on you.</p>
      ) : (
        <ul className="pending-actions-list">
          {pending.map((record) => (
            <PendingActionCard
              key={record.character.id}
              record={record}
              scene={scene}
              onRoll={onRoll}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function PendingActionCard({
  record,
  scene,
  onRoll,
}: {
  readonly record: CharacterPlayRecord;
  readonly scene: FixtureSceneState;
  readonly onRoll: PendingActionsPanelProps["onRoll"];
}): JSX.Element {
  const choice = record.pendingChoice;
  const character = record.character;
  const claimableIds = choice ? [...choice.itemIds, ...choice.abilityIds] : [];
  const claimsWithBonus = claimableIds
    .map(
      (id) =>
        character.items.find((i) => i.id === id) ?? character.abilities.find((a) => a.id === id),
    )
    .filter((source): source is NonNullable<typeof source> & { bonusCount: number } =>
      Boolean(source && "bonusCount" in source && source.bonusCount),
    );

  const [approvedClaimIds, setApprovedClaimIds] = useState<readonly string[]>(
    claimsWithBonus.map((c) => c.id), // default: approve every claim
  );
  const [engagedThreatIds, setEngagedThreatIds] = useState<readonly string[]>(
    choice?.engagedThreatIds ?? [], // default: the player's own proposal
  );

  if (!choice) return <li />;

  function toggleClaim(id: string): void {
    setApprovedClaimIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
  function toggleThreat(id: string): void {
    setEngagedThreatIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  const diceCount =
    (choice.statIndex === null ? 2 : character.stats[choice.statIndex]!) +
    choice.itemIds.length +
    choice.abilityIds.length +
    claimsWithBonus
      .filter((c) => approvedClaimIds.includes(c.id))
      .reduce((sum, c) => sum + c.bonusCount, 0);

  return (
    <li className="pending-action-card">
      <h3>{character.name}</h3>
      <p>
        Stat: {choice.statIndex === null ? "No stat fits" : ETR_STAT_LABELS[choice.statIndex]}
        {choice.itemIds.length > 0 &&
          ` · Items: ${choice.itemIds
            .map((id) => character.items.find((i) => i.id === id)?.name)
            .filter(Boolean)
            .join(", ")}`}
        {choice.abilityIds.length > 0 &&
          ` · Abilities: ${choice.abilityIds
            .map((id) => character.abilities.find((a) => a.id === id)?.name)
            .filter(Boolean)
            .join(", ")}`}
      </p>

      {claimsWithBonus.length > 0 && (
        <fieldset>
          <legend>Bonus claims</legend>
          <div className="gear-list">
            {claimsWithBonus.map((source) => (
              <label key={source.id} className="gear-option">
                <input
                  type="checkbox"
                  checked={approvedClaimIds.includes(source.id)}
                  onChange={() => toggleClaim(source.id)}
                />
                {source.name} (+{source.bonusCount}, {source.bonusText})
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend>Engaged threats</legend>
        <div className="gear-list">
          {scene.threats
            .filter((t) => t.rating > 0)
            .map((threat) => (
              <label key={threat.id} className="gear-option">
                <input
                  type="checkbox"
                  checked={engagedThreatIds.includes(threat.id)}
                  onChange={() => toggleThreat(threat.id)}
                />
                {threat.name}
                {!threat.revealed ? " (not yet revealed to players)" : ""}
              </label>
            ))}
        </div>
      </fieldset>

      <p>
        Pool: <strong>{diceCount}</strong> {diceCount === 1 ? "die" : "dice"}
      </p>
      <button
        type="button"
        className="primary-action"
        onClick={() => onRoll(character.id, approvedClaimIds, engagedThreatIds)}
      >
        Roll it
      </button>
    </li>
  );
}
