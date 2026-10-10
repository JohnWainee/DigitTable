/**
 * Browser-safe catalog labels and art keys only. Full original scene content
 * lives in `scenes.ts` and is resolved by trusted Functions for GM seats.
 */
export interface PublicSceneCatalogEntry {
  readonly sceneId: string;
  readonly title: string;
  readonly locationLabel: string;
  readonly artKey: string;
}

export const PUBLIC_SCENE_CATALOG: readonly PublicSceneCatalogEntry[] = [
  {
    sceneId: "drop-forecourt",
    title: "The Forecourt of the Gare des Ombres",
    locationLabel: "The forecourt of the Gare des Ombres, dusk — the coffins have just hit",
    artKey: "drop-forecourt",
  },
  {
    sceneId: "metro-platform",
    title: "The Abandoned Métro Platform",
    locationLabel: "An abandoned Métro platform, water dripping toward a sealed far end",
    artKey: "metro-platform",
  },
  {
    sceneId: "printworks",
    title: "The Occupier's Printworks",
    locationLabel: "The occupier's propaganda printworks, presses still running",
    artKey: "printworks",
  },
  {
    sceneId: "signal-mast",
    title: "The Signal Mast",
    locationLabel: "The Signal Mast on the river bluff — the mission's conclusion",
    artKey: "signal-mast",
  },
];
