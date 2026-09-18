# Eat the Reich rules fidelity matrix (F01)

- **Status:** Fable deliverable for issue #14 task F01. Specification only; Sonnet B implements (B01–B05).
- **Source audited:** *Eat the Reich* (Rowan, Rook and Decard, 2023), **web-accessible PDF, "Web Version 1.1"**, 76 pages, John's own copy, read privately on 2026-09-14. Page numbers below are the PDF's printed page numbers. The publisher's introductory preview is **not** used as a source.
- **Source limits:** the character sheets (pp. 14–24) and the die-result diagram (p. 31) are partly image-only. Text extraction recovered every mechanic, stat block, ability, injury, and item **name and bonus requirement**, but **not the per-item use checkboxes** on the sheets. Rows that depend on those boxes are marked accordingly. Nothing in this document is inferred from the existing placeholder code.
- **Licensing boundary (binding):** this file records *where* a rule lives and *what* the platform must do. It does not reproduce rulebook prose, sheet text, location entries, or enemy entries, and nothing licensed may be committed to the repository. See "Canonical policy clarification" below for the narrow clarification B01 must record.

## 1. Executive verdict

The current `templates/eat-the-reich` mechanics are **original placeholder logic and do not implement Eat the Reich**. Every load-bearing rule differs:

| Placeholder behaviour (main @ 2823b69) | Rulebook behaviour | Page |
|---|---|---|
| One stat ("nerve") | Seven stats: BRAWL, CON, FIX, SEARCH, SHOOT, SNEAK, TERRIFY | 30 |
| Hit on 5+, no criticals | 1–3 discarded, 4–5 = success (1 point), 6 = critical (2 points, or activates a SPECIAL) | 31, 34, 71 |
| GM "opposition" successes are **subtracted** from player hits | GM rolls the engaged Threat's **Attack** dice; the player may spend their own dice to remove them; whatever is left **injures** the player | 31–33, 36 |
| Two allocation targets, cost 1 each | Five allocation families: Objective, Threat, Defend, Feed (Blood), SPECIAL; Challenge absorbs damage first | 32–33, 38 |
| No Blood, no injuries beyond a wound counter | Blood 0–10 (starts 0); six injury boxes in three categories; Downed; Death → Last Stand | 35–37 |
| One objective, one threat, one scene | Multiple Objectives/Threats per scene, Challenge, reinforcements each round, scene = one primary Objective, mission arc | 37–43 |
| GM hidden pool modifier | No such mechanic; nearest equivalents are Challenge and GM discretion | — |

Do not "switch 5+ to 4+" and call it fidelity. The resolution loop, allocation model, and character sheet all need re-implementation (B02/B03/B04).

## 2. Status legend

- **Verified** — rule read directly in the source; page cited; behaviour fully specified below.
- **Verified / partial** — rule read; part of it is narrative judgment the platform must leave to the GM.
- **Manual** — deliberately left to book-assisted GM adjudication for this milestone; the platform provides a bounded GM control and an audit reason instead of automation.
- **Missing source** — the exact value is on an image-only sheet region; default stated, GM must confirm from their book.
- **Priority:** P0 = required for the 2026-09-17 session; P1 = implement if time allows, else Manual; Defer = not this milestone.

## 3. Rules matrix

Columns: Rule → Source → Current implementation → Required behaviour → Tests → Status/Priority.

### 3.1 Characters and stats

