/**
 * TEMPORARY until B03 lands (see GitHub issue #14, tasks B02/B03/C01/C02/
 * C03).
 *
 * Sonnet B published typed characters on `origin/sonnet-b/b02-characters`
 * (PR #21, `templates/eat-the-reich/src/roster.ts`), but that branch
 * deletes the old placeholder resolution-loop commands
 * (`BeginAction`/`SubmitOpposition`/old `AllocateResults`) that the
 * pre-existing Phase 1C demo route (`apps/web/src/{player,gm,table}`,
 * `InMemoryRoomRepository`) depends on, and does not yet add their
 * replacements — those land in B03
 * (`origin/sonnet-b/b03-resolution-loop`), still in progress as of this
 * file's last edit. Merging B02 into this branch now would break that
 * pre-existing, previously-reviewed route with no replacement until B03
 * lands, so Sonnet C is deferring the type-level integration (importing
 * `@digitable/template-eat-the-reich` directly, retiring this file and
 * `FixtureSessionGateway.ts`/`fixturePlayLoop.ts`) until B03 is available,
 * to do that integration once instead of twice.
 *
 * In the meantime, this file's roster item/ability *names* and bonus
 * counts below are copied from B02's real `roster.ts` (ids prefixed to
 * match) for fidelity — only the scene/threat data and the ability cost
 * model (`special`/`blood1`/`free`, simpler than B02's real
 * `trigger`/`effect` shape) remain Sonnet C's own placeholders, pending B03.
 */

export interface RosterItemFixture {
  readonly id: string;
  readonly name: string;
  readonly maxUses: number;
  readonly bonusCount: number;
  readonly bonusText: string;
}

export interface RosterAbilityFixture {
  readonly id: string;
  readonly name: string;
  /** `special` abilities are read-only in compose; activated with a critical during allocation. */
  readonly cost: "special" | "blood1" | "free";
  readonly bonusCount?: number;
  readonly bonusText?: string;
}

