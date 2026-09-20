import { useState } from "react";
import type { CharacterFullSheet } from "@digitable/template-eat-the-reich";
import { Icon } from "../shared/Icon.js";

export interface ChooseInjuryPanel2Props {
  readonly character: CharacterFullSheet;
  readonly mode: "single" | "downed";
  readonly preferredCategoryId?: string | undefined;
  readonly onChoose: (categoryId: string) => void;
  readonly onUseHat: ((itemId: string) => void) | null;
}

function hasOpenBox(category: CharacterFullSheet["injuries"][number]): boolean {
  return category.boxes.some((box) => !box.marked);
}

/**
 * docs/ETR_RULES_MATRIX.md I1: the rolled injury category had no open box
 * left, so the player picks another one with room (`awaiting_injury_choice`
 * -> `ChooseInjuryCategory`). Only categories with an open box are offered;
 * `decide` still re-validates (matrix S05).
 */
export function ChooseInjuryPanel2({
  character,
  mode,
  preferredCategoryId,
  onChoose,
  onUseHat,
}: ChooseInjuryPanel2Props): JSX.Element {
  const eligible = character.injuries.filter(
    (category) =>
      hasOpenBox(category) &&
      (preferredCategoryId === undefined || category.id === preferredCategoryId),
  );
  const usableHat = character.items.find(
    (item) => item.useEffect?.kind === "ignoreInjuryOrDownedAndDestroy" && item.usesRemaining > 0,
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    eligible.some((category) => category.id === preferredCategoryId)
      ? (preferredCategoryId ?? null)
      : (eligible[0]?.id ?? null),
  );

  return (
    <section className="step" aria-labelledby="injury-choice-heading">
      <h2 id="injury-choice-heading">
        <Icon name="injury-marked" /> Choose an injury
      </h2>
      <p>
        {mode === "downed"
          ? "You're going down — pick which injury category takes it."
          : preferredCategoryId
            ? "Accept the rolled injury, or destroy the Cowboy hat to ignore it."
            : "That injury category is already full — pick another."}
      </p>
      {eligible.length === 0 ? (
        <p role="alert">No injury category has an open box. Tell your GM.</p>
      ) : (
        <fieldset>
          <legend>Injury category</legend>
          {eligible.map((category) => (
            <label key={category.id} className="gear-option">
              <input
                type="radio"
                name="injury-category"
                checked={categoryId === category.id}
                onChange={() => setCategoryId(category.id)}
              />
              {category.label}
            </label>
          ))}
        </fieldset>
      )}
      <button
        type="button"
        className="primary-action"
        disabled={!categoryId}
        onClick={() => categoryId && onChoose(categoryId)}
      >
        Confirm
      </button>
      {onUseHat && usableHat ? (
        <button type="button" className="secondary-action" onClick={() => onUseHat(usableHat.id)}>
          Destroy Cowboy hat to ignore this result
        </button>
      ) : null}
    </section>
  );
}
