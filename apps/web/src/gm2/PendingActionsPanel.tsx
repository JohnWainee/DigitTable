import { useState } from "react";
import {
  buildPool,
  type CharacterFullSheet,
  type EatTheReichView,
  type RollViewFull,
} from "@digitable/template-eat-the-reich";

export interface PendingActionsPanelProps {
  readonly pending: readonly RollViewFull[];
  readonly gmSheets: readonly CharacterFullSheet[];
  readonly threats: EatTheReichView["threats"];
  readonly onReview: (
    rollId: string,
    approvedClaimIds: readonly string[],
    engagedThreatIds: readonly string[],
  ) => void;
}

/** docs/ETR_SESSION_FLOW.md section 6.2: the GM's pending-declarations review — approve/strike each claim, confirm engaged threats, roll (`ReviewAction`). */
export function PendingActionsPanel({
  pending,
  gmSheets,
  threats,
  onReview,
}: PendingActionsPanelProps): JSX.Element {
  return (
    <section className="step" aria-labelledby="pending-actions-heading">
      <h2 id="pending-actions-heading">Pending actions</h2>
      {pending.length === 0 ? (
        <p>No one is waiting on you.</p>
      ) : (
        <ul className="pending-actions-list">
          {pending.map((roll) => {
            const character = gmSheets.find((c) => c.id === roll.characterId);
            if (!character) return null;
            return (
              <PendingActionCard
                key={roll.rollId}
                roll={roll}
                character={character}
                threats={threats}
                onReview={onReview}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

function PendingActionCard({
  roll,
  character,
  threats,
  onReview,
}: {
  readonly roll: RollViewFull;
  readonly character: CharacterFullSheet;
  readonly threats: EatTheReichView["threats"];
  readonly onReview: PendingActionsPanelProps["onReview"];
}): JSX.Element {
  const claimableIds = [...roll.declaredItemIds, ...roll.declaredAbilityIds];
  const claimsWithBonus = roll.declaredBonusClaimIds
    .map(
      (id) =>
        character.items.find((i) => i.id === id) ?? character.abilities.find((a) => a.id === id),
    )
    .filter((source): source is NonNullable<typeof source> => Boolean(source));

  const [approvedClaimIds, setApprovedClaimIds] = useState<readonly string[]>(
    claimsWithBonus.map((c) => c.id), // default: approve every claim
  );
  const [engagedThreatIds, setEngagedThreatIds] = useState<readonly string[]>(
    roll.declaredEngagedThreatIds, // default: the player's own proposal
  );

  function toggleClaim(id: string): void {
    setApprovedClaimIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }
  function toggleThreat(id: string): void {
    setEngagedThreatIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  const poolOutcome = buildPool(character, {
    stat: roll.declaredStat,
    itemIds: roll.declaredItemIds,
    abilityIds: roll.declaredAbilityIds.filter((id) =>
      character.abilities.some((a) => a.id === id && a.trigger !== "special"),
    ),
  });
  const approvedBonusDice = claimsWithBonus
    .filter((source) => approvedClaimIds.includes(source.id))
    .reduce((sum, source) => sum + (source.bonusPlus ?? 0), 0);
  const diceCount = (poolOutcome.ok ? poolOutcome.result.total : 0) + approvedBonusDice;

  return (
    <li className="pending-action-card">
      <h3>{character.name}</h3>
      <p>
        Stat: {roll.declaredStat === "none" ? "No stat fits" : roll.declaredStat}
        {roll.declaredItemIds.length > 0 &&
          ` · Items: ${roll.declaredItemIds
            .map((id) => character.items.find((i) => i.id === id)?.name)
            .filter(Boolean)
            .join(", ")}`}
        {roll.declaredAbilityIds.length > 0 &&
          ` · Abilities: ${roll.declaredAbilityIds
            .map((id) => character.abilities.find((a) => a.id === id)?.name)
            .filter(Boolean)
            .join(", ")}`}
      </p>
      {roll.note && <p className="form-hint">&ldquo;{roll.note}&rdquo;</p>}
      {!poolOutcome.ok && (
        <p role="alert">Pool preview unavailable: {poolOutcome.rejection.kind}.</p>
      )}

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
                {source.name} (+{source.bonusPlus ?? 0}, {source.bonusRequirement})
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend>Engaged threats</legend>
        <div className="gear-list">
          {threats
            .filter((t) => t.status === "active")
            .map((threat) => (
              <label key={threat.id} className="gear-option">
                <input
                  type="checkbox"
                  checked={engagedThreatIds.includes(threat.id)}
                  onChange={() => toggleThreat(threat.id)}
                />
                {threat.name}
                {"revealed" in threat && !threat.revealed ? " (not yet revealed to players)" : ""}
              </label>
            ))}
        </div>
      </fieldset>

      <p>
        Pool: <strong>{diceCount}</strong> {diceCount === 1 ? "die" : "dice"}
        {claimableIds.length !== roll.declaredBonusClaimIds.length ? " (before approval)" : ""}
      </p>
      <button
        type="button"
        className="primary-action"
        onClick={() => onReview(roll.rollId, approvedClaimIds, engagedThreatIds)}
      >
        Roll it
      </button>
    </li>
  );
}