export interface RosterCharacterFixture {
  readonly id: string;
  readonly name: string;
  readonly concept: string;
  /** BRAWL/CON/FIX/SEARCH/SHOOT/SNEAK/TERRIFY, per Appendix A. */
  readonly stats: readonly [number, number, number, number, number, number, number];
  readonly items: readonly RosterItemFixture[];
  readonly abilities: readonly RosterAbilityFixture[];
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
    items: [
      {
        id: "rook-forged-papers",
        name: "Courier satchel of forged papers",
        maxUses: 3,
        bonusCount: 1,
        bonusText: "at a checkpoint",
      },
      {
        id: "rook-silenced-pistol",
        name: "Silenced pistol",
        maxUses: 3,
        bonusCount: 1,
        bonusText: "close quarters",
      },
      {
        id: "rook-rooftop-line",
        name: "Rooftop line and hook",
        maxUses: 3,
        bonusCount: 2,
        bonusText: "three storeys or more",
      },
      {
        id: "rook-pocket-mirror",
        name: "Pocket mirror",
        maxUses: 1,
        bonusCount: 1,
        bonusText: "you catch the light just right",
      },
    ],
    abilities: [
      { id: "rook-special-blackout-drop", name: "Blackout Drop", cost: "special" },
      { id: "rook-blood-second-wind", name: "Second Wind", cost: "blood1" },
      { id: "rook-other-practiced-hands", name: "Practiced Hands", cost: "free" },
    ],
  },
  {
    id: "vesper",
    name: "Vesper Caul",
    concept: "Opera-house phantom; mesmerist",
    stats: [2, 4, 1, 2, 2, 3, 3],
    items: [
      {
        id: "vesper-sabre-cane",
        name: "Sabre-cane",
        maxUses: 3,
        bonusCount: 1,
        bonusText: "in a duel",
      },
      {
        id: "vesper-phosphor-flash",
        name: "Phosphor stage flash",
        maxUses: 3,
        bonusCount: 2,
        bonusText: "against a crowd",
      },
      {
        id: "vesper-officers-greatcoat",
        name: "Stolen officer's greatcoat",
        maxUses: 3,
        bonusCount: 1,
        bonusText: "they think you belong",
      },
    ],
    abilities: [
      { id: "vesper-special-final-curtain", name: "Final Curtain", cost: "special" },
      { id: "vesper-blood-hungerglow", name: "Hungerglow", cost: "blood1" },
      { id: "vesper-other-stage-presence", name: "Stage Presence", cost: "free" },
    ],
  },
  {
    id: "halloran",
    name: "Halloran",
    concept: "Defrocked sapper-priest; blasting charges and hymns",
    stats: [3, 2, 4, 2, 3, 1, 2],
    items: [
      {
        id: "halloran-shaped-charges",
        name: "Shaped charges",
        maxUses: 3,
        bonusCount: 3,
        bonusText: "against a wall or door",
      },
      {
        id: "halloran-trench-shotgun",
        name: "Trench shotgun",
        maxUses: 3,
        bonusCount: 1,
        bonusText: "point blank",
      },
      {
        id: "halloran-blessing-lantern",
        name: "Blessing-oil lantern",
        maxUses: 3,
        bonusCount: 2,
        bonusText: "in darkness",
      },
    ],
    abilities: [
      { id: "halloran-special-last-rites", name: "Last Rites", cost: "special" },
      { id: "halloran-blood-penance", name: "Penance", cost: "blood1" },
      { id: "halloran-other-demolitions-drill", name: "Demolitions Drill", cost: "free" },
    ],
  },
  {
    id: "orsolya",
    name: "Orsolya Vând",
    concept: "Hussar revenant; sabre and horse-sense",
    stats: [4, 1, 2, 2, 3, 2, 3],
    items: [
      {
        id: "orsolya-cavalry-sabre",
        name: "Cavalry sabre",
        maxUses: 3,
        bonusCount: 1,
        bonusText: "on a charge",
      },
      {
        id: "orsolya-carbine",
        name: "Carbine",
        maxUses: 3,
        bonusCount: 1,
        bonusText: "from the saddle or a moving vehicle",
      },
      {
        id: "orsolya-draft-horse",
        name: "Requisitioned draft horse",
        maxUses: 3,
        bonusCount: 2,
        bonusText: "open streets",
      },
    ],
    abilities: [
      { id: "orsolya-special-broken-lance", name: "Broken Lance Charge", cost: "special" },
      { id: "orsolya-blood-old-cavalry-oath", name: "Old Cavalry Oath", cost: "blood1" },
      { id: "orsolya-other-horse-sense", name: "Horse Sense", cost: "free" },
    ],
  },
  {
    id: "delphine",
    name: "Delphine Marchetti",
    concept: "Catacomb archivist; reads bones and ledgers",
    stats: [2, 3, 3, 4, 1, 2, 2],
    items: [
      {
        id: "delphine-bone-knife",
        name: "Bone-handled knife",
        maxUses: 3,
        bonusCount: 1,
        bonusText: "from behind",
      },
      {
        id: "delphine-ledger-of-names",
        name: "Ledger of names",
        maxUses: 1,
        bonusCount: 3,
        bonusText: "any claim, once",
      },
      {
        id: "delphine-lockpicks",
        name: "Lockpicks",
        maxUses: 3,
        bonusCount: 1,
        bonusText: "a locked way through",
      },
    ],
    abilities: [
      { id: "delphine-special-marked-page", name: "Marked Page", cost: "special" },
      { id: "delphine-blood-old-debts", name: "Old Debts", cost: "blood1" },
      { id: "delphine-other-catacomb-memory", name: "Catacomb Memory", cost: "free" },
    ],
  },
  {
    id: "tallow",
    name: 'Grigor "Tallow" Belyakov',
    concept: "Trench-gunner ghoul; never stops firing",
    stats: [3, 1, 2, 2, 4, 2, 3],
    items: [
      {
        id: "tallow-belt-fed-gun",
        name: "Belt-fed gun",
        maxUses: 3,
        bonusCount: 1,
        bonusText: "enemies in cover",
      },
      {
        id: "tallow-grenade-bag",
        name: "Grenade bag",
        maxUses: 3,
        bonusCount: 2,
        bonusText: "enclosed spaces",
      },
      { id: "tallow-spade", name: "Spade", maxUses: 3, bonusCount: 1, bonusText: "dug in" },
    ],
    abilities: [
      { id: "tallow-special-suppressing-fire", name: "Suppressing Fire", cost: "special" },
      { id: "tallow-blood-trench-hunger", name: "Trench Hunger", cost: "blood1" },
      { id: "tallow-other-never-stops-firing", name: "Never Stops Firing", cost: "free" },
    ],
  },
] as const;

