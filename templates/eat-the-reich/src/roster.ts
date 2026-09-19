import type {
  AbilityState,
  CharacterState,
  InjuryCategoryState,
  InjuryPenaltyTag,
  ItemState,
  Stat,
} from "./state.js";

/**
 * The six sourcebook character sheets supplied and authorized by the project
 * owner. Legacy IDs stay stable so saved rooms and ownership records remain
 * compatible while every player-facing field follows the supplied sheets.
 */

function item(
  id: string,
  name: string,
  bonusRequirement: string,
  bonusPlus: number,
  maxUses = 3,
  options: Pick<ItemState, "poolEligible" | "useEffect"> = {},
): ItemState {
  return { id, name, bonusRequirement, bonusPlus, maxUses, usesRemaining: maxUses, ...options };
}

function specialAbility(id: string, name: string, effect: AbilityState["effect"]): AbilityState {
  return { id, name, trigger: "special", effect };
}

function bloodAbility(
  id: string,
  name: string,
  bloodCost = 1,
  bonusRequirement?: string,
  bonusPlus?: number,
): AbilityState {
  return {
    id,
    name,
    trigger: "blood",
    bloodCost,
    ...(bonusRequirement === undefined || bonusPlus === undefined
      ? {}
      : { bonusRequirement, bonusPlus }),
    effect: { kind: "none" },
  };
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
  name: "Iryna",
  concept: "Old Money undead occultist and bonne vivante",
  portraitId: "rook-portrait",
  claimedByMemberId: null,
  stats: statSpread({ BRAWL: 2, CON: 4, FIX: 2, SEARCH: 2, SHOOT: 3, SNEAK: 1, TERRIFY: 3 }),
  blood: 0,
  items: [
    item("rook-forged-papers", "Exquisite hunting rifle", "elevated position", 1, 5),
    item("rook-silenced-pistol", "Magic cavalry sabre", "charge", 1, 5),
    item("rook-rooftop-line", "Explosive runes", "concealed", 2, 3),
    item("rook-pocket-mirror", "Cigarettes taken from the pockets of hanged men", "", 0, 3, {
      poolEligible: false,
      useEffect: { kind: "gainBlood", amount: 2 },
    }),
  ],
  abilities: [
    specialAbility("rook-special-blackout-drop", "Deadeye Shot", {
      kind: "reduceThreatAttack",
      amount: 1,
    }),
    bloodAbility("rook-blood-second-wind", "Dark Glamour", 1, "beautiful surroundings", 1),
    bloodAbility("rook-other-practiced-hands", "Night's Willing Servants", 1, "old buildings", 1),
  ],
  advances: [
    { id: "rook-advance-1", label: "Hell's Ravenous Fire", unlocked: false },
    { id: "rook-advance-2", label: "Enervation of the Soul", unlocked: false },
    { id: "rook-advance-3", label: "Mantle of the Fell Beast", unlocked: false },
  ],
  injuries: [
    injuryCategory("rook-papers-burned", "Suit Torn / Abdominal Puncture", { kind: "noBonusDice" }),
    injuryCategory("rook-hands-broken", "Hair Ruined / Headshot", {
      kind: "statDelta",
      deltas: { BRAWL: 2, CON: -2 },
    }),
    injuryCategory("rook-line-cut", "Shoulder Injury / Arm Removed", { kind: "oneItemPerTurn" }),
  ],
  lastStand: { label: "Forbidden Sorceries", diceCount: 8 },
  downed: false,
  retired: false,
  activeLootId: null,
};

const VESPER: CharacterState = {
  id: "vesper",
  name: "Nicole",
  concept: "Resistance guerrilla fighter and demolitions expert",
  portraitId: "vesper-portrait",
  claimedByMemberId: null,
  stats: statSpread({ BRAWL: 2, CON: 2, FIX: 1, SEARCH: 2, SHOOT: 4, SNEAK: 3, TERRIFY: 3 }),
  blood: 0,
  items: [
    item("vesper-sabre-cane", "[1] M3 submachine gun", "flanking", 1, 4),
    item("vesper-phosphor-flash", "[2] Cut-down Lee Enfield rifle", "close quarters", 1, 4),
    item("vesper-officers-greatcoat", "[3] Smoke grenades", "cover advance", 1, 3),
    item("nicole-firebombs", "[4] Firebombs", "firetrap", 2, 2),
    item("nicole-panzerfaust", "[5] Panzerfaust", "armoured target", 3, 1),
    item("nicole-dynamite", "[6] Dynamite", "demolitions", 4, 1),
  ],
  abilities: [
    specialAbility("vesper-special-final-curtain", "Scavenger", {
      kind: "text",
      description: "Roll a D6 and restore one use of the matching numbered weapon.",
    }),
    specialAbility("vesper-blood-hungerglow", "Sapper", {
      kind: "text",
      description: "When using explosives, reduce an Objective or Threat's Challenge by 1.",
    }),
    bloodAbility("vesper-other-stage-presence", "Blink", 1, "infiltration", 1),
  ],
  advances: [
    { id: "vesper-advance-1", label: "Rat Swarm", unlocked: false },
    { id: "vesper-advance-2", label: "Feed on Fear", unlocked: false },
    { id: "vesper-advance-3", label: "Pitch Black", unlocked: false },
  ],
  injuries: [
    injuryCategory("vesper-voice-cracked", "Dazed / Headshot", { kind: "noSpecials" }),
    injuryCategory("vesper-cape-torn", "Just a Graze / Bleeding Out", {
      kind: "bloodUpkeep",
      amount: 1,
    }),
    injuryCategory("vesper-mask-shattered", "Hand Injury / Lost an Arm", {
      kind: "oneItemPerTurn",
    }),
  ],
  lastStand: { label: "Rigged to Blow", diceCount: 8 },
  downed: false,
  retired: false,
  activeLootId: null,
};

