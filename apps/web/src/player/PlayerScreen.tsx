import { LiveRegion } from "../accessibility/LiveRegion.js";
import type { InMemoryRoomRepository } from "../repository/InMemoryRoomRepository.js";
import { ActiveRollPanel } from "./ActiveRollPanel.js";
import { ComposeStep } from "./ComposeStep.js";
import { ConfirmStep } from "./ConfirmStep.js";
import { usePlayerActionFlow, type PlayerActionFlow } from "./usePlayerActionFlow.js";

export interface PlayerScreenProps {
  readonly repository: InMemoryRoomRepository;
}

/** Top-level player surface: scene summary, one persistent status announcement, and the active step. */
export function PlayerScreen({ repository }: PlayerScreenProps): JSX.Element {
  const flow = usePlayerActionFlow(repository);
  const { view } = flow.projection;

  return (
    <main className="player-screen">
      <header>
        <h1>{view.location.name}</h1>
        <p>{view.location.description}</p>
      </header>

      <section aria-labelledby="objective-heading">
        <h2 id="objective-heading">Objective</h2>
        <p>{view.objective.title}</p>
      </section>

      <LiveRegion politeness="polite" message={computeAnnouncement(flow)} />

      {flow.errorMessage && (
        <p role="alert" className="error-message">
          {flow.errorMessage}
        </p>
      )}

      {flow.resolvedSummary ? (
        <ConfirmStep summary={flow.resolvedSummary} onPlayAgain={flow.playAgain} />
      ) : view.activeRoll ? (
        <ActiveRollPanel
          roll={view.activeRoll}
          validAllocations={flow.validAllocations}
          onAllocate={flow.allocate}
        />
      ) : view.self ? (
        <ComposeStep
          character={view.self}
          explainPool={flow.explainPool}
          onBeginAction={flow.beginAction}
        />
      ) : (
        <p role="alert">No character is available in this room.</p>
      )}
    </main>
  );
}

function computeAnnouncement(flow: PlayerActionFlow): string {
  if (flow.resolvedSummary) {
    return "Action resolved.";
  }
  const roll = flow.projection.view.activeRoll;
  if (!roll) {
    return "Ready to act.";
  }
  if (roll.status === "awaiting_opposition") {
    return "Waiting on the opposition.";
  }
  if (roll.status === "awaiting_allocation") {
    return "Opposition rolled. Allocate your net successes.";
  }
  return "";
}
