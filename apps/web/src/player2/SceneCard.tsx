import type { FixtureSceneState } from "../session/fixturePlayLoop.js";

export interface SceneCardProps {
  readonly scene: FixtureSceneState;
}

/** docs/ETR_SESSION_FLOW.md section 6: scene title/art, primary Objective, revealed Threats. */
export function SceneCard({ scene }: SceneCardProps): JSX.Element {
  const revealedThreats = scene.threats.filter((t) => t.revealed);
  return (
    <section className="scene-card" aria-labelledby="scene-heading">
      <div className="scene-card-art" aria-hidden="true">
        {scene.location}
      </div>
      <h2 id="scene-heading">{scene.location}</h2>
      <div className="scene-card-objective">
        <h3>Objective</h3>
        <p>
          {scene.objectiveTitle} &mdash; rating {scene.objectiveRating}
          {scene.objectiveChallenge ? `, challenge ${scene.objectiveChallenge}` : ""}
        </p>
      </div>
      <div className="scene-card-threats">
        <h3>Threats</h3>
        {revealedThreats.length === 0 ? (
          <p>No opposition&hellip; yet.</p>
        ) : (
          <ul>
            {revealedThreats.map((threat) => (
              <li key={threat.id}>
                {threat.name} &mdash; rating {threat.rating}, attack {threat.attack}
                {threat.challenge ? `, challenge ${threat.challenge}` : ""}
                {threat.rating === 0 ? " (beaten back)" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
