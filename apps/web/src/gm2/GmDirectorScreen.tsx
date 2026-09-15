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
  CharacterCorrectionPatch,
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
import { GmToolsPanel } from "./GmToolsPanel.js";
import { CorrectionDialog } from "./CorrectionDialog.js";

export interface GmDirectorScreenProps {
  readonly roomId: string;
}

function isFullRoll(view: RollView): view is RollViewFull {
  return "declaredStat" in view;
}

/** docs/ETR_SESSION_FLOW.md section 1: `/room/:roomId/gm` — the director console, driven entirely by the real projection (C06/C07). */
export function GmDirectorScreen({ roomId }: GmDirectorScreenProps): JSX.Element {
  const connection = useFixtureConnectionState();
  const ownership = readOwnershipRecord();
  const memberId = ownership?.roomId === roomId ? ownership.memberId : "";
  const isGm = ownership?.roomId === roomId && ownership.capability === "gm";
  const { status, projection, dispatch } = useRoomProjection(roomId, memberId, "gm");
  const [correctingCharacterId, setCorrectingCharacterId] = useState<string | null>(null);
  const [missionEndReason, setMissionEndReason] = useState("");
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
  const primaryComplete = view.objectives.some(
    (o) => o.kind === "primary" && o.status === "complete",
  );

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
      {view.paused && (
        <p role="status" className="form-hint">
          Session paused.
        </p>
      )}
      {view.missionEnded && (
        <p role="status" className="form-hint">
          Mission ended.
        </p>
      )}

      <div className="landing-actions">
        {view.paused ? (
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              void send({ type: "Resume" });
            }}
          >
            Resume
          </button>
        ) : (
          <button
            type="button"
            className="secondary-action"
            onClick={() => {
              void send({ type: "Pause" });
            }}
          >
            Pause
          </button>
        )}
      </div>

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
        onEndRound={() => {
          void send({ type: "EndRound" });
        }}
        onSetSceneRules={(reinforcements, reason) => {
          void send({ type: "SetSceneRules", reinforcements, reason });
        }}
        onEditRating={(target, fields, reason) => {
          if (target.kind === "objective") {
            void send({
              type: "EditScene",
              reason,
              updateObjectives: [{ objectiveId: target.id, ...fields }],
            });
          } else {
            void send({
              type: "EditScene",
              reason,
              updateThreats: [{ threatId: target.id, ...fields }],
            });
          }
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
      <GmToolsPanel
        gmSheets={view.gmSheets}
        rolls={view.rolls}
        onVoidRoll={(rollId, reason) => {
          void send({ type: "VoidRoll", rollId, reason });
        }}
        onGrantItem={(characterId, item, reason) => {
          void send({ type: "GrantItem", characterId, item, reason });
        }}
        onUnlockAdvance={(characterId, advanceId, reason) => {
          void send({ type: "UnlockAdvance", characterId, advanceId, reason });
        }}
        onReassignCharacter={(characterId, memberIdInput, reason) => {
          void send({ type: "ReassignCharacter", characterId, memberId: memberIdInput, reason });
        }}
      />

      {!view.missionEnded && (
        <fieldset>
          <legend>End mission</legend>
          {!primaryComplete && (
            <div className="form-field">
              <label htmlFor="mission-end-reason">
                Reason (required — the final Objective isn&rsquo;t complete)
              </label>
              <input
                id="mission-end-reason"
                type="text"
                value={missionEndReason}
                onChange={(e) => setMissionEndReason(e.target.value)}
              />
            </div>
          )}
          <button
            type="button"
            className="secondary-action"
            disabled={!primaryComplete && missionEndReason.trim() === ""}
            onClick={() => {
              void send({
                type: "EndMission",
                reason: primaryComplete ? null : missionEndReason,
              });
              setMissionEndReason("");
            }}
          >
            End mission
          </button>
        </fieldset>
      )}

      {correctingCharacter && (
        <CorrectionDialog
          character={correctingCharacter}
          onApply={(patch: CharacterCorrectionPatch, reason: string) => {
            void send({
              type: "CorrectCharacter",
              characterId: correctingCharacter.id,
              reason,
              patch,
            });
            setCorrectingCharacterId(null);
          }}
          onClose={() => setCorrectingCharacterId(null)}
        />
      )}
    </main>
  );
}
