import { useState } from "react";
import {
  eatTheReichTemplate,
  STATS,
  type CharacterFullSheet,
  type EatTheReichCommand,
  type Stat,
} from "@digitable/template-eat-the-reich";
import type { ViewerProjection } from "@digitable/contracts";
import type { EatTheReichView } from "@digitable/template-eat-the-reich";
import { Icon, STAT_ICON_NAMES, STAT_LABELS } from "../shared/Icon.js";

export interface ComposeStep2Props {
  readonly projection: ViewerProjection<EatTheReichView>;
  readonly character: CharacterFullSheet;
  readonly threats: EatTheReichView["threats"];
  readonly onDeclare: (choice: Extract<EatTheReichCommand, { type: "BeginAction" }>) => void;
}

function highestStatIndex(character: CharacterFullSheet): number {
  let best = 0;
  for (let i = 1; i < STATS.length; i += 1) {
    if (character.stats[STATS[i]!] > character.stats[STATS[best]!]) best = i;
  }
  return best;
}

/** docs/ETR_SESSION_FLOW.md section 6.1: stat / items / abilities / bonus claims / engaged threats, derived from the real `self` sheet (C06). */
export function ComposeStep2({
  projection,
  character,
  threats,
  onDeclare,
}: ComposeStep2Props): JSX.Element {
  // F05 P1: defaults to the character's highest stat, not always the first.
  const [statIndex, setStatIndex] = useState<number | null>(() => highestStatIndex(character));
  const [itemIds, setItemIds] = useState<readonly string[]>([]);
  const [abilityIds, setAbilityIds] = useState<readonly string[]>([]);
  const [bonusClaimIds, setBonusClaimIds] = useState<readonly string[]>([]);
  const [engagedThreatIds, setEngagedThreatIds] = useState<readonly string[]>([]);

  const revealedThreats = threats.filter((t) => t.status === "active");
  const selectableAbilities = character.abilities.filter((a) => a.trigger !== "special");
  const specialAbilities = character.abilities.filter((a) => a.trigger === "special");
  const claimableIds = [...itemIds, ...abilityIds];

  function toggle(
    list: readonly string[],
    id: string,
    set: (next: readonly string[]) => void,
  ): void {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  function toggleClaimable(
    list: readonly string[],
    id: string,
    set: (next: readonly string[]) => void,
  ): void {
    const removing = list.includes(id);
    toggle(list, id, set);
    if (removing) setBonusClaimIds((claims) => claims.filter((x) => x !== id));
  }

  const stat: Stat | "none" = statIndex === null ? "none" : STATS[statIndex]!;

  // Real explainPool (packages/contracts) is still shaped for the old
  // placeholder (`actionId`/`gearIds`, no ability/bonus preview — see
  // templates/eat-the-reich/src/engine.ts's own doc comment on this gap,
  // proposed for extension to Sonnet A). Base total from the real function;
  // abilities/claimed bonuses added as a clearly-informational client-side
  // estimate on top — never authoritative, matching every other allocation
  // control here (the GM's `ReviewAction` computes the real pool).
  const basePool = eatTheReichTemplate.explainPool(projection, {
    actionId: stat,
    gearIds: itemIds,
  });
  const abilityDice = abilityIds.length;
  const claimedBonusDice = claimableIds
    .filter((id) => bonusClaimIds.includes(id))
    .reduce((sum, id) => {
      const item = character.items.find((i) => i.id === id);
      const ability = character.abilities.find((a) => a.id === id);
      return sum + (item?.bonusPlus ?? ability?.bonusPlus ?? 0);
    }, 0);
  const estimatedTotal = basePool.total + abilityDice + claimedBonusDice;

  const canDeclare = !character.downed && !character.retired;

  function handleDeclare(): void {
    onDeclare({
      type: "BeginAction",
      characterId: character.id,
      stat,
      itemIds,
      abilityIds,
      bonusClaimIds,
      engagedThreatIds,
      note: null,
    });
  }

  return (
    <section className="step" aria-labelledby="compose-heading">
      <h2 id="compose-heading">Choose an action</h2>

      <fieldset>
        <legend>Stat</legend>
        {STATS.map((statName, i) => (
          <label key={statName} className="gear-option">
            <input
              type="radio"
              name="stat"
              checked={statIndex === i}
              onChange={() => setStatIndex(i)}
            />
            <Icon name={STAT_ICON_NAMES[i]!} className="stat-icon" />
            {STAT_LABELS[i]} ({character.stats[statName]})
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
            const disabled =
              ability.trigger === "blood" && character.blood < (ability.bloodCost ?? 1);
            return (
              <label key={ability.id} className="gear-option">
                <input
                  type="checkbox"
                  checked={abilityIds.includes(ability.id)}
                  disabled={disabled}
                  onChange={() => toggleClaimable(abilityIds, ability.id, setAbilityIds)}
                />
                {ability.name} (
                {ability.trigger === "blood" ? `${ability.bloodCost ?? 1} Blood` : "free"})
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
              const bonusPlus = item?.bonusPlus ?? ability?.bonusPlus ?? 0;
              const bonusRequirement = item?.bonusRequirement ?? ability?.bonusRequirement ?? "";
              const name = item?.name ?? ability?.name ?? "";
              if (!bonusPlus) return null;
              return (
                <label key={id} className="gear-option">
                  <input
                    type="checkbox"
                    checked={bonusClaimIds.includes(id)}
                    onChange={() => toggle(bonusClaimIds, id, setBonusClaimIds)}
                  />
                  I&rsquo;m meeting {name}&rsquo;s bonus ({bonusRequirement}, +{bonusPlus})
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
          Pool: <strong>{estimatedTotal}</strong> {estimatedTotal === 1 ? "die" : "dice"} (needs 4+
          on a d6; 6 is a critical)
        </p>
        <details>
          <summary>Why?</summary>
          <ul>
            {basePool.components.map((component, i) => (
              <li key={`${component.label}-${i}`}>
                {component.label}: {component.value}
              </li>
            ))}
            {abilityDice > 0 && <li>Abilities selected: {abilityDice}</li>}
            {claimedBonusDice > 0 && <li>Claimed bonuses (pending GM): {claimedBonusDice}</li>}
          </ul>
        </details>
      </div>

      <button
        type="button"
        className="primary-action"
        disabled={!canDeclare}
        onClick={handleDeclare}
      >
        Declare action
      </button>
      {character.downed && <p role="alert">You&rsquo;re down. A teammate must rescue you.</p>}
      {character.retired && <p role="alert">Your story is told.</p>}
    </section>
  );
}
