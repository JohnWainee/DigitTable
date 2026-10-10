import type { Capability, EventTailRecord } from "@digitable/contracts";
import type { EatTheReichEvent } from "@digitable/template-eat-the-reich";

function describeEvent(event: EatTheReichEvent, capability: Capability): string | null {
  switch (event.type) {
    case "BroadcastPosted":
      return `GM broadcast: ${event.text}`;
    case "PrivateMessageSent":
      if (capability === "table") return null;
      return capability === "gm"
        ? `Private note sent: ${event.text}`
        : `Private note from GM: ${event.text}`;
    case "SceneLoaded":
      return `Scene loaded: ${event.scene.title}`;
    case "MissionEnded":
      return "Mission ended.";
    case "RoundEnded":
      return "Round ended.";
    case "ThreatRevealed":
      return "A threat was revealed.";
    case "Paused":
      return "Session paused.";
    case "Resumed":
      return "Session resumed.";
    case "CharacterClaimed":
      return "A character was claimed.";
    case "CharacterReleased":
      return "A character was released.";
    case "ActionDeclared":
      return "An action was declared.";
    case "ActionRolled":
      return "An action roll was resolved.";
    case "ActionResolved":
      return "An action was completed.";
    case "InjuryCategoryChosen":
      return "An injury was recorded.";
    case "InjuryHealed":
      return "An injury was healed.";
    case "SceneEdited":
      return "The GM updated the scene.";
    case "SceneRulesChanged":
      return "Scene rules were updated.";
    case "CharacterCorrected":
      return "A character record was corrected.";
    case "RollVoided":
      return "A roll was voided.";
    case "ItemGranted":
      return "An item was granted.";
    case "AdvanceUnlocked":
      return "An advance was unlocked.";
    case "CharacterReassigned":
      return "A character was reassigned.";
    default:
      return null;
  }
}

export interface SessionTimelineProps {
  readonly records: readonly EventTailRecord<EatTheReichEvent>[];
  readonly capability: Capability;
}

/** A bounded viewer-authorized history. It is presentation only, never used to reconstruct state. */
export function SessionTimeline({ records, capability }: SessionTimelineProps): JSX.Element {
  const entries = records
    .filter((record) => capability !== "table" || record.partition === "shared")
    .map((record) => ({ record, label: describeEvent(record.payload, capability) }))
    .filter(
      (item): item is { record: EventTailRecord<EatTheReichEvent>; label: string } =>
        item.label !== null,
    );

  return (
    <section className="session-timeline" aria-labelledby="session-timeline-heading">
      <h2 id="session-timeline-heading">Session timeline</h2>
      {entries.length === 0 ? (
        <p className="form-hint">Session events will appear here.</p>
      ) : (
        <>
          {/* This independently scrolling list must be focusable so keyboard users can reach its content. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <ol aria-label="Recent session events" tabIndex={0}>
            {entries.map(({ record, label }) => (
              <li key={`${record.partition}-${record.sequence}-${record.eventId}`}>
                <span className="timeline-sequence" aria-label={`Event ${record.sequence}`}>
                  {record.sequence}
                </span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
