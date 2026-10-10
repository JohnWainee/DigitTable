import type { SceneDefinition } from "@digitable/template-eat-the-reich";
import { PUBLIC_SCENE_CATALOG } from "@digitable/template-eat-the-reich/public-scenes";

/** Generic, non-canonical content for the unauthenticated local fixture only. */
export function fixtureEncounterCatalog(): readonly SceneDefinition[] {
  return PUBLIC_SCENE_CATALOG.map((scene) => ({
    sceneId: scene.sceneId,
    title: scene.title,
    locationLabel: scene.locationLabel,
    objectives: [
      {
        id: `${scene.sceneId}-fixture-objective`,
        title: "Reach the scene objective",
        kind: "primary",
        rating: 8,
        challenge: 0,
      },
    ],
    threats: [
      {
        id: `${scene.sceneId}-fixture-opposition`,
        name: "Training opposition",
        rating: 4,
        attack: 2,
        challenge: 0,
        solo: false,
        elite: false,
        flags: {},
        revealed: true,
        notes: "",
      },
    ],
    reinforcementsMode: "book",
    gmBriefing: "Local fixture preview only; connect to a trusted room for original GM notes.",
  }));
}
