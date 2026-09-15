import { navigate } from "../router.js";
import {
  ConnectionStatusStrip,
  useFixtureConnectionState,
} from "../shell/ConnectionStatusStrip.js";
import { FixtureModeBanner } from "../shell/FixtureModeBanner.js";
import { readOwnershipRecord } from "../session/FixtureSessionGateway.js";
import { fixtureSessionGateway as gateway } from "../session/gateway.js";
import { lookupCharacterFixture } from "../session/fixturePlayLoop.js";
import { ETR_SCENE_FIXTURE } from "../../test/fixtures/etrTemp.js";
import { usePlayLoopFixture } from "./usePlayLoopFixture.js";
import { SceneCard } from "./SceneCard.js";
import { PartyStrip } from "./PartyStrip.js";
import { ComposeStep2 } from "./ComposeStep2.js";
import { DeclaredWaiting } from "./DeclaredWaiting.js";
import { AllocationPanel2 } from "./AllocationPanel2.js";
import { ConfirmSummary2 } from "./ConfirmSummary2.js";
import { LiveRegion } from "../accessibility/LiveRegion.js";

export interface PlayerDashboardScreenProps {
  readonly roomId: string;
}

/**
 * docs/ETR_SESSION_FLOW.md section 1: `/room/:roomId/player`. The current
 * scene is always the fixture's first scene (`drop-forecourt`) — real GM
 * scene control (`LoadScene`) is C03's `SceneDirector`; until then every
 * player dashboard opens on the opening scene.
 */
export function PlayerDashboardScreen({ roomId }: PlayerDashboardScreenProps): JSX.Element {
  const connection = useFixtureConnectionState();
  const ownership = readOwnershipRecord();
  const roomExists = gateway.roomExists(roomId);
  const roster = roomExists ? gateway.listRoster(roomId) : [];
  const mine = ownership ? roster.find((c) => c.claimedBy === ownership.memberId) : undefined;
  const characterFixture = mine ? lookupCharacterFixture(mine.id) : undefined;
  const sceneFixture = ETR_SCENE_FIXTURE[0]!;

  if (!roomExists || !ownership || ownership.roomId !== roomId || !mine || !characterFixture) {
    return (
      <main className="player-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p role="alert">
          {!roomExists
            ? "This session has ended, or fixture mode lost it on reload."
            : "Claim a character before opening the dashboard."}
        </p>
        <button
          type="button"
          className="primary-action"
          onClick={() => navigate(`/claim/${roomId}`)}
        >
          Go to character claim
        </button>
      </main>
    );
  }

  return (
    <PlayerDashboardBody
      roomId={roomId}
      connectionState={connection}
      characterFixture={characterFixture}
      sceneFixture={sceneFixture}
      roster={roster}
    />
  );
}

function PlayerDashboardBody({
  roomId,
  connectionState,
  characterFixture,
  sceneFixture,
  roster,
}: {
  readonly roomId: string;
  readonly connectionState: ReturnType<typeof useFixtureConnectionState>;
  readonly characterFixture: NonNullable<ReturnType<typeof lookupCharacterFixture>>;
  readonly sceneFixture: (typeof ETR_SCENE_FIXTURE)[number];
  readonly roster: ReturnType<typeof gateway.listRoster>;
}): JSX.Element {
  const loop = usePlayLoopFixture(roomId, characterFixture, sceneFixture);
  // A pure function of `loop.phase`: identical text on an unrelated
  // re-render does not get re-announced by `aria-live`, so this alone
  // gives one polite announcement per phase transition without an effect.
  const announcement = announcementForPhase(loop.phase);

  return (
    <main className="player-screen">
      <ConnectionStatusStrip state={connectionState} />
      <FixtureModeBanner />
      <LiveRegion politeness="polite" message={announcement} />
      <SceneCard scene={loop.scene} />
      <PartyStrip roomId={roomId} roster={roster} selfCharacterId={characterFixture.id} />
      {loop.phase === "compose" && (
        <ComposeStep2
          character={loop.character}
          threats={loop.scene.threats}
          onDeclare={loop.declare}
        />
      )}
      {loop.phase === "declared" && <DeclaredWaiting />}
      {loop.phase === "rolled" && loop.activeRoll && (
        <AllocationPanel2
          roll={loop.activeRoll}
          character={loop.character}
          scene={loop.scene}
          onAssign={loop.assign}
          onConfirm={loop.confirmAllocation}
        />
      )}
      {loop.phase === "resolved" && loop.resolved && (
        <ConfirmSummary2 resolved={loop.resolved} onPlayAgain={loop.playAgain} />
      )}
    </main>
  );
}

function announcementForPhase(phase: ReturnType<typeof usePlayLoopFixture>["phase"]): string {
  switch (phase) {
    case "declared":
      return "Declared. Waiting for the GM.";
    case "rolled":
      return "Dice rolled. Assign your results.";
    case "resolved":
      return "Action resolved.";
    case "compose":
    default:
      return "Choose an action.";
  }
}
