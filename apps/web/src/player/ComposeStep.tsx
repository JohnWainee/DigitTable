import { useState } from "react";
import type { PoolExplanation, PoolInput } from "@digitable/contracts";
import {
  ACTION_ID,
  ACTION_LABEL,
  THREAT_ID,
  type CharacterFullView,
} from "@digitable/template-eat-the-reich";
import { PoolExplanationDetails } from "./PoolExplanationDetails.js";

export interface ComposeStepProps {
  readonly character: CharacterFullView;
  readonly explainPool: (input: PoolInput) => PoolExplanation;
  readonly onBeginAction: (threatId: string, actionId: string, gearIds: readonly string[]) => void;
}

/** compose (docs/UX_RESOLUTION_THEATRE.md state machine / docs/EAT_THE_REICH_BUILD_GUIDE.md player flow). */
export function ComposeStep({
  character,
  explainPool,
  onBeginAction,
}: ComposeStepProps): JSX.Element {
  const [selectedGear, setSelectedGear] = useState<readonly string[]>([]);
  const pool = explainPool({ actionId: ACTION_ID, gearIds: selectedGear });

  function toggleGear(gearId: string): void {
    setSelectedGear((current) =>
      current.includes(gearId) ? current.filter((id) => id !== gearId) : [...current, gearId],
    );
  }

  return (
    <section aria-labelledby="compose-heading" className="step">
      <h2 id="compose-heading">Choose an action</h2>
      <fieldset>
        <legend>{ACTION_LABEL}</legend>
        {character.gear.length > 0 && (
          <div className="gear-list" role="group" aria-label="Gear to bring">
            {character.gear.map((gearId) => (
              <label key={gearId} className="gear-option">
                <input
                  type="checkbox"
                  checked={selectedGear.includes(gearId)}
                  onChange={() => toggleGear(gearId)}
                />
                {formatGearLabel(gearId)}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <PoolExplanationDetails pool={pool} />

      <button
        type="button"
        className="primary-action"
        onClick={() => onBeginAction(THREAT_ID, ACTION_ID, selectedGear)}
      >
        {ACTION_LABEL}
      </button>
    </section>
  );
}

function formatGearLabel(gearId: string): string {
  return gearId
    .split("-")
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}