| # | Rule | Source | Current | Required behaviour | Tests | Status |
|---|---|---|---|---|---|---|
| C1 | Seven stats; every action uses exactly one | p. 30 | `attributes.nerve` only | `stats: Record<Stat, number>` for the seven stats; `BeginAction.stat` selects one; if no stat fits, the book says roll 2 dice — expose as stat `none` with base 2 | Unit: pool base equals chosen stat; `none` → 2 | Verified · P0 |
| C2 | Pregenerated characters; mechanics fixed, backgrounds malleable; 3–6 players | pp. 10–11 | One character "Rook" bound to first member | Roster of **six original** characters (Appendix A), each claimable by exactly one member; up to 6 players + GM within the 8-seat cap | Unit: two claims of one character → second rejected `CHARACTER_TAKEN`; concurrency test with same `expectedRevision` | Verified · P0 |
| C3 | Custom-character shape: one stat at 4, two at 3, three at 2, one at 1; 3–4 items; 3 abilities (one SPECIAL, one Spend 1 Blood, one free choice); 3 advances; 3 injury categories; a Last Stand | pp. 74–75 | — | Original fixture characters must follow this shape (Appendix A does) | Fixture test: each roster entry validates against the shape | Verified · P0 |
| C4 | Blood: max 10, starts at 0 | p. 35 | none | `blood: 0..10`, clamp gains at 10, reject spends below 0 (`INSUFFICIENT_BLOOD`) | Unit: gain past 10 clamps; spend at 0 rejected | Verified · P0 |
| C5 | Blood can be shared between vampires within arm's reach | p. 36 | none | `ShareBlood{toCharacterId, amount}` player command; narrative "arm's reach" is GM-vetoable → allow by default, GM may reverse with correction | Unit: transfer moves exactly N; cannot overdraw; retry idempotent | Verified / partial · P1 |
| C6 | Healing: spend 3 Blood at any time to clear one marked injury | p. 37 | none | `HealInjury{injuryBoxId}` player command, cost 3, any time except during a Last Stand | Unit: clears exactly one box; rejects when Blood < 3; rejected mid-Last-Stand | Verified · P0 |

### 3.2 Building the pool

| # | Rule | Source | Current | Required behaviour | Tests | Status |
|---|---|---|---|---|---|---|
| P1 | Base dice = chosen stat rating | p. 30 | nerve | see C1 | as C1 | Verified · P0 |
| P2 | +1 die per item used; using an item spends one use | pp. 30–31 | flat gear bonus | `BeginAction.itemIds[]`: each adds 1 die and decrements `usesRemaining`; item with 0 uses cannot be selected; describing without paying grants no die | Unit: uses decrement once even on retry; 0-use item rejected `ITEM_DEPLETED` | Verified · P0 |
| P3 | +1 die per ability used; pay its cost (usually 1 Blood) | p. 30 | none | `BeginAction.abilityIds[]`: each adds 1 die and charges the ability's Blood cost; abilities with cost `special` or passive trigger cannot be "used" this way | Unit: Blood charged exactly once; insufficient Blood rejected | Verified · P0 |
| P4 | Bonus dice: each item/ability has a bonus requirement with 1–4 "+" marks; when the fiction satisfies it, add that many dice | p. 31 | none | `BeginAction.bonusClaims[]` (item/ability id) — the **GM confirms or strikes each claim** before dice are rolled (see F02 "declare-then-review" flow). Dice added = plus count | Unit: struck claim adds 0; approved adds N; GM-only approval | Verified / partial · P0 |
| P5 | Last use of an item that started with >1 use adds one extra die | p. 31 | none | Automatic when `usesRemaining` goes 1 → 0 and `maxUses > 1` | Unit: last-use bonus applied once; single-use items get none | Verified · P0 |
| P6 | Bonus dice may also be rolled later, during allocation, if new details satisfy a requirement | pp. 31, 35 | none | `LateBonus{rollId, claimIds}` GM-approved command that rolls extra dice into an open allocation | Unit: extra dice appended; only during `awaiting_allocation` | Verified · P1 (else Manual: GM applies via correction) |
| P7 | Injury penalties can forbid "+" dice, forbid SPECIALs, limit to one item per turn, alter stats, or demand Blood upkeep | pp. 14–24, 36 | none | Typed penalty tags on each second injury box (Appendix A lists tags); pool builder enforces `noBonusDice`, `noSpecials`, `oneItemPerTurn`, `statDelta`, `noBloodSpend`, `noBloodGain`; `bloodUpkeep` is announced, GM enforces | Unit per tag | Verified / partial · P0 for the six typed tags |

