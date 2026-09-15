import { useState } from "react";
import { navigate } from "../router.js";
import {
  ConnectionStatusStrip,
  useFixtureConnectionState,
} from "../shell/ConnectionStatusStrip.js";
import { FixtureModeBanner } from "../shell/FixtureModeBanner.js";
import { readOwnershipRecord } from "../session/FixtureSessionGateway.js";
import { fixtureSessionGateway as gateway } from "../session/gateway.js";
import { InvitePanel } from "./InvitePanel.js";
import { SceneDirector } from "./SceneDirector.js";
import { PendingActionsPanel } from "./PendingActionsPanel.js";
import { RosterPanel } from "./RosterPanel.js";
import { CorrectionDialog } from "./CorrectionDialog.js";
import { useGmDirectorFixture } from "./useGmDirectorFixture.js";

export interface GmDirectorScreenProps {
  readonly roomId: string;
}

/** docs/ETR_SESSION_FLOW.md section 1: `/room/:roomId/gm` — the director console. */
export function GmDirectorScreen({ roomId }: GmDirectorScreenProps): JSX.Element {
  const connection = useFixtureConnectionState();
  const ownership = readOwnershipRecord();
  const roomExists = gateway.roomExists(roomId);
  const roster = roomExists ? gateway.listRoster(roomId) : [];
  const isGm = ownership?.roomId === roomId && ownership.capability === "gm";

  const fixture = useGmDirectorFixture(roomId, roster);
  const [correctingCharacterId, setCorrectingCharacterId] = useState<string | null>(null);

  if (!roomExists || !isGm) {
    return (
      <main className="gm-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p role="alert">
          {!roomExists
            ? "This session has ended, or fixture mode lost it on reload."
            : "You can't do that from this seat."}
        </p>
        <button type="button" className="primary-action" onClick={() => navigate("/")}>
          Back to start
        </button>
      </main>
    );
  }

  const correctingCharacter = correctingCharacterId
    ? roster.find((r) => r.id === correctingCharacterId)
    : null;
  const correctingState = correctingCharacterId
    ? fixture.characterStates.get(correctingCharacterId)
    : null;

  return (
    <main className="gm-screen">
      <ConnectionStatusStrip state={connection} />
      <FixtureModeBanner />
      <h1>Director console</h1>
      <InvitePanel roomId={roomId} roomCode={ownership.roomCode} />
      <SceneDirector scene={fixture.scene} onRevealThreat={fixture.revealThreat} />
      <PendingActionsPanel
        pending={fixture.pending}
        scene={fixture.scene}
        onRoll={fixture.reviewAndRoll}
      />
      <RosterPanel
        roster={roster}
        characterStates={fixture.characterStates}
        onOpenCorrection={setCorrectingCharacterId}
      />
      {correctingCharacter && correctingState && (
        <CorrectionDialog
          characterName={correctingCharacter.name}
          currentBlood={correctingState.blood}
          onApply={(delta, reason) => {
            fixture.correctBlood(correctingCharacter.id, delta, reason);
            setCorrectingCharacterId(null);
          }}
          onClose={() => setCorrectingCharacterId(null)}
        />
      )}
    </main>
  );
}
