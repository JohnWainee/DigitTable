import type { FixtureSceneState } from "../session/fixturePlayLoop.js";
import { Icon } from "../shared/Icon.js";
import { SceneArt } from "../shared/SceneArt.js";
import { ThreatToken } from "../shared/ThreatToken.js";

export interface SceneCardProps {
  readonly scene: FixtureSceneState;
}

/** docs/ETR_SESSION_FLOW.md section 6: scene title/art, primary Objective, revealed Threats. */
export function SceneCard({ scene }: SceneCardProps): JSX.Element {
  const revealedThreats = scene.threats.filter((t) => t.revealed);
  return (
    <section className="scene-card" aria-labelledby="scene-heading">
      <SceneArt sceneId={scene.id} location={scene.location} />
      <h2 id="scene-heading">{scene.location}</h2>
      <div className="scene-card-objective">
        <h3>
          <Icon name="objective" /> Objective
        </h3>
        <p>
          {scene.objectiveTitle} &mdash; rating {scene.objectiveRating}
          {scene.objectiveChallenge ? (
            <>
              , <Icon name="challenge" label="challenge" /> {scene.objectiveChallenge}
            </>
          ) : (
            ""
          )}
        </p>
      </div>
      <div className="scene-card-threats">
        <h3>
          <Icon name="threat" /> Threats
        </h3>
        {revealedThreats.length === 0 ? (
          <p>No opposition&hellip; yet.</p>
        ) : (
          <ul>
            {revealedThreats.map((threat) => (
              <li key={threat.id} className={threat.rating === 0 ? "threat-beaten" : ""}>
                <ThreatToken threatId={threat.imageId} beaten={threat.rating === 0} />
                {threat.name} &mdash; rating {threat.rating}, <Icon name="attack" label="attack" />{" "}
                {threat.attack}
                {threat.challenge ? (
                  <>
                    , <Icon name="challenge" label="challenge" /> {threat.challenge}
                  </>
                ) : (
                  ""
                )}
                {threat.rating === 0 ? " (beaten back)" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