### 3.3 Rolling and reading dice

| # | Rule | Source | Current | Required behaviour | Tests | Status |
|---|---|---|---|---|---|---|
| D1 | d6 pool; 1–3 discarded; 4–5 success (worth 1); 6 critical (worth 2, or activates a SPECIAL) | p. 31 diagram labels, p. 34 worked example, p. 71 designer note | 5+ hit, no criticals | `interpretDie(face, discardBelow=4)` → `discard | success | critical`. Points: success 1, critical 2. Only a critical can activate a SPECIAL | Unit with fixed faces [1,2,3,4,5,6]: kept = [4,5,6], points = 4 | Verified · P0 (diagram not rendered; three text passages agree) |
| D2 | Some enemies change the discard band (a Threat with "discard 1–4") | p. 56 | none | Threat flag `discardBelow` (default 4, override 5) applied to the player's dice when engaged with that threat | Unit: face 4 discarded under override | Verified · P1 |
| D3 | GM's dice have no critical rule; each 4+ is one success | p. 32 | opposition uses same 5+ rule | GM attack success = face ≥ 4, worth 1, except an enemy flag `attackCritOnSix` (a named elite gives 2 per 6) | Unit: [6,6] → 2 by default, 4 with flag | Verified · P0 (flag P1) |
| D4 | Flashback: once per session, when you roll 2 successes or fewer, add 2 dice and reroll everything; second result stands | p. 41 | none | `Flashback{rollId}` player command before allocation; allowed if kept dice ≤ 2 and `flashbackUsed=false`; rerolls entire pool + 2 with the same command seed | Unit: rerolled faces reproducible from seed; second use rejected; > 2 kept rejected | Verified · P1 |
| D5 | Passive triggers "after you roll, before you discard" (gain Blood on any 1; remove one GM success per 1 rolled) | pp. 18, 20, 24 | none | Ability tags `onOnesGainBlood(1)` and `onOnesRemoveAttack(1 each)` evaluated automatically at roll time | Unit: two 1s → two GM dice removed | Verified · P1 |

### 3.4 Opposition (the GM's Attack pool)

| # | Rule | Source | Current | Required behaviour | Tests | Status |
|---|---|---|---|---|---|---|
| O1 | GM rolls dice equal to the **Attack** of the Threat the acting character is engaged with; if several, the highest Attack **plus 1 per additional active Threat in play** | pp. 31, 37–38 | `basePool + pushDice`, hits subtracted | `ReviewAction.engagedThreatIds[]` chosen by GM; server computes `attackDice = max(attack of engaged) + (activeThreatsInScene − 1)` where "in play" = every Threat in the scene with rating > 0; GM cannot type an arbitrary number | Unit: p. 38 example (6/3 + 4/2 → 4 dice; after first at 0 → 2 dice) | Verified / partial (engagement is GM judgment) · P0 |
| O2 | No engaged Threat → GM rolls nothing; no injury possible | p. 37 | n/a | `engagedThreatIds = []` → 0 attack dice, skip injury | Unit | Verified · P0 |
| O3 | A Threat at rating 0 has Attack 0 | p. 37 | `defeated` status | rating 0 ⇒ effective Attack 0 until reinforced | Unit | Verified · P0 |
| O4 | If the GM rolls zero successes, that Threat's Attack rises by 1 after the action resolves | p. 38 | none | Applied automatically in `ActionResolved` when attack dice > 0 and successes = 0 (to the primary engaged threat) | Unit | Verified · P0 |
| O5 | The GM's remaining successes after the player finishes allocating cause an Injury (≥1) or Downed (≥3) | pp. 33, 36 | none | see I1/I2 | see I1/I2 | Verified · P0 |

### 3.5 Allocation

Each kept die is allocated individually; a success is worth 1 point and a critical 2 at its target. "Points" below means that value.

