import { useState } from "react";
import { navigate } from "../router.js";
import { ConnectionStatusStrip } from "../shell/ConnectionStatusStrip.js";
import { FixtureModeBanner } from "../shell/FixtureModeBanner.js";
import { readOwnershipRecord } from "../session/ownership.js";
import { useRoomProjection } from "../session/useRoomProjection.js";
import { asCommandId, type RoomCommandResult } from "@digitable/contracts";
import type {
  AllocationTarget,
  EatTheReichEvent,
  EatTheReichView,
  RollView,
  RollViewFull,
} from "@digitable/template-eat-the-reich";
import { LiveRegion } from "../accessibility/LiveRegion.js";
import { SceneCard } from "./SceneCard.js";
import { PartyStrip } from "./PartyStrip.js";
import { ComposeStep2 } from "./ComposeStep2.js";
import { DeclaredWaiting } from "./DeclaredWaiting.js";
import { AllocationPanel2 } from "./AllocationPanel2.js";
import { ChooseInjuryPanel2 } from "./ChooseInjuryPanel2.js";
import { ConfirmSummary2, type ActionResolvedEvent } from "./ConfirmSummary2.js";

export interface PlayerDashboardScreenProps {
  readonly roomId: string;
}

/**
 * A normally resolved roll is intentionally absent from the next viewer
 * projection, so reconnect presentation cannot match a recovered event
 * through `view.rolls`. The event's server-authored character id is the
 * durable link to this player's sheet instead.
 */
export function findRecoveredActionResolution(
  result: RoomCommandResult<EatTheReichEvent> | null,
  characterId: string,
  dismissedCommandId: string | null,
): ActionResolvedEvent | undefined {
  if (result?.status !== "accepted" || result.commandId === dismissedCommandId) return undefined;
  return result.sharedEvents.find(
    (event): event is ActionResolvedEvent =>
      event.type === "ActionResolved" && event.characterId === characterId,
  );
}

function isFullRoll(view: RollView): view is RollViewFull {
  return "declaredStat" in view;
}

