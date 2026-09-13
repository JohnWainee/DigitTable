import { LiveRegion } from "../accessibility/LiveRegion.js";
import type { InMemoryRoomRepository } from "../repository/InMemoryRoomRepository.js";
import { useTableProjection } from "./useTableProjection.js";
import type { EatTheReichView, RollStatus } from "@digitable/template-eat-the-reich";

export interface TableScreenProps {
  readonly repository: InMemoryRoomRepository;
}

/**
 * The read-only shared-table display (docs/PHASE_1C_PLAN.md,
 * "Shared-table projection" / docs/ARCHITECTURE.md section 6's
 * `/room/:roomId/table`, simulated locally). Renders only what the `table`
 * capability's projection contains — no hidden threat fields, no un-redacted
 * roll faces, and `self` is always null since no character binds to the
 * reserved `table` viewer. This surface issues no commands: it renders no
 * buttons, inputs, or other actionable controls anywhere below, and no
 * Pause/Fade/Veil/Skip safety controls (docs/UX_RESOLUTION_THEATRE.md: "The
 * read-only table surface cannot invoke them").
 */
export function TableScreen({ repository }: TableScreenProps): JSX.Element {
  const projection = useTableProjection(repository);
  const { view } = projection;

  return (
    <main className="table-screen">
      <header>
        <h1>{view.location.name}</h1>
        <p>{view.location.description}</p>
      </header>

      <LiveRegion politeness="polite" message={computeTableAnnouncement(view)} />

      <section aria-labelledby="table-objective-heading">
        <h2 id="table-objective-heading">Objective</h2>
        <p>{view.objective.title}</p>
      </section>

      <section aria-labelledby="table-characters-heading">
        <h2 id="table-characters-heading">Characters</h2>
        <ul className="character-list">
          {view.characters.map((character) => (
            <li key={character.memberId}>
              {character.name} — {character.wounds}/{character.maxWounds} wounds
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="table-threats-heading">
        <h2 id="table-threats-heading">Threats</h2>
        <ul className="threat-list">
          {view.threats.map((threat) => (
            <li key={threat.id}>
              <strong>{threat.name}</strong> — {threat.resolveRemaining}/{threat.maxResolve} resolve
              remaining ({threat.status})
            </li>
          ))}
        </ul>
      </section>

      {view.activeRoll && (
        <section aria-labelledby="table-roll-heading" className="step">
          <h2 id="table-roll-heading">Current roll</h2>
          <p>{describeRollStatus(view.activeRoll.status)}</p>
        </section>
      )}
    </main>
  );
}

function describeRollStatus(status: RollStatus): string {
  switch (status) {
    case "awaiting_opposition":
      return "Waiting on the opposition.";
    case "awaiting_allocation":
      return "Opposition rolled. Awaiting allocation.";
    default:
      return "Resolving.";
  }
}

function computeTableAnnouncement(view: EatTheReichView): string {
  if (!view.activeRoll) {
    return "Ready.";
  }
  return describeRollStatus(view.activeRoll.status);
}
