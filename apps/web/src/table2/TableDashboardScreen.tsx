import { navigate } from "../router.js";
import { ConnectionStatusStrip } from "../shell/ConnectionStatusStrip.js";
import { FixtureModeBanner } from "../shell/FixtureModeBanner.js";
import { readOwnershipRecord } from "../session/ownership.js";
import { useRoomProjection } from "../session/useRoomProjection.js";
import type { EatTheReichView, RollView, RollViewFull } from "@digitable/template-eat-the-reich";
import { SceneCard } from "../player2/SceneCard.js";
import { PartyStrip } from "../player2/PartyStrip.js";
import { RouteMap, ROUTE_MAP_SCENE_ORDER } from "./RouteMap.js";

export interface TableDashboardScreenProps {
  readonly roomId: string;
}

function isFullRoll(view: RollView): view is RollViewFull {
  return "declaredStat" in view;
}

function clearedSceneIds(view: EatTheReichView): readonly string[] {
  if (!view.scene) return [];
  const index = ROUTE_MAP_SCENE_ORDER.indexOf(view.scene.id);
  if (index < 0) return [];
  const passed = ROUTE_MAP_SCENE_ORDER.slice(0, index);
  const primaryComplete = view.objectives.some(
    (o) => o.kind === "primary" && o.status === "complete",
  );
  return primaryComplete ? [...passed, view.scene.id] : passed;
}

/**
 * docs/ETR_SESSION_FLOW.md section 1/10: `/room/:roomId/table` — the
 * shared, read-only display, driven entirely by the real projection
 * (C06). Renders no controls, no inputs, and nothing beyond what section
 * 10 allows (no GM notes, no unrevealed threats, no bonus-claim notes, no
 * code/passphrase, pending declarations reduced to a name only) — the real
 * `table` capability's own projection already enforces that (matrix
 * Appendix C), this screen just never asks for more.
 */
export function TableDashboardScreen({ roomId }: TableDashboardScreenProps): JSX.Element {
  const ownership = readOwnershipRecord();
  const memberId = ownership?.roomId === roomId ? ownership.memberId : "";
  const isTable = ownership?.roomId === roomId && ownership.capability === "table";
  const { status, projection } = useRoomProjection(roomId, memberId, "table");
  const connection = status === "not-found" ? "signed-out" : status;

  if (!isTable) {
    return (
      <main className="table-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p role="alert">This display isn&rsquo;t connected to a room.</p>
        <button type="button" className="secondary-action" onClick={() => navigate("/")}>
          Back to start
        </button>
      </main>
    );
  }

  if (status === "not-found") {
    return (
      <main className="table-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p role="alert">This session has ended, or fixture mode lost it on reload.</p>
        <button type="button" className="secondary-action" onClick={() => navigate("/")}>
          Back to start
        </button>
      </main>
    );
  }

  if (!projection) {
    return (
      <main className="table-screen">
        <ConnectionStatusStrip state={connection} />
        <FixtureModeBanner />
        <p>Loading&hellip;</p>
      </main>
    );
  }

  const view = projection.view;
  const acting = view.rolls.filter((r) => r.status === "declared");
  const activeRolls = view.rolls
    .filter(isFullRoll)
    .filter((r) => r.status !== "declared" && (r.keptDice?.length ?? 0) > 0);

  function nameFor(characterId: string): string {
    return view.roster.find((c) => c.id === characterId)?.name ?? "Someone";
  }

  return (
    <main className="table-screen">
      <ConnectionStatusStrip state={connection} />
      <FixtureModeBanner />
      <h1>Eat the Reich</h1>
      {view.paused && (
        <p role="status" className="form-hint">
          Paused
        </p>
      )}
      <RouteMap currentSceneId={view.scene?.id ?? null} clearedSceneIds={clearedSceneIds(view)} />
      <SceneCard
        scene={view.scene}
        objectives={view.objectives}
        threats={view.threats}
        artVariant="banner"
      />
      <PartyStrip roster={view.roster} />

      {acting.length > 0 && (
        <section aria-labelledby="acting-heading">
          <h2 id="acting-heading">Acting</h2>
          <ul>
            {acting.map((roll) => (
              <li key={roll.rollId}>{nameFor(roll.characterId)} is acting&hellip;</li>
            ))}
          </ul>
        </section>
      )}

      {activeRolls.length > 0 && (
        <section aria-labelledby="current-roll-heading">
          <h2 id="current-roll-heading">Current roll</h2>
          {activeRolls.map((roll) => (
            <div key={roll.rollId}>
              <p>{nameFor(roll.characterId)}</p>
              <ul className="dice-chip-row" aria-label={`${nameFor(roll.characterId)}'s kept dice`}>
                {(roll.keptDice ?? []).map((die) => (
                  <li key={die.faceIndex} className={`die-chip die-chip--${die.result}`}>
                    {die.face}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
