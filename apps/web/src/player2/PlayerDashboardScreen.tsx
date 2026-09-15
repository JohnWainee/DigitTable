import { useState } from "react";
import { navigate } from "../router.js";
import {
  ConnectionStatusStrip,
  useFixtureConnectionState,
} from "../shell/ConnectionStatusStrip.js";
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

function isFullRoll(view: RollView): view is RollViewFull {
  return "declaredStat" in view;
}

/** docs/ETR_SESSION_FLOW.md section 1: `/room/:roomId/player`, driven entirely by the real projection (C06) — no fixture engine. */
export function PlayerDashboardScreen({ roomId }: PlayerDashboardScreenProps): JSX.Element {
  const connection = useFixtureConnectionState();
  const ownership = readOwnershipRecord();
  const memberId = ownership?.roomId === roomId ? ownership.memberId : "";
  const { status, projection, dispatch } = useRoomProjection(roomId, memberId, "player");
  const [error, setError] = useState<string | null>(null);
  const [pendingResolution, setPendingResolution] = useState<ActionResolvedEvent | null>(null);

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
  ): Promise<void> {
    const result = await handleDispatch({ type: "AllocateResults", rollId, allocations });
    if (result.status === "accepted") {
      const resolved = result.sharedEvents.find(
        (event): event is ActionResolvedEvent => event.type === "ActionResolved",
      );
      if (resolved) setPendingResolution(resolved);
    }
  }

  async function handleChooseInjury(categoryId: string, rollId: string): Promise<void> {
    const result = await handleDispatch({ type: "ChooseInjuryCategory", rollId, categoryId });
    if (result.status === "accepted") {
      const chosen = result.sharedEvents.find((event) => event.type === "InjuryCategoryChosen");
      if (chosen && chosen.type === "InjuryCategoryChosen") {
        setPendingResolution((prev) =>
          prev ? { ...prev, injuryMark: chosen.mark, injuryChoicePendingMode: null } : prev,
        );
      } else {
        setPendingResolution(null);
      }
    }
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

  let body: JSX.Element;
  let announcement: string;

  if (
    pendingResolution &&
    pendingResolution.injuryChoicePendingMode &&
    !pendingResolution.injuryMark
  ) {
    body = (
      <ChooseInjuryPanel2
        character={self}
        mode={pendingResolution.injuryChoicePendingMode}
        onChoose={(categoryId) => {
          void handleChooseInjury(categoryId, pendingResolution.rollId);
        }}
      />
    );
    announcement = "Choose an injury category.";
  } else if (pendingResolution) {
    body = (
      <ConfirmSummary2
        resolved={pendingResolution}
        character={self}
        objectives={view.objectives}
        threats={view.threats}
        onContinue={() => setPendingResolution(null)}
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
          void handleAllocate(allocations, ownRoll.rollId);
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
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <SceneCard scene={view.scene} objectives={view.objectives} threats={view.threats} />
      <PartyStrip roster={view.roster} selfCharacterId={self.id} />
      {body}
    </main>
  );
}
