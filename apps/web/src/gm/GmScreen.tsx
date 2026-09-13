import { useState } from "react";
import { MAX_PUSH_DICE, type ThreatGmSummary } from "@digitable/template-eat-the-reich";
import { LiveRegion } from "../accessibility/LiveRegion.js";
import type { InMemoryRoomRepository } from "../repository/InMemoryRoomRepository.js";
import { AllocationStepper } from "../shared/AllocationStepper.js";
import { useGmFlow, type GmFlow } from "./useGmFlow.js";

export interface GmScreenProps {
  readonly repository: InMemoryRoomRepository;
}

function hasHiddenFields(
  threat: GmFlow["projection"]["view"]["threats"][number],
): threat is ThreatGmSummary {
  return "hiddenDifficultyModifier" in threat;
}

const PUSH_DICE_OPTION = {
  id: "push-dice",
  label: "Push dice",
  costPerUse: 1,
  maxUses: MAX_PUSH_DICE,
};

/**
 * The GM's director console (docs/PHASE_1C_PLAN.md, "GM opposition
 * controls" / docs/ARCHITECTURE.md section 6's `/room/:roomId/gm`,
 * simulated locally). Renders the GM's own `ViewerProjection`, including
 * every hidden field `project()` already reserves for the `gm` capability,
 * and the one GM command this template's contract supports: submitting the
 * opposition roll's push dice.
 */
export function GmScreen({ repository }: GmScreenProps): JSX.Element {
  const flow = useGmFlow(repository);
  const { view } = flow.projection;
  const activeRoll = view.activeRoll;
  const [pushDice, setPushDice] = useState(0);

  return (
    <main className="gm-screen">
      <header>
        <h1>Director console</h1>
        <p>{view.location.name}</p>
      </header>

      <LiveRegion politeness="polite" message={computeGmAnnouncement(activeRoll)} />

      <section aria-labelledby="threats-heading" className="step">
        <h2 id="threats-heading">Threats</h2>
        <ul className="threat-list">
          {view.threats.map((threat) => (
            <li key={threat.id}>
              <p>
                <strong>{threat.name}</strong> — {threat.resolveRemaining}/{threat.maxResolve}{" "}
                resolve remaining ({threat.status})
              </p>
              {hasHiddenFields(threat) && (
                <p className="gm-hidden">
                  Hidden difficulty modifier: {threat.hiddenDifficultyModifier}. Intel:{" "}
                  {threat.hiddenIntel}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {activeRoll ? (
        <section aria-labelledby="active-roll-heading" className="step">
          <h2 id="active-roll-heading">Active roll</h2>
          <p>
            {activeRoll.playerFaces !== null
              ? `Player faces: ${activeRoll.playerFaces.join(", ")} — ${activeRoll.playerHits} success${activeRoll.playerHits === 1 ? "" : "es"}.`
              : `Player hits: ${activeRoll.playerHits} (faces concealed for players by scene difficulty).`}
          </p>
          {activeRoll.hiddenDifficultyModifier !== undefined && (
            <p className="gm-hidden">
              Hidden difficulty modifier applied to this roll: {activeRoll.hiddenDifficultyModifier}
            </p>
          )}

          {activeRoll.status === "awaiting_opposition" ? (
            <>
              <div role="group" aria-label="Opposition push dice">
                <AllocationStepper
                  option={PUSH_DICE_OPTION}
                  value={pushDice}
                  budgetIfZero={MAX_PUSH_DICE}
                  onChange={setPushDice}
                />
              </div>

              {flow.errorMessage && (
                <p role="alert" className="error-message">
                  {flow.errorMessage}
                </p>
              )}

              <button
                type="button"
                className="primary-action"
                onClick={() => {
                  flow.submitOpposition(activeRoll.rollId, pushDice);
                  setPushDice(0);
                }}
              >
                Submit opposition
              </button>
            </>
          ) : (
            <p role="status">
              {activeRoll.status === "awaiting_allocation"
                ? "Opposition submitted. Awaiting the player's allocation."
                : "This roll is resolved."}
            </p>
          )}
        </section>
      ) : (
        <p>No active roll.</p>
      )}
    </main>
  );
}

function computeGmAnnouncement(activeRoll: GmFlow["projection"]["view"]["activeRoll"]): string {
  if (!activeRoll) {
    return "No pending action.";
  }
  if (activeRoll.status === "awaiting_opposition") {
    return "A player is waiting on your opposition roll.";
  }
  if (activeRoll.status === "awaiting_allocation") {
    return "Opposition submitted. Awaiting the player's allocation.";
  }
  return "";
}
