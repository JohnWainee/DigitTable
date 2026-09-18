import type { EatTheReichView } from "@digitable/template-eat-the-reich";
import { Icon } from "../shared/Icon.js";
import { SceneArt } from "../shared/SceneArt.js";
import { ThreatToken } from "../shared/ThreatToken.js";

export interface SceneCardProps {
  readonly scene: EatTheReichView["scene"];
  readonly objectives: EatTheReichView["objectives"];
  readonly threats: EatTheReichView["threats"];
}

/** docs/ETR_SESSION_FLOW.md section 6: scene title/art, primary Objective, revealed Threats — derived from the real projection (C06). */
export function SceneCard({ scene, objectives, threats }: SceneCardProps): JSX.Element {
  if (!scene) {
    return (
      <section className="scene-card" aria-labelledby="scene-heading">
        <h2 id="scene-heading">No scene yet</h2>
        <p>The GM is preparing the first scene.</p>
      </section>
    );
  }

  // Non-GM projections only ever contain revealed threats already
  // (templates/eat-the-reich/src/engine.ts's `project`); this guard only
  // matters when a GM-capability caller reuses this component.
  const visibleThreats = threats.filter((t) => !("revealed" in t) || t.revealed);
  const activeObjectives = objectives.filter((o) => o.status === "active");

  return (
    <section className="scene-card" aria-labelledby="scene-heading">
      <SceneArt sceneId={scene.id} location={scene.locationLabel} />
      <h2 id="scene-heading">{scene.locationLabel}</h2>
      <p className="form-hint">
        Round {scene.round}
        {scene.reinforcementsMode === "simplified" ? " · simplified reinforcements" : ""}
      </p>
      <div className="scene-card-objective">
        <h3>
          <Icon name="objective" /> Objective
        </h3>
        {activeObjectives.length === 0 ? (
          <p>Objective complete&hellip; awaiting the next scene.</p>
        ) : (
          <ul>
            {activeObjectives.map((objective) => (
              <li key={objective.id}>
                {objective.title} &mdash; rating {objective.rating}
                {objective.challenge ? (
                  <>
                    , <Icon name="challenge" label="challenge" /> {objective.challenge}
                  </>
                ) : (
                  ""
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="scene-card-threats">
        <h3>
          <Icon name="threat" /> Threats
        </h3>
        {visibleThreats.length === 0 ? (
          <p>No opposition&hellip; yet.</p>
        ) : (
          <ul>
            {visibleThreats.map((threat) => (
              <li key={threat.id} className={threat.status !== "active" ? "threat-beaten" : ""}>
                <ThreatToken threatId={threat.id} beaten={threat.status !== "active"} />
                {threat.name} &mdash; rating {threat.rating}, <Icon name="attack" label="attack" />{" "}
                {threat.attack}
                {threat.challenge ? (
                  <>
                    , <Icon name="challenge" label="challenge" /> {threat.challenge}
                  </>
                ) : (
                  ""
                )}
                {threat.status !== "active" ? ` (${threat.status})` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
