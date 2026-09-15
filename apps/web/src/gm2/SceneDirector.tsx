import { useState } from "react";
import {
  ORIGINAL_MISSION,
  type EatTheReichView,
  type SceneDefinition,
} from "@digitable/template-eat-the-reich";

export interface SceneDirectorProps {
  readonly scene: EatTheReichView["scene"];
  readonly objectives: EatTheReichView["objectives"];
  readonly threats: EatTheReichView["threats"];
  readonly onLoadScene: (definition: SceneDefinition) => void;
  readonly onNextScene: (definition: SceneDefinition, reason: string | null) => void;
  readonly onRevealThreat: (threatId: string) => void;
}

/**
 * docs/ETR_SESSION_FLOW.md section 7/5: scene control against B04's real
 * `LoadScene`/`NextScene`/`RevealThreat` commands. The template has no
 * server-side scene catalog (scenes.ts's own doc comment); this is the
 * "natural place" it names for presenting `ORIGINAL_MISSION` and sending
 * one as a command's payload (F05 P1: replaces the "Scene switching
 * arrives with B04" placeholder — B04 has landed).
 */
export function SceneDirector({
  scene,
  objectives,
  threats,
  onLoadScene,
  onNextScene,
  onRevealThreat,
}: SceneDirectorProps): JSX.Element {
  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    ORIGINAL_MISSION.find((s) => s.sceneId !== scene?.id)?.sceneId ?? ORIGINAL_MISSION[0]!.sceneId,
  );
  const [reason, setReason] = useState("");

  const selected =
    ORIGINAL_MISSION.find((s) => s.sceneId === selectedSceneId) ?? ORIGINAL_MISSION[0]!;
  const primaryComplete = objectives.some((o) => o.kind === "primary" && o.status === "complete");
  const hiddenThreats = threats.filter((t) => "revealed" in t && !t.revealed);

  function handleAdvance(): void {
    if (!scene) {
      onLoadScene(selected);
      return;
    }
    onNextScene(selected, primaryComplete ? null : reason);
    setReason("");
  }

  const canAdvance = scene ? primaryComplete || reason.trim() !== "" : true;

  return (
    <section className="step" aria-labelledby="scene-director-heading">
      <h2 id="scene-director-heading">Scene director</h2>
      {scene ? (
        <p>
          <strong>{scene.locationLabel}</strong> &mdash; round {scene.round}
        </p>
      ) : (
        <p>No scene loaded yet.</p>
      )}

      {hiddenThreats.length > 0 && (
        <div className="gear-list">
          {hiddenThreats.map((threat) => (
            <div key={threat.id} className="gear-option">
              <span>{threat.name} (hidden from players)</span>
              <button
                type="button"
                className="secondary-action"
                onClick={() => onRevealThreat(threat.id)}
              >
                Reveal
              </button>
            </div>
          ))}
        </div>
      )}

      <fieldset>
        <legend>{scene ? "Advance to a new scene" : "Load the opening scene"}</legend>
        <label htmlFor="scene-select">Scene</label>
        <select
          id="scene-select"
          value={selectedSceneId}
          onChange={(e) => setSelectedSceneId(e.target.value)}
        >
          {ORIGINAL_MISSION.map((definition) => (
            <option key={definition.sceneId} value={definition.sceneId}>
              {definition.title}
            </option>
          ))}
        </select>
        <p className="form-hint">{selected.gmBriefing}</p>
        {scene && !primaryComplete && (
          <div className="form-field">
            <label htmlFor="scene-reason">
              Reason (required — the primary Objective isn&rsquo;t complete)
            </label>
            <input
              id="scene-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}
        <button
          type="button"
          className="primary-action"
          disabled={!canAdvance}
          onClick={handleAdvance}
        >
          {scene ? "Advance scene" : "Load scene"}
        </button>
      </fieldset>
    </section>
  );
}