export interface SceneThreatFixture {
  readonly id: string;
  readonly name: string;
  readonly rating: number;
  readonly attack: number;
  readonly challenge: number;
  readonly solo?: boolean;
  readonly elite?: boolean;
  readonly revealed: boolean;
}

export interface SceneFixture {
  readonly id: string;
  readonly index: number;
  readonly location: string;
  readonly objectiveTitle: string;
  readonly objectiveRating: number;
  readonly objectiveChallenge: number;
  readonly threats: readonly SceneThreatFixture[];
}

/** Appendix C original scene list (docs/ETR_RULES_MATRIX.md). */
export const ETR_SCENE_FIXTURE: readonly SceneFixture[] = [
  {
    id: "drop-forecourt",
    index: 0,
    location: "Forecourt of the Gare des Ombres",
    objectiveTitle: "Get clear of the wreckage and into the streets",
    objectiveRating: 8,
    objectiveChallenge: 0,
    threats: [
      {
        id: "patrol-a",
        name: "Station Patrol",
        rating: 4,
        attack: 2,
        challenge: 0,
        revealed: true,
      },
      {
        id: "patrol-b",
        name: "Station Patrol",
        rating: 4,
        attack: 2,
        challenge: 0,
        revealed: true,
      },
    ],
  },
  {
    id: "metro-platform",
    index: 1,
    location: "Abandoned Métro platform",
    objectiveTitle: "Cut through the tunnels to the far exit",
    objectiveRating: 8,
    objectiveChallenge: 0,
    threats: [
      {
        id: "plated-squad",
        name: "Plated Squad",
        rating: 6,
        attack: 3,
        challenge: 1,
        revealed: true,
      },
      {
        id: "the-enforcer",
        name: "The Enforcer",
        rating: 8,
        attack: 4,
        challenge: 1,
        solo: true,
        elite: true,
        revealed: false,
      },
    ],
  },
  {
    id: "printworks",
    index: 2,
    location: "The occupier's propaganda printworks",
    objectiveTitle: "Wreck the presses and get out through the loading yard",
    objectiveRating: 8,
    objectiveChallenge: 1,
    threats: [
      {
        id: "rifle-squad",
        name: "Rifle Squad",
        rating: 6,
        attack: 3,
        challenge: 0,
        revealed: true,
      },
      {
        id: "marksman-nest",
        name: "Marksman Nest",
        rating: 3,
        attack: 6,
        challenge: 2,
        solo: true,
        revealed: true,
      },
    ],
  },
  {
    id: "signal-mast",
    index: 3,
    location: "The Signal Mast on the river bluff",
    objectiveTitle: "Silence the Voice",
    objectiveRating: 10,
    objectiveChallenge: 1,
    threats: [
      {
        id: "armoured-truck",
        name: "Armoured Truck",
        rating: 4,
        attack: 2,
        challenge: 1,
        solo: true,
        revealed: true,
      },
      {
        id: "the-warden",
        name: "The Warden",
        rating: 10,
        attack: 5,
        challenge: 1,
        solo: true,
        elite: true,
        revealed: false,
      },
    ],
  },
] as const;
