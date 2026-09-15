import type {
  AbilityState,
  CharacterState,
  InjuryCategoryState,
  InjuryPenaltyTag,
  ItemState,
  Stat,
} from "./state.js";

/**
 * The original six-character roster (docs/ETR_RULES_MATRIX.md Appendix A,
 * B02). Every name, concept, item, ability, and injury label here is a
 * DigiTable original; only the *shape* (stat spread, item/ability counts,
 * injury structure) follows the rulebook's custom-character rule (matrix
 * C3, pp. 74-75). See AGENTS.md "Non-negotiable boundaries" and
 * `docs/EAT_THE_REICH_BUILD_GUIDE.md` "Licensing and content policy".
 *
 * Item use counts default to 3 (the book's loot rule, p. 39) per
 * `docs/ETR_RULES_IMPLEMENTATION_PLAN.md` §6 item 1, pending John's
 * confirmation from his own sheets.
 */

function item(
  id: string,
  name: string,
  bonusRequirement: string,
  bonusPlus: number,
  maxUses = 3,
): ItemState {
  return { id, name, bonusRequirement, bonusPlus, maxUses, usesRemaining: maxUses };
}

function specialAbility(id: string, name: string, effect: AbilityState["effect"]): AbilityState {
  return { id, name, trigger: "special", effect };
}

function bloodAbility(id: string, name: string, bloodCost = 1): AbilityState {
  return { id, name, trigger: "blood", bloodCost, effect: { kind: "none" } };
}

function otherAbility(id: string, name: string): AbilityState {
  return { id, name, trigger: "other", effect: { kind: "none" } };
}

function injuryCategory(id: string, label: string, penalty: InjuryPenaltyTag): InjuryCategoryState {
  return {
    id,
    label,
    boxes: [{ marked: false }, { marked: false, penalty }],
  };
}

function statSpread(values: Readonly<Record<Stat, number>>): Readonly<Record<Stat, number>> {
  return values;
}

const ROOK: CharacterState = {
  id: "rook",
  name: "Rook",
  concept: "Sharp-eyed courier; drop-coffin scout",
  portraitId: "rook-portrait",
  claimedByMemberId: null,
  stats: statSpread({ BRAWL: 2, CON: 2, FIX: 2, SEARCH: 3, SHOOT: 3, SNEAK: 4, TERRIFY: 1 }),
  blood: 0,
  items: [
    item("rook-forged-papers", "Courier satchel of forged papers", "at a checkpoint", 1),
    item("rook-silenced-pistol", "Silenced pistol", "close quarters", 1),
    item("rook-rooftop-line", "Rooftop line and hook", "three storeys or more", 2),
    item("rook-pocket-mirror", "Pocket mirror", "you catch the light just right", 1, 1),
  ],
  abilities: [
    specialAbility("rook-special-blackout-drop", "Blackout Drop", {
      kind: "reduceThreatAttack",
      amount: 2,
    }),
    bloodAbility("rook-blood-second-wind", "Second Wind"),
    otherAbility("rook-other-practiced-hands", "Practiced Hands"),
  ],
  advances: [
    { id: "rook-advance-1", label: "Faster Feet", unlocked: false },
    { id: "rook-advance-2", label: "Forger's Eye", unlocked: false },
    { id: "rook-advance-3", label: "Steady Nerve", unlocked: false },
  ],
  injuries: [
    injuryCategory("rook-papers-burned", "Papers Burned", { kind: "noBonusDice" }),
    injuryCategory("rook-hands-broken", "Hands Broken", { kind: "noSpecials" }),
    injuryCategory("rook-line-cut", "Line Cut", { kind: "oneItemPerTurn" }),
  ],
  lastStand: { label: "One Last Delivery", diceCount: 8 },
  downed: false,
  retired: false,
  activeLootId: null,
};

