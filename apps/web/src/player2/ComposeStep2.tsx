import { useState } from "react";
import { ETR_STAT_LABELS, type SceneThreatFixture } from "../../test/fixtures/etrTemp.js";
import {
  explainDeclareChoice,
  type DeclareChoice,
  type FixtureCharacterState,
} from "../session/fixturePlayLoop.js";

export interface ComposeStep2Props {
  readonly character: FixtureCharacterState;
  readonly threats: readonly SceneThreatFixture[];
  readonly onDeclare: (choice: DeclareChoice) => void;
}

/** docs/ETR_SESSION_FLOW.md section 6.1: stat / items / abilities / bonus claims / engaged threats. */
export function ComposeStep2({ character, threats, onDeclare }: ComposeStep2Props): JSX.Element {
  const [statIndex, setStatIndex] = useState<number | null>(0);
  const [itemIds, setItemIds] = useState<readonly string[]>([]);
  const [abilityIds, setAbilityIds] = useState<readonly string[]>([]);
  const [bonusClaimIds, setBonusClaimIds] = useState<readonly string[]>([]);
  const [engagedThreatIds, setEngagedThreatIds] = useState<readonly string[]>([]);

  const revealedThreats = threats.filter((t) => t.revealed && t.rating > 0);
  const selectableAbilities = character.abilities.filter((a) => a.cost !== "special");
  const specialAbilities = character.abilities.filter((a) => a.cost === "special");
  const claimableIds = [...itemIds, ...abilityIds];

  function toggle(
    list: readonly string[],
    id: string,
    set: (next: readonly string[]) => void,
  ): void {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  /** Toggling an item/ability off also drops any bonus claim on it. */
  function toggleClaimable(
    list: readonly string[],
    id: string,
    set: (next: readonly string[]) => void,
  ): void {
    const removing = list.includes(id);
    toggle(list, id, set);
    if (removing) setBonusClaimIds((claims) => claims.filter((x) => x !== id));
  }

  const choice: DeclareChoice = { statIndex, itemIds, abilityIds, bonusClaimIds, engagedThreatIds };
  const pool = explainDeclareChoice(character, choice);

  const canDeclare = !character.downed && !character.retired;

  return (
    <section className="step" aria-labelledby="compose-heading">
      <h2 id="compose-heading">Choose an action</h2>

      <fieldset>
        <legend>Stat</legend>
        {ETR_STAT_LABELS.map((label, i) => (
          <label key={label} className="gear-option">
            <input
              type="radio"
              name="stat"
              checked={statIndex === i}
              onChange={() => setStatIndex(i)}
            />
            {label} ({character.stats[i]})
          </label>
        ))}
        <label className="gear-option">
          <input
            type="radio"
            name="stat"
            checked={statIndex === null}
            onChange={() => setStatIndex(null)}
          />
          No stat fits (2 dice)
        </label>
      </fieldset>

      <fieldset>
        <legend>Items</legend>
        <div className="gear-list">
          {character.items.map((item) => (
            <label key={item.id} className="gear-option">
              <input
                type="checkbox"
                checked={itemIds.includes(item.id)}
                disabled={item.usesRemaining <= 0}
                onChange={() => toggleClaimable(itemIds, item.id, setItemIds)}
              />
              {item.name} ({item.usesRemaining}/{item.maxUses} uses)
              {item.usesRemaining <= 0 ? " — no uses left" : ""}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Abilities</legend>
        <div className="gear-list">
          {selectableAbilities.map((ability) => {
            const disabled = ability.cost === "blood1" && character.blood < 1;
            return (
              <label key={ability.id} className="gear-option">
                <input
                  type="checkbox"
                  checked={abilityIds.includes(ability.id)}
                  disabled={disabled}
                  onChange={() => toggleClaimable(abilityIds, ability.id, setAbilityIds)}
                />
                {ability.name} ({ability.cost === "blood1" ? "1 Blood" : "free"})
                {disabled ? " — not enough Blood" : ""}
              </label>
            );
          })}
          {specialAbilities.length > 0 && (
            <p className="form-hint">
              {specialAbilities.map((a) => a.name).join(", ")}: activate with a critical when
              allocating.
            </p>
          )}
        </div>
      </fieldset>

      {claimableIds.length > 0 && (
        <fieldset>
          <legend>Bonus claims</legend>
          <div className="gear-list">
            {claimableIds.map((id) => {
              const item = character.items.find((i) => i.id === id);
              const ability = character.abilities.find((a) => a.id === id);
              const source = item ?? ability;
              if (!source || !("bonusCount" in source) || !source.bonusCount) return null;
              return (
                <label key={id} className="gear-option">
                  <input
                    type="checkbox"
                    checked={bonusClaimIds.includes(id)}
                    onChange={() => toggle(bonusClaimIds, id, setBonusClaimIds)}
                  />
                  I&rsquo;m meeting {source.name}&rsquo;s bonus ({source.bonusText}, +
                  {source.bonusCount})
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend>Engaged threats</legend>
        {revealedThreats.length === 0 ? (
          <p>No opposition&hellip; yet.</p>
        ) : (
          <div className="gear-list">
            {revealedThreats.map((threat) => (
              <label key={threat.id} className="gear-option">
                <input
                  type="checkbox"
                  checked={engagedThreatIds.includes(threat.id)}
                  onChange={() => toggle(engagedThreatIds, threat.id, setEngagedThreatIds)}
                />
                {threat.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="pool-summary">
        <p>
          Pool: <strong>{pool.total}</strong> {pool.total === 1 ? "die" : "dice"} (needs 4+ on a d6;
          6 is a critical)
        </p>
        <details>
          <summary>Why?</summary>
          <ul>
            {pool.lines.map((line, i) => (
              <li key={`${line.label}-${i}`}>
                {line.label}: {line.dice}
              </li>
            ))}
          </ul>
        </details>
      </div>

      <button
        type="button"
        className="primary-action"
        disabled={!canDeclare}
        onClick={() => onDeclare(choice)}
      >
        Declare action
      </button>
      {character.downed && <p role="alert">You&rsquo;re down. A teammate must rescue you.</p>}
      {character.retired && <p role="alert">Your story is told.</p>}
    </section>
  );
}
