import { useState } from "react";
import { navigate } from "../router.js";
import {
  ConnectionStatusStrip,
  useFixtureConnectionState,
} from "../shell/ConnectionStatusStrip.js";
import { FixtureModeBanner } from "../shell/FixtureModeBanner.js";
import { readOwnershipRecord } from "../session/ownership.js";
import { useRoomProjection } from "../session/useRoomProjection.js";
import { asCommandId } from "@digitable/contracts";
import type {
  EatTheReichCommand,
  RollView,
  RollViewFull,
  SceneDefinition,
} from "@digitable/template-eat-the-reich";
import { LiveRegion } from "../accessibility/LiveRegion.js";
import { InvitePanel } from "./InvitePanel.js";
import { SceneDirector } from "./SceneDirector.js";
import { PendingActionsPanel } from "./PendingActionsPanel.js";
import { RosterPanel } from "./RosterPanel.js";
import { CorrectionDialog } from "./CorrectionDialog.js";

export interface GmDirectorScreenProps {
  readonly roomId: string;
}

function isFullRoll(view: RollView): view is RollViewFull {
  return "declaredStat" in view;
}

/** docs/ETR_SESSION_FLOW.md section 1: `/room/:roomId/gm` — the director console, driven entirely by the real projection (C06). */
export function GmDirectorScreen({ roomId }: GmDirectorScreenProps): JSX.Element {
  const connection = useFixtureConnectionState();
  const ownership = readOwnershipRecord();
  const memberId = ownership?.roomId === roomId ? ownership.memberId : "";
  const isGm = ownership?.roomId === roomId && ownership.capability === "gm";
  const { status, projection, dispatch } = useRoomProjection(roomId, memberId, "gm");
  const [correctingCharacterId, setCorrectingCharacterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isGm) {
    return (
      <main className="gm-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p role="alert">You can&rsquo;t do that from this seat.</p>
        <button type="button" className="primary-action" onClick={() => navigate("/")}>
          Back to start
        </button>
      </main>
    );
  }

  if (status === "not-found") {
    return (
      <main className="gm-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p role="alert">This session has ended, or fixture mode lost it on reload.</p>
        <button type="button" className="primary-action" onClick={() => navigate("/")}>
          Back to start
        </button>
      </main>
    );
  }

  if (!projection) {
    return (
      <main className="gm-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p>Loading&hellip;</p>
      </main>
    );
  }

  async function send(payload: EatTheReichCommand): Promise<void> {
    setError(null);
    const result = await dispatch(asCommandId(globalThis.crypto.randomUUID()), payload);
    if (result.status === "rejected") setError(result.message);
  }

  const view = projection.view;
  const pending = view.rolls.filter(isFullRoll).filter((r) => r.status === "declared");
  const claimedCount = view.roster.filter((c) => c.claimedByMemberId !== null).length;

  const correctingCharacter = correctingCharacterId
    ? view.gmSheets.find((c) => c.id === correctingCharacterId)
    : null;

  const pendingAnnouncement =
    pending.length === 0
      ? "No pending actions."
      : `${pending.length} action${pending.length === 1 ? "" : "s"} waiting for review.`;

  return (
    <main className="gm-screen">
      <ConnectionStatusStrip state={connection} />
      <FixtureModeBanner />
      <h1>Director console</h1>
      <LiveRegion politeness="polite" message={pendingAnnouncement} />
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <InvitePanel
        roomCode={ownership.roomCode}
        claimedCount={claimedCount}
        rosterSize={view.roster.length}
      />
      <SceneDirector
        scene={view.scene}
        objectives={view.objectives}
        threats={view.threats}
        onLoadScene={(definition: SceneDefinition) => {
          const { gmBriefing: _gmBriefing, ...payload } = definition;
          void send({ type: "LoadScene", ...payload });
        }}
        onNextScene={(definition: SceneDefinition, reason: string | null) => {
          const { gmBriefing: _gmBriefing, ...payload } = definition;
          void send({ type: "NextScene", ...payload, reason });
        }}
        onRevealThreat={(threatId) => {
          void send({ type: "RevealThreat", threatId });
        }}
      />
      <PendingActionsPanel
        pending={pending}
        gmSheets={view.gmSheets}
        threats={view.threats}
        onReview={(rollId, approvedClaimIds, engagedThreatIds) => {
          void send({ type: "ReviewAction", rollId, approvedClaimIds, engagedThreatIds });
        }}
      />
      <RosterPanel gmSheets={view.gmSheets} onOpenCorrection={setCorrectingCharacterId} />
      {correctingCharacter && (
        <CorrectionDialog
          characterName={correctingCharacter.name}
          currentBlood={correctingCharacter.blood}
          onApply={(delta, reason) => {
            const next = Math.max(0, Math.min(10, correctingCharacter.blood + delta));
            void send({
              type: "CorrectCharacter",
              characterId: correctingCharacter.id,
              reason,
              patch: { blood: next },
            });
            setCorrectingCharacterId(null);
          }}
          onClose={() => setCorrectingCharacterId(null)}
        />
      )}
    </main>
  );
}