| # | Rule | Source | Current | Required behaviour | Tests | Status |
|---|---|---|---|---|---|---|
| A1 | Targets: advance an Objective; eliminate a Threat; defend (remove GM Attack dice); feed (gain Blood); activate a SPECIAL (critical only) | pp. 32–33 | 2 targets | `AllocateResults.allocations[]` = `{dieIndex, target}` with target ∈ `objective:{id}`, `threat:{id}`, `defend`, `feed`, `special:{abilityId}`; every kept die must be allocated exactly once (a die may be deliberately wasted only as `defend` when no attack dice remain — reject silent drops) | Unit: unallocated die rejected; duplicate die rejected; success on `special` rejected | Verified · P0 |
| A2 | Objective: −1 per success, −2 per critical; 0 = complete; the player who removes the last point narrates | pp. 32, 37 | −1 per use | points reduce `rating`; on reaching 0 emit `ObjectiveCompleted{byCharacter}` and mark scene-ending if primary | Unit: 6 → 0 by 3 criticals; over-kill clamps at 0 | Verified · P0 |
| A3 | Threat: same as A2; at 0 it is beaten back, Attack 0 | p. 32 | −1 per use | points reduce `rating`; 0 ⇒ Attack 0 (see O3, R1) | Unit | Verified · P0 |
| A4 | Defend: a success removes one GM Attack die, a critical removes two | p. 32 | none | reduce `remainingAttackSuccesses` by points, floor 0 | Unit | Verified · P0 |
| A5 | Feed: +1 Blood per success, +2 per critical, max 10 | pp. 33, 35 | none | add points to Blood, clamp 10; enemy flag `noFeeding` (an undead enemy) forbids when engaged only with it | Unit: clamp; flag rejects | Verified · P0 (flag P1) |
| A6 | SPECIAL: only a critical may activate one; the SPECIAL's effect is on the sheet | p. 33 | none | `special:{abilityId}` requires a critical die and an ability with `trigger: special` the character owns and no `noSpecials` injury; typed effects applied automatically (Appendix B), untyped effects recorded as a GM note for manual application | Unit: success die → reject; typed effect applies once | Verified / partial · P0 |
| A7 | Challenge: a Threat/Objective with Challenge N negates N of the points spent on it **per character per turn** before its rating drops | pp. 32, 38 | none | For each target in one allocation: `damage = max(0, points − challenge)` | Unit: p. 38 example (Challenge 2, 3 successes → −1; Challenge 1, 4 successes → −3) | Verified · P0. **Ambiguity:** p. 32 says Challenge "absorbs dice", p. 38 says it "negates successes"; they differ only when a critical is absorbed. **Default = points** (matches the p. 38 worked example); GM may correct. |
| A8 | Points may be split across every Objective and Threat present, as the fiction allows | p. 37 | single threat + single objective | all scene entities with rating > 0 (and revealed) are valid targets | Unit: mixed allocation | Verified / partial · P0 |
| A9 | Allocation must not exceed what was rolled; a player cannot allocate another player's roll | p. 32; platform invariant | enforced | keep both checks | existing + updated tests | Verified · P0 |

### 3.6 Injuries, Downed, Death