const HALLORAN: CharacterState = {
  id: "halloran",
  name: "Cosgrave",
  concept: "Hackney necromancer taught by his aunt; charming and crooked",
  portraitId: "halloran-portrait",
  claimedByMemberId: null,
  stats: statSpread({ BRAWL: 2, CON: 3, FIX: 3, SEARCH: 2, SHOOT: 2, SNEAK: 3, TERRIFY: 2 }),
  blood: 0,
  items: [
    item("halloran-shaped-charges", "Enormous knife", "never saw you coming", 1, 4),
    item("halloran-trench-shotgun", "Sawn-off shotgun", "point-blank", 2, 3),
    item("halloran-blessing-lantern", "Bottled ghosts", "pass through walls", 2, 3),
    item("cosgrave-soul-jar", "Mother Millicent's stolen soul jar", "any", 3, 1),
  ],
  abilities: [
    bloodAbility("halloran-special-last-rites", "Danse Macabre", 1, "Hans, are you okay?", 1),
    specialAbility("halloran-blood-penance", "Back-Pocket Hex", {
      kind: "reduceThreatAttack",
      amount: 1,
    }),
    bloodAbility(
      "halloran-other-demolitions-drill",
      "Phantasmagoria",
      1,
      "incorporates background cleverly",
      1,
    ),
  ],
  advances: [
    { id: "halloran-advance-1", label: "Memory Rot", unlocked: false },
    { id: "halloran-advance-2", label: "Death Burst", unlocked: false },
    { id: "halloran-advance-3", label: "Dead Man's Luck", unlocked: false },
  ],
  injuries: [
    injuryCategory("halloran-collar-scorched", "Lost Some Fingers / Arm Ripped Off", {
      kind: "allStatsDelta",
      amount: -1,
    }),
    injuryCategory("halloran-ribs-cracked", "Sucking Chest Wound / Shot in the Face", {
      kind: "statDelta",
      deltas: { TERRIFY: 2, CON: -2 },
    }),
    injuryCategory("halloran-fuse-hand-burned", "Grimoire Damaged / Wards Compromised", {
      kind: "noBloodSpend",
    }),
  ],
  lastStand: { label: "Undead Horde", diceCount: 8 },
  downed: false,
  retired: false,
  activeLootId: null,
};

const ORSOLYA: CharacterState = {
  id: "orsolya",
  name: "Chuck",
  concept: "Decent cowboy cannibal who loves honest work and the open plains",
  portraitId: "orsolya-portrait",
  claimedByMemberId: null,
  stats: statSpread({ BRAWL: 3, CON: 1, FIX: 4, SEARCH: 2, SHOOT: 3, SNEAK: 2, TERRIFY: 2 }),
  blood: 0,
  items: [
    item("orsolya-cavalry-sabre", "Paired revolvers, Betsy and Maria", "duel", 1, 5),
    item("orsolya-carbine", "Tool belt", "Jerry-rigging", 1, 4),
    item("orsolya-draft-horse", "Cowboy hat", "", 0, 1, {
      poolEligible: false,
      useEffect: { kind: "ignoreInjuryOrDownedAndDestroy" },
    }),
  ],
  abilities: [
    bloodAbility("orsolya-special-broken-lance", "Acid Spit", 1, "against metal", 2),
    bloodAbility("orsolya-blood-old-cavalry-oath", "Spider Scurry", 1, "low ceilings", 1),
    {
      id: "orsolya-other-horse-sense",
      name: "Corpse Eater",
      trigger: "passive",
      effect: { kind: "onOnesGainBlood", amount: 1 },
    },
  ],
  advances: [
    { id: "orsolya-advance-1", label: "Elbow Grease", unlocked: false },
    { id: "orsolya-advance-2", label: "Corrosive Fluids", unlocked: false },
    { id: "orsolya-advance-3", label: "Lashing Tongue", unlocked: false },
  ],
  injuries: [
    injuryCategory("orsolya-sabre-arm-numb", "Flesh Wound / Shot Fulla Holes", {
      kind: "bloodUpkeep",
      amount: 1,
    }),
    injuryCategory("orsolya-saddle-lost", "Limping / Crawling", {
      kind: "allStatsDelta",
      amount: -1,
    }),
    injuryCategory("orsolya-colours-torn", "Mauled / Eviscerated", { kind: "noBonusDice" }),
  ],
  lastStand: { label: "Go Down Shooting", diceCount: 8 },
  downed: false,
  retired: false,
  activeLootId: null,
};

