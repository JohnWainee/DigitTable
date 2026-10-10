import type { SceneDefinition } from "@digitable/template-eat-the-reich";
import { PUBLIC_SCENE_CATALOG } from "@digitable/template-eat-the-reich/public-scenes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function integer(value: unknown, max = 100): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0 && value <= max;
}

function parseSceneDefinition(value: unknown): SceneDefinition | null {
  if (!isRecord(value)) return null;
  const metadata = PUBLIC_SCENE_CATALOG.find((entry) => entry.sceneId === value.sceneId);
  if (
    !metadata ||
    value.title !== metadata.title ||
    value.locationLabel !== metadata.locationLabel ||
    !boundedString(value.gmBriefing, 4096) ||
    (value.reinforcementsMode !== "book" && value.reinforcementsMode !== "simplified") ||
    !Array.isArray(value.objectives) ||
    value.objectives.length > 32 ||
    !Array.isArray(value.threats) ||
    value.threats.length > 32
  ) {
    return null;
  }
  const objectives = value.objectives;
  if (
    !objectives.every(
      (objective) =>
        isRecord(objective) &&
        boundedString(objective.id, 128) &&
        boundedString(objective.title, 256) &&
        (objective.kind === "primary" ||
          objective.kind === "secondary" ||
          objective.kind === "retreat") &&
        integer(objective.rating) &&
        integer(objective.challenge),
    )
  ) {
    return null;
  }
  const threats = value.threats;
  if (
    !threats.every(
      (threat) =>
        isRecord(threat) &&
        boundedString(threat.id, 128) &&
        boundedString(threat.name, 256) &&
        integer(threat.rating) &&
        integer(threat.attack) &&
        integer(threat.challenge) &&
        typeof threat.solo === "boolean" &&
        typeof threat.elite === "boolean" &&
        typeof threat.revealed === "boolean" &&
        boundedString(threat.notes, 2048) &&
        isRecord(threat.flags) &&
        Object.values(threat.flags).every((flag) => typeof flag === "boolean"),
    )
  ) {
    return null;
  }
  return value as unknown as SceneDefinition;
}

/** Validate the GM-only callable response without importing any private catalog data. */
export function parseEncounterCatalog(value: unknown): readonly SceneDefinition[] {
  if (!Array.isArray(value) || value.length !== PUBLIC_SCENE_CATALOG.length) {
    throw new Error("The trusted encounter catalog response was invalid.");
  }
  const parsed = value.map(parseSceneDefinition);
  if (
    parsed.some((scene) => scene === null) ||
    new Set(parsed.map((scene) => scene?.sceneId)).size !== PUBLIC_SCENE_CATALOG.length
  ) {
    throw new Error("The trusted encounter catalog response was invalid.");
  }
  return parsed as SceneDefinition[];
}