| # | Rule | Source | Current | Required behaviour | Tests | Status |
|---|---|---|---|---|---|---|
| I1 | If the GM has ≥1 Attack success left when the player is out of dice: roll d6 → category (1–2 / 3–4 / 5–6); tick the first box, else the second, else pick another category; the second box carries a penalty | pp. 33, 36 | wound counter | Server rolls the category die inside `AllocateResults` resolution (same seed); if both boxes of the rolled category are full, the **player chooses** the alternate category (`ChooseInjuryCategory` follow-up, or default to the lowest-numbered open category when none is chosen within the UI) | Unit: fixed seed; overflow prompt; penalty tag activates on 2nd box | Verified / partial · P0 |
| I2 | ≥3 Attack successes left ⇒ Downed: roll category, mark **all available** boxes in it; out of the fight until rescued; rescue is a new Objective (rating 2–4, GM's call); if not rescued before the scene moves on, captured | p. 36 | none | `downed: true`; downed character cannot `BeginAction`; server auto-creates secondary objective "Rescue {name}" with GM-editable rating default 3; completing it clears `downed`; scene transition with a downed character requires GM to choose `captured` or `rescued-offscreen` with a reason | Unit: downed blocks action; rescue objective completion clears | Verified / partial · P0 |
| I3 | Death: all six boxes marked ⇒ Last Stand: roll 8d6, apply freely to current Objectives/Threats (no healing SPECIAL), then the character retires | p. 36 | none | `LastStand{characterId}` player command available when all six boxes are marked; rolls 8 dice, standard allocation targets minus `feed`/`special:heal`, then `retired: true` | Unit: 8 dice; retired cannot act; heal-type special rejected | Verified · P1 (P0 fallback: GM marks `retired` via correction and adjudicates by hand) |
| I4 | An elite with "rending" marks **all** available boxes in the rolled category on any injury | p. 64 | none | Threat flag `injuryMarksWholeCategory` | Unit | Verified · P1 |
| I5 | Healed-then-remarked injuries carry the same penalty | p. 37 | none | boxes are booleans; penalty re-activates | Unit | Verified · P0 |

### 3.7 Objectives, Threats, Scenes, Rounds

| # | Rule | Source | Current | Required behaviour | Tests | Status |
|---|---|---|---|---|---|---|
| S1 | Objective rating 2–12; scene ends when its primary Objective is completed | pp. 37, 39 | `advancesRemaining` | `Objective{id, title, rating, challenge, kind: primary|secondary|rescue|retreat, status}`; primary → 0 ⇒ `SceneCompleted` pending GM `NextScene` | Unit: completion emits scene-complete; secondary does not | Verified · P0 |
| S2 | Secondary Objectives ≈ half the primary's rating; on completion the player picks one of six rewards (reduce a primary by d6; reduce a Threat by d6; gain d6 Blood; reduce a Threat's Attack by 2; reduce a Challenge by 1; gain unusual equipment) | p. 39 | none | `ChooseSecondaryReward{objectiveId, reward}` player command; d6 rewards rolled server-side | Unit: each reward; one choice only | Verified · P1 (P0 fallback: GM applies via correction with reason) |
| S3 | Retreat: new Objective "Escape" with GM-set rating; never end closer to the finale than before | p. 49 | none | GM `AddObjective{kind: retreat}`; movement is narrative | — | Manual |
| S4 | Threat = rating + Attack (+ optional Challenge); an elite/solo Threat does not reinforce and is removed at 0; a slain elite's blood unlocks one advance for the drinker | pp. 37–38, 43, 53–64 | `resolveRemaining/basePool` | `Threat{id, name, rating, startingAttack, attack, challenge, solo, elite, flags[], status: active|beaten|removed, revealed}`; elite at 0 ⇒ `removed` + GM prompt to grant an advance | Unit: solo skips reinforcement; elite removal | Verified · P0 (advance grant P1 via GM correction) |
| S5 | Turn order: GM chooses who acts; each character acts once per round; then reinforcements and a new round | p. 30 | free-for-all | `round` counter; `actedThisRound[]`; a character who already acted is blocked until `EndRound` (GM may override with a correction); GM picks order verbally, optionally sets a "spotlight" hint | Unit: second action same round rejected; EndRound resets | Verified / partial · P0 |
| S6 | Reinforcements at end of round: each Threat at 0 regains 1d6 rating and Attack = ⌊starting/2⌋; every active Threat's Attack +1; solo/elite exempt; a named squad also gains +2 rating whenever its Attack rises this way | p. 38, 61 | none | `EndRound` GM command applies all of this server-side with the command seed; emits per-threat deltas for the log | Unit: p. 38 worked example reproduced with fixed d6 | Verified · P0 |
| S7 | Simplified variant: ignore reinforcements, raise ratings 1–3, remove Threats at 0 | p. 38 | none | Scene/room setting `reinforcements: "book" | "simplified"` chosen at session creation, GM-changeable with reason | Unit: simplified removes at 0 | Verified · P1 |
| S8 | Mission arc: briefing → drop into the outer sector (raise opening Objectives by 2–4) → 2–3 locations per sector → elite set-pieces (foreshadowed) → climb → airship → final guardian → epilogue | pp. 42–43, 49, 63–66 | none | `LoadScene`, `NextScene`, `EndMission` GM commands over an ordered original scene list (Appendix C); characters, Blood, injuries, items carry across scenes; Threats do not | Integration: two consecutive scenes keep character state | Verified · P0 (content original) |
| S9 | Loot: once per Objective, keep an item with a GM-agreed bonus requirement; 3 uses; only one loot item mechanically available at a time; a scene may list special loot with its own uses/bonus | pp. 39–40 | none | GM `GrantItem{characterId, item}`; character `activeLootId` | Unit: second loot swaps active | Verified · P1 |
| S10 | Elite/enemy special rules (undead enemy: GM 1s raise its Challenge for the action; no feeding; entropy enemy: discard 1–4, ruins one item per round; hunters: 6 = 2 successes; riders: everyone gains a SPECIAL; final guardian: whole-category injuries, Challenge cannot be lowered) | pp. 53–64 | none | Typed flags: `discardBelow`, `noFeeding`, `attackCritOnSix`, `challengeLocked`, `injuryMarksWholeCategory`, `challengeUpPerGmOne`, `grantsSpecial{...}`, `ruinsItemEachRound` | Unit per flag | Verified · P1; anything untyped → Manual |