const DELPHINE: CharacterState = {
  id: "delphine",
  name: "Astrid",
  concept: "Ex-fighter pilot carrying the parasite soul of a wild predator",
  portraitId: "delphine-portrait",
  claimedByMemberId: null,
  stats: statSpread({ BRAWL: 3, CON: 1, FIX: 2, SEARCH: 3, SHOOT: 2, SNEAK: 2, TERRIFY: 4 }),
  blood: 0,
  items: [
    item("delphine-bone-knife", "Machine gun", "enemies in cover", 1, 4),
    item("delphine-ledger-of-names", "Greatspear", "receive a charge", 1, 4),
    item("delphine-lockpicks", "Fragmentation grenades", "enclosed spaces", 2, 2),
    item("astrid-spirit-fetters", "Spirit fetters", "animals", 3, 2),
  ],
  abilities: [
    specialAbility("delphine-special-marked-page", "Apex Predator", {
      kind: "reduceRating",
      amount: 3,
    }),
    specialAbility("delphine-blood-old-debts", "Unnatural Endurance", {
      kind: "removeAttackSuccesses",
      amount: 3,
    }),
    bloodAbility("delphine-other-catacomb-memory", "Bloodhunt", 1, "target fleeing", 1),
  ],
  advances: [
    { id: "delphine-advance-1", label: "Nightmare Regeneration", unlocked: false },
    { id: "delphine-advance-2", label: "Spirit Storm", unlocked: false },
    { id: "delphine-advance-3", label: "Tethered Phantom", unlocked: false },
  ],
  injuries: [
    injuryCategory("delphine-ink-stained-eyes", "Spirits Cowed / Spirits Cast Out", {
      kind: "noSpecials",
    }),
    injuryCategory("delphine-fingers-broken", "Sigils Marred / Bleeding Shadows", {
      kind: "statDelta",
      deltas: { SNEAK: 2, TERRIFY: -2 },
    }),
    injuryCategory("delphine-ledger-lost", "Limping / Ruined Leg", {
      kind: "allStatsDelta",
      amount: -1,
    }),
  ],
  lastStand: { label: "Unleash the Spirits", diceCount: 8 },
  downed: false,
  retired: false,
  activeLootId: null,
};

const TALLOW: CharacterState = {
  id: "tallow",
  name: "Flint",
  concept: "Half-bat, half-human cave-born nightmare and monstrous hunter",
  portraitId: "tallow-portrait",
  claimedByMemberId: null,
  stats: statSpread({ BRAWL: 4, CON: 2, FIX: 2, SEARCH: 2, SHOOT: 1, SNEAK: 3, TERRIFY: 3 }),
  blood: 0,
  items: [
    item("tallow-belt-fed-gun", "Steel gouging claws", "ambush", 1, 4),
    item("tallow-grenade-bag", "Grappling hook", "three or more storeys", 2, 3),
  ],
  abilities: [
    specialAbility("tallow-special-suppressing-fire", "Ravenous", { kind: "gainBlood", amount: 3 }),
    bloodAbility("tallow-blood-trench-hunger", "Sense Heartbeat", 1, "dense cover", 1),
    bloodAbility("tallow-other-never-stops-firing", "Improvised Projectile", 1, "aerodynamic", 1),
    bloodAbility("flint-wings", "Wings", 1, "aerial combat", 1),
  ],
  advances: [
    { id: "tallow-advance-1", label: "Hellish Screech", unlocked: false },
    { id: "tallow-advance-2", label: "Bone Armour", unlocked: false },
    { id: "tallow-advance-3", label: "Ooze Form", unlocked: false },
  ],
  injuries: [
    injuryCategory("tallow-hands-scarred", "Teeth Smashed / Jaw Broken", { kind: "noBloodGain" }),
    injuryCategory("tallow-ears-ringing", "Spooked / Broken", {
      kind: "statDelta",
      deltas: { SEARCH: 2, BRAWL: -2 },
    }),
    injuryCategory("tallow-coat-shredded", "Hamstrung / Eviscerated", { kind: "noBonusDice" }),
  ],
  lastStand: { label: "Final Form", diceCount: 8 },
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