const VESPER: CharacterState = {
  id: "vesper",
  name: "Vesper Caul",
  concept: "Opera-house phantom; mesmerist",
  portraitId: "vesper-portrait",
  claimedByMemberId: null,
  stats: statSpread({ BRAWL: 2, CON: 4, FIX: 1, SEARCH: 2, SHOOT: 2, SNEAK: 3, TERRIFY: 3 }),
  blood: 0,
  items: [
    item("vesper-sabre-cane", "Sabre-cane", "in a duel", 1),
    item("vesper-phosphor-flash", "Phosphor stage flash", "against a crowd", 2),
    item("vesper-officers-greatcoat", "Stolen officer's greatcoat", "they think you belong", 1),
  ],
  abilities: [
    specialAbility("vesper-special-final-curtain", "Final Curtain", {
      kind: "clearInjury",
      count: 1,
    }),
    bloodAbility("vesper-blood-hungerglow", "Hungerglow"),
    otherAbility("vesper-other-stage-presence", "Stage Presence"),
  ],
  advances: [
    { id: "vesper-advance-1", label: "Velvet Voice", unlocked: false },
    { id: "vesper-advance-2", label: "Footlight Grace", unlocked: false },
    { id: "vesper-advance-3", label: "Understudy's Patience", unlocked: false },
  ],
  injuries: [
    injuryCategory("vesper-voice-cracked", "Voice Cracked", {
      kind: "statDelta",
      deltas: { CON: -1 },
    }),
    injuryCategory("vesper-cape-torn", "Cape Torn", { kind: "allStatsDelta", amount: -1 }),
    injuryCategory("vesper-mask-shattered", "Mask Shattered", { kind: "noBloodSpend" }),
  ],
  lastStand: { label: "The Final Aria", diceCount: 8 },
  downed: false,
  retired: false,
  activeLootId: null,
};

const HALLORAN: CharacterState = {
  id: "halloran",
  name: "Halloran",
  concept: "Defrocked sapper-priest; blasting charges and hymns",
  portraitId: "halloran-portrait",
  claimedByMemberId: null,
  stats: statSpread({ BRAWL: 3, CON: 2, FIX: 4, SEARCH: 2, SHOOT: 3, SNEAK: 1, TERRIFY: 2 }),
  blood: 0,
  items: [
    item("halloran-shaped-charges", "Shaped charges", "against a wall or door", 3),
    item("halloran-trench-shotgun", "Trench shotgun", "point blank", 1),
    item("halloran-blessing-lantern", "Blessing-oil lantern", "in darkness", 2),
  ],
  abilities: [
    specialAbility("halloran-special-last-rites", "Last Rites", {
      kind: "reduceRating",
      amount: 3,
    }),
    bloodAbility("halloran-blood-penance", "Penance"),
    otherAbility("halloran-other-demolitions-drill", "Demolitions Drill"),
  ],
  advances: [
    { id: "halloran-advance-1", label: "Steady Hands", unlocked: false },
    { id: "halloran-advance-2", label: "Old Litanies", unlocked: false },
    { id: "halloran-advance-3", label: "Blast Discipline", unlocked: false },
  ],
  injuries: [
    injuryCategory("halloran-collar-scorched", "Collar Scorched", { kind: "noBloodGain" }),
    injuryCategory("halloran-ribs-cracked", "Ribs Cracked", { kind: "bloodUpkeep", amount: 1 }),
    injuryCategory("halloran-fuse-hand-burned", "Fuse Hand Burned", { kind: "noBonusDice" }),
  ],
  lastStand: { label: "Final Absolution", diceCount: 8 },
  downed: false,
  retired: false,
  activeLootId: null,
};

const ORSOLYA: CharacterState = {
  id: "orsolya",
  name: "Orsolya Vând",
  concept: "Hussar revenant; sabre and horse-sense",
  portraitId: "orsolya-portrait",
  claimedByMemberId: null,
  stats: statSpread({ BRAWL: 4, CON: 1, FIX: 2, SEARCH: 2, SHOOT: 3, SNEAK: 2, TERRIFY: 3 }),
  blood: 0,
  items: [
    item("orsolya-cavalry-sabre", "Cavalry sabre", "on a charge", 1),
    item("orsolya-carbine", "Carbine", "from the saddle or a moving vehicle", 1),
    item("orsolya-draft-horse", "Requisitioned draft horse", "open streets", 2),
  ],
  abilities: [
    specialAbility("orsolya-special-broken-lance", "Broken Lance Charge", {
      kind: "damageElite",
      amount: 3,
    }),
    bloodAbility("orsolya-blood-old-cavalry-oath", "Old Cavalry Oath"),
    otherAbility("orsolya-other-horse-sense", "Horse Sense"),
  ],
  advances: [
    { id: "orsolya-advance-1", label: "Saddle-Born", unlocked: false },
    { id: "orsolya-advance-2", label: "Regimental Memory", unlocked: false },
    { id: "orsolya-advance-3", label: "Unbroken", unlocked: false },
  ],
  injuries: [
    injuryCategory("orsolya-sabre-arm-numb", "Sabre Arm Numb", { kind: "noSpecials" }),
    injuryCategory("orsolya-saddle-lost", "Saddle Lost", { kind: "oneItemPerTurn" }),
    injuryCategory("orsolya-colours-torn", "Colours Torn", {
      kind: "statDelta",
      deltas: { BRAWL: -1 },
    }),
  ],
  lastStand: { label: "The Last Charge", diceCount: 8 },
  downed: false,
  retired: false,
  activeLootId: null,
};