### 3.8 Safety and table procedure

| # | Rule | Source | Current | Required behaviour | Status |
|---|---|---|---|---|---|
| T1 | Lines/veils, X-card, traffic lights; pause to renegotiate | pp. 6–7, 68–69 | none | Anonymous **Pause/Resume** for this milestone (B04 with A); the rest of the safety toolkit is Phase 3 per `docs/IMPLEMENTATION_ROADMAP.md`. Pause must not reveal the initiator. | Verified · P0 (Pause only) |
| T2 | GM has veto over player-introduced details; players may narrate anything but named characters | p. 33 | — | Bonus-claim review (P4) is the mechanical form of the veto; everything else is table talk | Manual |

## 4. What stays manual for the 2026-09-17 session

The platform must show these as GM controls with a required reason, never silently:

1. Whether a bonus requirement is satisfied (P4) — GM strikes/approves claims.
2. Which Threats a character is engaged with (O1).
3. Narrative-only ability effects (Appendix B "untyped") and SPECIALs without a typed effect.
4. Injury penalty text that is not one of the six typed tags (P7).
5. Retreat, capture, off-screen rescue (S3, I2).
6. Secondary-objective rewards, loot, advance unlocks if P1 items are cut (S2, S9, S4).
7. Anything in the book the GM changes on purpose (p. 45 explicitly licenses house rules) — the correction command with reason is the audit trail.

## 5. Canonical policy clarification (for B01 to record)

Proposed text for `AGENTS.md` ("Non-negotiable boundaries") and `docs/EAT_THE_REICH_BUILD_GUIDE.md`:

> Ordinary game-mechanical structure and short field labels (the seven stat names; Blood; Objective, Threat, Challenge, Attack ratings; success/critical thresholds; injury categories; Downed; Last Stand; Loot; Flashback) may be implemented in code and shown in the UI. Rulebook prose, character sheets, location and enemy entries, tables of flavour, and artwork remain licensed and must never be committed. Shipped fixtures are original. A GM may load their own copy's content only from a private, git-ignored owner content pack on their machine (`content/private/*.json`, never in the repository, never in shared Firestore documents readable by other rooms).

This is a clarification of the existing "no licensed game text" boundary, not a relaxation of it.

## 6. Test plan handed to B01

Deterministic fixtures, fixed seeds, no wall clock:

