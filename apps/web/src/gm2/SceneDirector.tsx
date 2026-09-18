import { useState } from "react";
import {
  ORIGINAL_MISSION,
  type EatTheReichView,
  type SceneDefinition,
} from "@digitable/template-eat-the-reich";
import { Icon } from "../shared/Icon.js";
import { SceneArt } from "../shared/SceneArt.js";

export interface SceneDirectorProps {
  readonly scene: EatTheReichView["scene"];
  readonly objectives: EatTheReichView["objectives"];
  readonly threats: EatTheReichView["threats"];
  readonly onLoadScene: (definition: SceneDefinition) => void;
  readonly onNextScene: (definition: SceneDefinition, reason: string | null) => void;
  readonly onRevealThreat: (threatId: string) => void;
  readonly onEndRound: () => void;
  readonly onSetSceneRules: (reinforcements: "book" | "simplified", reason: string) => void;
  readonly onEditRating: (
    target:
      | { readonly kind: "objective"; readonly id: string }
      | { readonly kind: "threat"; readonly id: string },
    fields: { readonly rating?: number; readonly attack?: number; readonly challenge?: number },
    reason: string,
  ) => void;
}

/** The opening scene when none is loaded, otherwise the scene after the current one (wrapping to any other scene), so "Advance scene" never defaults to reloading the current scene. */
function defaultSceneId(currentSceneId: string | null): string {
  if (currentSceneId === null) return ORIGINAL_MISSION[0]!.sceneId;
  const index = ORIGINAL_MISSION.findIndex((s) => s.sceneId === currentSceneId);
  return (
    ORIGINAL_MISSION[index + 1]?.sceneId ??
    ORIGINAL_MISSION.find((s) => s.sceneId !== currentSceneId)?.sceneId ??
    ORIGINAL_MISSION[0]!.sceneId
  );
}

type EditableTarget =
  | { readonly kind: "objective"; readonly id: string }
  | { readonly kind: "threat"; readonly id: string };

/**
 * docs/ETR_SESSION_FLOW.md section 7/5: scene control against B04's real
 * `LoadScene`/`NextScene`/`RevealThreat` commands, plus c07's round/rules/
 * edit controls. The template has no server-side scene catalog
 * (scenes.ts's own doc comment); this is the "natural place" it names for
 * presenting `ORIGINAL_MISSION` and sending one as a command's payload.
 *
 * c07 R3: lists every Objective/Threat with its full GM-only detail
 * (rating/attack/challenge, revealed state, foreshadowing notes) — not
 * just the primary Objective's headline the console showed before.
 * c07 R1: `EndRound` (matrix S6/S7's reinforcement pass); a real
 * `ROUND_HAS_OPEN_ROLLS` rejection surfaces through the console's shared
 * error banner (`GmDirectorScreen`), same as every other command here.
 */
