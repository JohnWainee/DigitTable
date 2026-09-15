/**
 * TEMPORARY until B02 fixtures land (see GitHub issue #14, tasks B02/C01).
 *
 * Sonnet B has not yet published typed roster/scene fixtures on
 * `@digitable/template-eat-the-reich` (the current in-memory template only
 * models a single fixed player). This module reproduces just enough of
 * `docs/ETR_RULES_MATRIX.md` Appendix A (roster) and Appendix C (scenes) —
 * ids, names, one-line concepts and stat lines only, no rulebook prose — so
 * Sonnet C's create/join/claim screens (C01) have real, spec-shaped data to
 * render and test against instead of inventing placeholder names.
 *
 * Delete this file (and its one import site,
 * `apps/web/src/session/FixtureSessionGateway.ts`) once B02 publishes typed
 * fixtures on the template package, and switch C's screens to those instead.
 */

export interface RosterCharacterFixture {
  readonly id: string;
  readonly name: string;
  readonly concept: string;
  /** BRAWL/CON/FIX/SEARCH/SHOOT/SNEAK/TERRIFY, per Appendix A. */
  readonly stats: readonly [number, number, number, number, number, number, number];
}

export const ETR_STAT_LABELS = [
  "Brawl",
  "Con",
  "Fix",
  "Search",
  "Shoot",
  "Sneak",
  "Terrify",
] as const;

/** Appendix A roster fixture (docs/ETR_RULES_MATRIX.md). Original characters. */
export const ETR_ROSTER_FIXTURE: readonly RosterCharacterFixture[] = [
  {
    id: "rook",
    name: "Rook",
    concept: "Sharp-eyed courier; drop-coffin scout",
    stats: [2, 2, 2, 3, 3, 4, 1],
  },
  {
    id: "vesper",
    name: "Vesper Caul",
    concept: "Opera-house phantom; mesmerist",
    stats: [2, 4, 1, 2, 2, 3, 3],
  },
  {
    id: "halloran",
    name: "Halloran",
    concept: "Defrocked sapper-priest; blasting charges and hymns",
    stats: [3, 2, 4, 2, 3, 1, 2],
  },
  {
    id: "orsolya",
    name: "Orsolya Vând",
    concept: "Hussar revenant; sabre and horse-sense",
    stats: [4, 1, 2, 2, 3, 2, 3],
  },
  {
    id: "delphine",
    name: "Delphine Marchetti",
    concept: "Catacomb archivist; reads bones and ledgers",
    stats: [2, 3, 3, 4, 1, 2, 2],
  },
  {
    id: "tallow",
    name: 'Grigor "Tallow" Belyakov',
    concept: "Trench-gunner ghoul; never stops firing",
    stats: [3, 1, 2, 2, 4, 2, 3],
  },
] as const;

export interface SceneFixture {
  readonly id: string;
  readonly index: number;
  readonly location: string;
  readonly objectiveTitle: string;
}

/** Appendix C original scene list (docs/ETR_RULES_MATRIX.md). */
export const ETR_SCENE_FIXTURE: readonly SceneFixture[] = [
  {
    id: "drop-forecourt",
    index: 0,
    location: "Forecourt of the Gare des Ombres",
    objectiveTitle: "Get clear of the wreckage and into the streets",
  },
  {
    id: "metro-platform",
    index: 1,
    location: "Abandoned Métro platform",
    objectiveTitle: "Cut through the tunnels to the far exit",
  },
  {
    id: "printworks",
    index: 2,
    location: "The occupier's propaganda printworks",
    objectiveTitle: "Wreck the presses and get out through the loading yard",
  },
  {
    id: "signal-mast",
    index: 3,
    location: "The Signal Mast on the river bluff",
    objectiveTitle: "Silence the Voice",
  },
] as const;