- **Die interpretation** (D1): faces 1..6 each; mixed pool; empty pool.
- **Pool build** (P1–P5, P7): stat + 2 items + 1 ability + approved bonus + last-use; depleted item; injury tags.
- **Attack pool** (O1–O4): 0/1/2/3 engaged threats; zero-success bump.
- **Allocation** (A1–A9): every target; Challenge absorption incl. critical; over-allocation; unallocated die; foreign roll; completed target; feeding at 10; success on SPECIAL.
- **Injury** (I1–I5): 1 and 3 remaining attack successes; overflow category; penalty activation; healing.
- **Rounds/reinforcement** (S5–S7): p. 38 example; solo exemption; simplified mode.
- **Scenes** (S1, S8): primary completion; carry-over of Blood/injuries/items; threats reset.
- **Projection isolation**: hidden threat notes, unrevealed threats, GM notes never in player/table views; other players' pending declarations visible only as "acting".
- **Retry**: every command above resubmitted with the same `commandId` produces identical events and no double Blood/uses/injuries.

## Appendix A — Original roster fixture (spec for B02, C04)

All six are original creations for DigiTable. They follow the p. 74–75 shape and reuse no licensed name, background, item, ability, or injury text. Values are fixed; B may adjust wording, not structure. Portrait/asset ids match `docs/ETR_ART_BRIEF.md`.

Shared structure per character: `stats` (7), `blood` 0, `items[]` (each: `uses`, `bonus` = plus count + short requirement), `abilities[]` (3: one `special`, one `blood:1`, one other), `advances[]` (3, locked), `injuries` (3 categories × 2 boxes; second box has a `penalty` tag from Appendix B), `lastStand` (label, 8 dice).

| id | Name | Concept | BRAWL/CON/FIX/SEARCH/SHOOT/SNEAK/TERRIFY |
|---|---|---|---|
| `rook` | Rook | Sharp-eyed courier; drop-coffin scout | 2/2/2/3/3/**4**/1 |
| `vesper` | Vesper Caul | Opera-house phantom; mesmerist | 2/**4**/1/2/2/3/3 |
| `halloran` | Halloran | Defrocked sapper-priest; blasting charges and hymns | 3/2/**4**/2/3/1/2 |
| `orsolya` | Orsolya Vând | Hussar revenant; sabre and horse-sense | **4**/1/2/2/3/2/3 |
| `delphine` | Delphine Marchetti | Catacomb archivist; reads bones and ledgers | 2/3/3/**4**/1/2/2 |
| `tallow` | Grigor "Tallow" Belyakov | Trench-gunner ghoul; never stops firing | 3/1/2/2/**4**/2/3 |

Items (3 uses unless noted): Rook — courier satchel of forged papers (+ checkpoints), silenced pistol (+ close quarters), rooftop line and hook (++ three storeys or more), pocket mirror (mark once: ignore one injury this turn). Vesper — sabre-cane (+ a duel), phosphor stage flash (++ a crowd), stolen officer's greatcoat (+ they think you belong). Halloran — shaped charges (+++ a wall or door), trench shotgun (+ point blank), blessing-oil lantern (++ darkness). Orsolya — cavalry sabre (+ charge), carbine (+ from the saddle or a moving vehicle), requisitioned draft horse (++ open streets). Delphine — bone-handled knife (+ from behind), ledger of names (+++ any, 1 use), lockpicks (+ a locked way through). Tallow — belt-fed gun (+ enemies in cover), grenade bag (++ enclosed spaces), spade (+ dug in).

Abilities (each character: 1 special, 1 blood-cost, 1 other) and advances are defined in `templates/eat-the-reich/src/roster.ts` by B02 using only the typed effects in Appendix B or a `text` effect marked manual. Injury categories are original (e.g. Rook: "papers burned / hands broken"), with second-box penalties drawn from Appendix B tags.

## Appendix B — Typed effect vocabulary (for abilities, SPECIALs, injury penalties, threat flags)