export function SceneDirector({
  scene,
  objectives,
  threats,
  onLoadScene,
  onNextScene,
  onRevealThreat,
  onEndRound,
  onSetSceneRules,
  onEditRating,
}: SceneDirectorProps): JSX.Element {
  // The GM's explicit pick only counts for the scene it was made in; once the loaded scene changes
  // the default (next scene in mission order) applies again. Derived at render: no effect, no remount.
  const currentSceneId = scene?.id ?? null;
  const [choice, setChoice] = useState<{ forSceneId: string | null; sceneId: string } | null>(null);
  const selectedSceneId =
    choice !== null && choice.forSceneId === currentSceneId
      ? choice.sceneId
      : defaultSceneId(currentSceneId);
  const [reason, setReason] = useState("");
  const [rulesReason, setRulesReason] = useState("");
  const [editTargetKey, setEditTargetKey] = useState<string>("");
  const [editRating, setEditRating] = useState("");
  const [editAttack, setEditAttack] = useState("");
  const [editChallenge, setEditChallenge] = useState("");
  const [editReason, setEditReason] = useState("");

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

  const editTargets: readonly EditableTarget[] = [
    ...objectives.map((o): EditableTarget => ({ kind: "objective", id: o.id })),
    ...threats.map((t): EditableTarget => ({ kind: "threat", id: t.id })),
  ];
  const editTarget = editTargets.find((t) => `${t.kind}:${t.id}` === editTargetKey) ?? null;
  const editObjective =
    editTarget?.kind === "objective" ? objectives.find((o) => o.id === editTarget.id) : null;
  const editThreat =
    editTarget?.kind === "threat" ? threats.find((t) => t.id === editTarget.id) : null;

  function loadEditTargetDefaults(key: string): void {
    setEditTargetKey(key);
    const target = editTargets.find((t) => `${t.kind}:${t.id}` === key);
    if (target?.kind === "objective") {
      const o = objectives.find((candidate) => candidate.id === target.id);
      setEditRating(String(o?.rating ?? ""));
      setEditAttack("");
      setEditChallenge(String(o?.challenge ?? ""));
    } else if (target?.kind === "threat") {
      const t = threats.find((candidate) => candidate.id === target.id);
      setEditRating(String(t?.rating ?? ""));
      setEditAttack(String(t?.attack ?? ""));
      setEditChallenge(String(t?.challenge ?? ""));
    }
  }

  function handleEditSubmit(): void {
    if (!editTarget) return;
    const fields: { rating?: number; attack?: number; challenge?: number } = {};
    if (editRating.trim() !== "") fields.rating = Number(editRating);
    if (editTarget.kind === "threat" && editAttack.trim() !== "")
      fields.attack = Number(editAttack);
    if (editChallenge.trim() !== "") fields.challenge = Number(editChallenge);
    onEditRating(editTarget, fields, editReason);
    setEditReason("");
  }

  return (
    <section className="step" aria-labelledby="scene-director-heading">
      <h2 id="scene-director-heading">Scene director</h2>
      {scene && <SceneArt key={scene.id} sceneId={scene.id} title={scene.title} />}
      {scene ? (
        <p>
          <strong>{scene.title}</strong> &mdash; round {scene.round}
          {scene.reinforcementsMode === "simplified" ? " · simplified reinforcements" : ""}
        </p>
      ) : (
        <p>No scene loaded yet.</p>
      )}

      {scene && (
        <div className="scene-director-detail">
          <h3>Objectives</h3>
          <ul>
            {objectives.map((objective) => (
              <li key={objective.id}>
                {objective.title} ({objective.kind}) &mdash; rating {objective.rating}, challenge{" "}
                {objective.challenge} &mdash; {objective.status}
              </li>
            ))}
          </ul>
          <h3>Threats</h3>
          <ul>
            {threats.map((threat) => (
              <li key={threat.id}>
                {threat.name}
                {threat.solo ? " · solo" : ""}
                {threat.elite ? " · elite" : ""} &mdash; rating {threat.rating},{" "}
                <Icon name="attack" label="attack" /> {threat.attack}, challenge {threat.challenge}{" "}
                &mdash; {threat.status}
                {"revealed" in threat ? (threat.revealed ? " · revealed" : " · hidden") : ""}
                {"notes" in threat && threat.notes ? (
                  <span className="form-hint"> — GM notes: {threat.notes}</span>
                ) : (
                  ""
                )}
              </li>
            ))}
          </ul>
        </div>
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

      {scene && (
        <div className="landing-actions">
          <button type="button" className="secondary-action" onClick={onEndRound}>
            End round {scene.round}
          </button>
        </div>
      )}

      <fieldset>
        <legend>{scene ? "Advance to a new scene" : "Load the opening scene"}</legend>
        <label htmlFor="scene-select">Scene</label>
        <select
          id="scene-select"
          value={selectedSceneId}
          onChange={(e) => setChoice({ forSceneId: currentSceneId, sceneId: e.target.value })}
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

      {scene && (
        <fieldset>
          <legend>Reinforcements mode</legend>
          <div className="form-field">
            <label htmlFor="rules-reason">Reason (required)</label>
            <input
              id="rules-reason"
              type="text"
              value={rulesReason}
              onChange={(e) => setRulesReason(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="secondary-action"
            disabled={rulesReason.trim() === ""}
            onClick={() => {
              onSetSceneRules(
                scene.reinforcementsMode === "book" ? "simplified" : "book",
                rulesReason,
              );
              setRulesReason("");
            }}
          >
            Switch to {scene.reinforcementsMode === "book" ? "simplified" : "book"}
          </button>
        </fieldset>
      )}

      {scene && editTargets.length > 0 && (
        <fieldset>
          <legend>Edit an Objective or Threat</legend>
          <label htmlFor="edit-target">Target</label>
          <select
            id="edit-target"
            value={editTargetKey}
            onChange={(e) => loadEditTargetDefaults(e.target.value)}
          >
            <option value="">Choose one&hellip;</option>
            {objectives.map((o) => (
              <option key={`objective:${o.id}`} value={`objective:${o.id}`}>
                Objective: {o.title}
              </option>
            ))}
            {threats.map((t) => (
              <option key={`threat:${t.id}`} value={`threat:${t.id}`}>
                Threat: {t.name}
              </option>
            ))}
          </select>
          {editTarget && (editObjective ?? editThreat) && (
            <>
              <div className="form-field">
                <label htmlFor="edit-rating">Rating</label>
                <input
                  id="edit-rating"
                  type="number"
                  value={editRating}
                  onChange={(e) => setEditRating(e.target.value)}
                />
              </div>
              {editTarget.kind === "threat" && (
                <div className="form-field">
                  <label htmlFor="edit-attack">Attack</label>
                  <input
                    id="edit-attack"
                    type="number"
                    value={editAttack}
                    onChange={(e) => setEditAttack(e.target.value)}
                  />
                </div>
              )}
              <div className="form-field">
                <label htmlFor="edit-challenge">Challenge</label>
                <input
                  id="edit-challenge"
                  type="number"
                  value={editChallenge}
                  onChange={(e) => setEditChallenge(e.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="edit-reason">Reason (required)</label>
                <input
                  id="edit-reason"
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="secondary-action"
                disabled={editReason.trim() === ""}
                onClick={handleEditSubmit}
              >
                Apply edit
              </button>
            </>
          )}
        </fieldset>
      )}
    </section>
  );
}
