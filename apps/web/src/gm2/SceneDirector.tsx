import { useState } from "react";
import { OptionPicker } from "../shared/OptionPicker.js";
import type { EatTheReichView, SceneDefinition } from "@digitable/template-eat-the-reich";
import { PUBLIC_SCENE_CATALOG } from "@digitable/template-eat-the-reich/public-scenes";
import { Icon } from "../shared/Icon.js";
import { SceneArt } from "../shared/SceneArt.js";

export interface SceneDirectorProps {
  readonly scene: EatTheReichView["scene"];
  readonly objectives: EatTheReichView["objectives"];
  readonly threats: EatTheReichView["threats"];
  readonly catalog: readonly SceneDefinition[];
  readonly catalogStatus: "loading" | "ready" | "error";
  readonly onLoadScene: (sceneId: string) => void;
  readonly onNextScene: (sceneId: string, reason: string | null) => void;
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

/** The opening scene when none is loaded, otherwise the next scene in mission order. */
function defaultSceneId(currentSceneId: string | null): string {
  if (currentSceneId === null) return PUBLIC_SCENE_CATALOG[0]!.sceneId;
  const index = PUBLIC_SCENE_CATALOG.findIndex((s) => s.sceneId === currentSceneId);
  return (
    PUBLIC_SCENE_CATALOG[index + 1]?.sceneId ??
    PUBLIC_SCENE_CATALOG.find((s) => s.sceneId !== currentSceneId)?.sceneId ??
    PUBLIC_SCENE_CATALOG[0]!.sceneId
  );
}

type EditableTarget =
  | { readonly kind: "objective"; readonly id: string }
  | { readonly kind: "threat"; readonly id: string };

/**
 * docs/ETR_SESSION_FLOW.md section 7/5: scene control against B04's real
 * `LoadScene`/`NextScene`/`RevealThreat` commands, plus c07's round/rules/
 * edit controls. Original scene content is obtained through the trusted,
 * GM-authorized catalog callable; this browser module imports only public
 * labels and art keys.
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
  catalog,
  catalogStatus,
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

  const selectedMetadata =
    PUBLIC_SCENE_CATALOG.find((s) => s.sceneId === selectedSceneId) ?? PUBLIC_SCENE_CATALOG[0]!;
  const selected = catalog.find((s) => s.sceneId === selectedSceneId) ?? null;
  const primaryComplete = objectives.some((o) => o.kind === "primary" && o.status === "complete");
  const hiddenThreats = threats.filter((t) => "revealed" in t && !t.revealed);

  function handleAdvance(): void {
    if (!scene) {
      onLoadScene(selectedSceneId);
      return;
    }
    onNextScene(selectedSceneId, primaryComplete ? null : reason);
    setReason("");
  }

  const canAdvance =
    catalogStatus === "ready" &&
    selected !== null &&
    (scene ? primaryComplete || reason.trim() !== "" : true);

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
        <h3>Encounter library</h3>
        <p className="form-hint">
          Choose one of the four original mission scenes. The current scene is locked while it is
          active; player and table views receive only the approved scene projection.
        </p>
        <ol className="encounter-library" aria-label="Original mission scenes">
          {PUBLIC_SCENE_CATALOG.map((entry, index) => {
            const isCurrent = entry.sceneId === currentSceneId;
            const isSelected = entry.sceneId === selectedSceneId;
            return (
              <li key={entry.sceneId}>
                <button
                  type="button"
                  className="encounter-library-card"
                  data-scene-id={entry.sceneId}
                  aria-label={`Select scene ${index + 1}: ${entry.title}${isCurrent ? ", currently active" : ""}`}
                  aria-pressed={isSelected}
                  disabled={isCurrent}
                  onClick={() => setChoice({ forSceneId: currentSceneId, sceneId: entry.sceneId })}
                >
                  <SceneArt
                    key={`${entry.sceneId}:library`}
                    sceneId={entry.artKey}
                    title={entry.title}
                  />
                  <span className="encounter-library-card-copy">
                    <span className="encounter-library-card-kicker">
                      Scene {String(index + 1).padStart(2, "0")}
                      {isCurrent ? " · Current" : isSelected ? " · Selected" : ""}
                    </span>
                    <strong>{entry.title}</strong>
                    <span>{entry.locationLabel}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="encounter-preview">
          <p>Previewing {selectedMetadata.title}</p>
          <h4>Selected: {selectedMetadata.title}</h4>
          <p>{selectedMetadata.locationLabel}</p>
          {catalogStatus === "loading" && <p role="status">Loading private GM encounter notes…</p>}
          {catalogStatus === "error" && (
            <p role="alert">
              The trusted GM encounter catalog could not be loaded. Try refreshing.
            </p>
          )}
          {selected && (
            <>
              <h4>Objectives</h4>
              <ul>
                {selected.objectives.map((objective) => (
                  <li key={objective.id}>
                    {objective.title} ({objective.kind}; rating {objective.rating})
                  </li>
                ))}
              </ul>
              <h4>Threats</h4>
              <ul>
                {selected.threats.map((threat) => (
                  <li key={threat.id}>
                    {threat.name} — rating {threat.rating}, attack {threat.attack}
                    {threat.revealed ? " · revealed on load" : " · staged to reveal later"}
                  </li>
                ))}
              </ul>
              <p className="form-hint">
                <strong>GM briefing:</strong> {selected.gmBriefing}
              </p>
            </>
          )}
        </div>
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
          <OptionPicker
            id="edit-target"
            label="Target"
            emptyLabel="Choose one…"
            value={editTargetKey}
            onChange={loadEditTargetDefaults}
            options={[
              ...objectives.map((o) => ({
                value: `objective:${o.id}`,
                label: `Objective: ${o.title}`,
              })),
              ...threats.map((t) => ({ value: `threat:${t.id}`, label: `Threat: ${t.name}` })),
            ]}
          />
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