| Tag | Applies to | Effect the engine performs |
|---|---|---|
| `reduceThreatAttack(n)` | special/ability | engaged Threat's Attack −n (floor 0) |
| `reduceRating(target, n)` | special | Threat/Objective rating −n (Challenge ignored) |
| `reduceChallenge(target, 1, untilEndOfRound)` | ability | temporary Challenge −1 |
| `ignoreChallengeNextAction` | ability | next action's allocations ignore Challenge |
| `gainBlood(n)` | special/ability/trigger | Blood +n (clamp 10) |
| `clearInjury(1)` | special | erase one marked box (not during Last Stand) |
| `removeAttackSuccesses(n)` | special/trigger | GM remaining successes −n |
| `onOnesGainBlood(1)` / `onOnesRemoveAttack(1)` | passive | per 1 rolled, before discard |
| `damageElite(n)` | special | rating −n on an `elite` Threat |
| `statOverride({...}, untilObjectiveComplete)` | ability | temporary stat set |
| `restoreItemUse(itemId, 1)` | special | uses +1 (cap max) |
| Injury: `noBonusDice`, `noSpecials`, `oneItemPerTurn`, `statDelta({stat:+2, stat:-2})`, `allStatsDelta(-1)`, `noBloodSpend`, `noBloodGain`, `bloodUpkeep(1)` | injury 2nd box | enforced in pool build / allocation; `bloodUpkeep` announced only |
| Threat: `discardBelow(5)`, `noFeeding`, `attackCritOnSix`, `challengeLocked`, `injuryMarksWholeCategory`, `challengeUpPerGmOne`, `grantsSpecial(reduceRating(self,3))`, `ruinsItemEachRound` | threat | see S10 |
| `text` | any | shown to GM and player; **no automatic effect**; GM applies with a correction |

## Appendix C — Original scene list for the milestone (spec for B05, C03, C04)

Four original scenes; enough for opening, two distinct middle scenes, and a conclusion. Ratings follow the book's ranges (Objectives 2–12; opening raised by +2 per p. 42). Threat stat lines are original but sit in the same bands as the book's common enemies so the pacing feels right.

| # | Scene id | Location (original) | Primary Objective (rating, challenge) | Threats (rating / attack / challenge / flags) | Notes |
|---|---|---|---|---|---|
| 0 | `drop-forecourt` | Forecourt of the Gare des Ombres, dusk, the coffins have just hit | "Get clear of the wreckage and into the streets" (8, 0) | Station Patrol ×2 (4/2/0) | Opening: every character introduces themselves; GM teaches Blood by prompting Feed |
| 1 | `metro-platform` | Abandoned Métro platform (existing art) | "Cut through the tunnels to the far exit" (8, 0) | Plated Squad (6/3/1); **The Enforcer** (elite, 8/4/1, solo, revealed after round 1) | Elite blood → advance |
| 2 | `printworks` | The occupier's propaganda printworks | "Wreck the presses and get out through the loading yard" (8, 1) | Rifle Squad (6/3/0); Marksman Nest (3/6/2, solo); secondary "Free the night-shift" (4, 0) → reward | Loot: "Ink-drum on a trolley" (++ rolling downhill) |
| 3 | `signal-mast` | The Signal Mast on the river bluff (conclusion) | "Silence the Voice" (10, 1) | Armoured Truck (4/2/1, solo); **The Warden** (elite, 10/5/1, solo, `challengeLocked`, `injuryMarksWholeCategory`) | Objective 0 ⇒ `EndMission` available; epilogue prompt per character |

Secondary/retreat/rescue Objectives are created by the GM at the table (S2, S3, I2). Foreshadowing lines for elites live in the GM-only `notes` field and never project to players or the table.

## Appendix D — Open questions for John (do not block)

1. **Item use counts on the printed sheets** (P2, Missing source): the default for original items is 3 uses (the book's loot rule, p. 39). Please confirm from your copy whether standard sheet items also use 3 so the private content pack mirrors it.
2. **Challenge and criticals** (A7): default is "negates points". Say if you prefer "absorbs whole dice".
3. **Reinforcements mode** (S7): book mode is the default for the 17th; say if you want the simplified variant for a first session.