const DELPHINE: CharacterState = {
  id: "delphine",
  name: "Delphine Marchetti",
  concept: "Catacomb archivist; reads bones and ledgers",
  portraitId: "delphine-portrait",
  claimedByMemberId: null,
  stats: statSpread({ BRAWL: 2, CON: 3, FIX: 3, SEARCH: 4, SHOOT: 1, SNEAK: 2, TERRIFY: 2 }),
  blood: 0,
  items: [
    item("delphine-bone-knife", "Bone-handled knife", "from behind", 1),
    item("delphine-ledger-of-names", "Ledger of names", "any claim, once", 3, 1),
    item("delphine-lockpicks", "Lockpicks", "a locked way through", 1),
  ],
  abilities: [
    specialAbility("delphine-special-marked-page", "Marked Page", {
      kind: "restoreItemUse",
      itemId: "delphine-ledger-of-names",
      amount: 1,
    }),
    bloodAbility("delphine-blood-old-debts", "Old Debts"),
    otherAbility("delphine-other-catacomb-memory", "Catacomb Memory"),
  ],
  advances: [
    { id: "delphine-advance-1", label: "Marginal Notes", unlocked: false },
    { id: "delphine-advance-2", label: "Bone Reading", unlocked: false },
    { id: "delphine-advance-3", label: "Ledger-Keeper's Patience", unlocked: false },
  ],
  injuries: [
    injuryCategory("delphine-ink-stained-eyes", "Ink-Stained Eyes", {
      kind: "allStatsDelta",
      amount: -1,
    }),
    injuryCategory("delphine-fingers-broken", "Fingers Broken", { kind: "noBloodSpend" }),
    injuryCategory("delphine-ledger-lost", "Ledger Lost", { kind: "noBloodGain" }),
  ],
  lastStand: { label: "The Final Entry", diceCount: 8 },
  downed: false,
  retired: false,
  activeLootId: null,
};

const TALLOW: CharacterState = {
  id: "tallow",
  name: 'Grigor "Tallow" Belyakov',
  concept: "Trench-gunner ghoul; never stops firing",
  portraitId: "tallow-portrait",
  claimedByMemberId: null,
  stats: statSpread({ BRAWL: 3, CON: 1, FIX: 2, SEARCH: 2, SHOOT: 4, SNEAK: 2, TERRIFY: 3 }),
  blood: 0,
  items: [
    item("tallow-belt-fed-gun", "Belt-fed gun", "enemies in cover", 1),
    item("tallow-grenade-bag", "Grenade bag", "enclosed spaces", 2),
    item("tallow-spade", "Spade", "dug in", 1),
  ],
  abilities: [
    specialAbility("tallow-special-suppressing-fire", "Suppressing Fire", {
      kind: "removeAttackSuccesses",
      amount: 2,
    }),
    bloodAbility("tallow-blood-trench-hunger", "Trench Hunger"),
    otherAbility("tallow-other-never-stops-firing", "Never Stops Firing"),
  ],
  advances: [
    { id: "tallow-advance-1", label: "Dug In", unlocked: false },
    { id: "tallow-advance-2", label: "Old Habits", unlocked: false },
    { id: "tallow-advance-3", label: "Belt-Fed Confidence", unlocked: false },
  ],
  injuries: [
    injuryCategory("tallow-hands-scarred", "Hands Scarred", { kind: "bloodUpkeep", amount: 1 }),
    injuryCategory("tallow-ears-ringing", "Ears Ringing", { kind: "noBonusDice" }),
    injuryCategory("tallow-coat-shredded", "Coat Shredded", { kind: "noSpecials" }),
  ],
  lastStand: { label: "Last Belt", diceCount: 8 },
  downed: false,
  retired: false,
  activeLootId: null,
};

/**
 * All six roster characters, unclaimed. `initialState` clones this for a
 * fresh campaign; `ORIGINAL_ROSTER` itself is never mutated.
 */
export const ORIGINAL_ROSTER: readonly CharacterState[] = [
  ROOK,
  VESPER,
  HALLORAN,
  ORSOLYA,
  DELPHINE,
  TALLOW,
];