/** docs/ETR_SESSION_FLOW.md section 1: `/room/:roomId/player`, driven entirely by the real projection (C06) — no fixture engine. */
export function PlayerDashboardScreen({ roomId }: PlayerDashboardScreenProps): JSX.Element {
  const ownership = readOwnershipRecord();
  const memberId = ownership?.roomId === roomId ? ownership.memberId : "";
  const { status, projection, dispatch, lastError, pending, recoveredResult } = useRoomProjection(
    roomId,
    memberId,
    "player",
  );
  const connection = status === "not-found" ? "signed-out" : status;
  const [dismissedRecovery, setDismissedRecovery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingResolution, setPendingResolution] = useState<{
    readonly event: ActionResolvedEvent;
    readonly attackSuccessesRolled: number;
  } | null>(null);

  if (!ownership || ownership.roomId !== roomId) {
    return (
      <main className="player-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p role="alert">You need to join and claim a character before opening the dashboard.</p>
        <button type="button" className="primary-action" onClick={() => navigate("/join")}>
          Go to join
        </button>
      </main>
    );
  }

  if (status === "not-found") {
    return (
      <main className="player-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p role="alert">This session has ended, or fixture mode lost it on reload.</p>
        <button type="button" className="primary-action" onClick={() => navigate("/")}>
          Back to start
        </button>
      </main>
    );
  }

  const self = projection?.view.self ?? null;

  if (projection && !self) {
    return (
      <main className="player-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p role="alert">Claim a character before opening the dashboard.</p>
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

  async function handleDispatch(
    payload: Parameters<typeof dispatch>[1],
  ): Promise<RoomCommandResult<EatTheReichEvent>> {
    setError(null);
    const result = await dispatch(asCommandId(globalThis.crypto.randomUUID()), payload);
    if (result.status === "rejected") setError(result.message);
    return result;
  }

  async function handleAllocate(
    allocations: readonly { readonly dieFaceIndex: number; readonly target: AllocationTarget }[],
    rollId: string,
    attackSuccessesRolled: number,
  ): Promise<void> {
    const result = await handleDispatch({ type: "AllocateResults", rollId, allocations });
    if (result.status === "accepted") {
      const resolved = result.sharedEvents.find(
        (event): event is ActionResolvedEvent => event.type === "ActionResolved",
      );
      if (resolved) setPendingResolution({ event: resolved, attackSuccessesRolled });
    }
  }

  async function handleChooseInjury(categoryId: string, rollId: string): Promise<void> {
    const result = await handleDispatch({ type: "ChooseInjuryCategory", rollId, categoryId });
    if (result.status === "accepted") {
      const chosen = result.sharedEvents.find((event) => event.type === "InjuryCategoryChosen");
      if (chosen && chosen.type === "InjuryCategoryChosen") {
        setPendingResolution((prev) =>
          prev
            ? {
                ...prev,
                event: { ...prev.event, injuryMark: chosen.mark, injuryChoicePendingMode: null },
              }
            : prev,
        );
      } else {
        setPendingResolution(null);
      }
    }
  }

  async function handlePause(): Promise<void> {
    await handleDispatch({ type: "Pause" });
  }

  if (!projection || !self) {
    return (
      <main className="player-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p>Loading&hellip;</p>
      </main>
    );
  }

  const view: EatTheReichView = projection.view;
  const ownRollView = view.rolls.find((r) => r.characterId === self.id);
  const ownRoll = ownRollView && isFullRoll(ownRollView) ? ownRollView : null;
  const recoveredEvent = findRecoveredActionResolution(recoveredResult, self.id, dismissedRecovery);
  const resolution =
    pendingResolution ??
    (recoveredEvent
      ? {
          event: recoveredEvent,
          attackSuccessesRolled: ownRoll?.attackSuccessesRolled ?? 0,
        }
      : null);

  let body: JSX.Element;
  let announcement: string;

  if (
    resolution &&
    resolution.event.injuryChoicePendingMode &&
    !resolution.event.injuryMark &&
    ownRoll?.status === "awaiting_injury_choice"
  ) {
    body = (
      <ChooseInjuryPanel2
        character={self}
        mode={resolution.event.injuryChoicePendingMode}
        onChoose={(categoryId) => {
          void handleChooseInjury(categoryId, resolution.event.rollId);
        }}
      />
    );
    announcement = "Choose an injury category.";
  } else if (resolution) {
    body = (
      <ConfirmSummary2
        resolved={resolution.event}
        character={self}
        objectives={view.objectives}
        threats={view.threats}
        attackSuccessesRolled={resolution.attackSuccessesRolled}
        onContinue={() => {
          setPendingResolution(null);
          setDismissedRecovery(recoveredResult?.commandId ?? null);
        }}
      />
    );
    announcement = "Action resolved.";
  } else if (ownRoll?.status === "awaiting_injury_choice" && ownRoll.injuryChoicePending) {
    body = (
      <ChooseInjuryPanel2
        character={self}
        mode={ownRoll.injuryChoicePending.mode}
        onChoose={(categoryId) => {
          void handleChooseInjury(categoryId, ownRoll.rollId);
        }}
      />
    );
    announcement = "Choose an injury category.";
  } else if (ownRoll?.status === "awaiting_allocation") {
    body = (
      <AllocationPanel2
        projection={projection}
        roll={ownRoll}
        character={self}
        onConfirm={(allocations) => {
          void handleAllocate(allocations, ownRoll.rollId, ownRoll.attackSuccessesRolled ?? 0);
        }}
      />
    );
    announcement = "Dice rolled. Assign your results.";
  } else if (ownRoll?.status === "declared") {
    body = <DeclaredWaiting />;
    announcement = "Declared. Waiting for the GM.";
  } else {
    body = (
      <ComposeStep2
        projection={projection}
        character={self}
        threats={view.threats}
        onDeclare={(command) => {
          void handleDispatch(command);
        }}
      />
    );
    announcement = "Choose an action.";
  }

  return (
    <main className="player-screen">
      <ConnectionStatusStrip state={connection} />
      <FixtureModeBanner />
      <LiveRegion politeness="polite" message={announcement} />
      {pending && (
        <p role="status">
          Your action is awaiting confirmation. Reconnecting will check it automatically.
        </p>
      )}
      {(error || lastError) && (
        <p role="alert" className="error-message">
          {error ?? lastError?.message}
        </p>
      )}
      {view.paused && (
        <p role="status" className="form-hint">
          Paused.
        </p>
      )}
      <div className="landing-actions">
        <button
          type="button"
          className="secondary-action"
          disabled={view.paused}
          onClick={() => {
            void handlePause();
          }}
        >
          {view.paused ? "Paused" : "Pause"}
        </button>
      </div>
      <SceneCard scene={view.scene} objectives={view.objectives} threats={view.threats} />
      <PartyStrip roster={view.roster} selfCharacterId={self.id} />
      {body}
    </main>
  );
}
