import type { FixtureSceneState } from "../session/fixturePlayLoop.js";

export interface SceneDirectorProps {
  readonly scene: FixtureSceneState;
  readonly onRevealThreat: (threatId: string) => void;
}

/**
 * docs/ETR_SESSION_FLOW.md section 7: scene control. Scene loading/
 * switching (`LoadScene`/`NextScene`) is B04's real command, not
 * implemented in this TEMPORARY fixture — every room opens on the first
 * scene (`drop-forecourt`). Revealing a threat works now since it only
 * touches this room's local scene state.
 */
export function SceneDirector({ scene, onRevealThreat }: SceneDirectorProps): JSX.Element {
  const hiddenThreats = scene.threats.filter((t) => !t.revealed);
  return (
    <section className="step" aria-labelledby="scene-director-heading">
      <h2 id="scene-director-heading">Scene director</h2>
      <p>
        <strong>{scene.location}</strong> — {scene.objectiveTitle} (rating {scene.objectiveRating}
        {scene.objectiveChallenge ? `, challenge ${scene.objectiveChallenge}` : ""})
      </p>
      <p className="form-hint">
        Scene switching arrives with B04; this room stays on the opening scene for now.
      </p>
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
    </section>
  );
}
