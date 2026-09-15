# Eat the Reich rules implementation plan (B01)

- **Status:** Sonnet B deliverable for issue #14 task B01. Plan only; B02–B05 implement it.
- **Input:** `docs/ETR_RULES_MATRIX.md` (F01, Fable, `origin/fable/etr-specifications` @ `b2ec3a1`), `docs/ETR_SESSION_FLOW.md` (F02), `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/TEMPLATE_ARCHITECTURE.md`.
- **Scope:** turns the matrix's per-rule "Required behaviour"/"Tests" columns into (1) an explicit schema/version decision, (2) a slice plan across B02–B05, (3) a traceable deterministic test-case list, and (4) a manual-adjudication register for what stays a GM control this milestone. It records the §5 licensing clarification in `AGENTS.md` and `docs/EAT_THE_REICH_BUILD_GUIDE.md` (done in this same PR).

## 1. Schema/version decision

**Decision: bump `EatTheReichState.schemaVersion` from `1` to `2` as a fresh start, not a migrated one.**

Rationale, checked against `docs/ARCHITECTURE.md`'s versioning requirement ("a real `migrate` path from v1, or an explicit 'no live rooms exist' decision"):

- Per `S00`'s inventory (issue #14), room creation (`A03`) is not implemented and PR #13 (admission) is not merged. No `createRoom` call has ever produced a live Firestore room under `schemaVersion: 1`'s `EatTheReichState` shape — the only place that shape has ever existed is the local engine, this template's own tests, and the Phase 1C in-memory fixture demo (`apps/web` fixture mode), none of which are persisted, shared, or durable state.
- The v1 shape (one "nerve" stat, a wound counter, two allocation targets, no Blood/injuries/items/abilities/scenes) is structurally incompatible with the v2 shape B02–B05 introduce (seven stats, roster claims, Blood, six-box typed injuries, items with uses, abilities, five allocation families, Objectives/Threats/Challenge, scenes/rounds). A field-by-field migration would have to invent data that never existed (there is no "nerve" to map to seven stats, no items/abilities/Blood to backfill) — inventing placeholder values for a live room would silently corrupt real play state, which `docs/ARCHITECTURE.md`'s fail-closed persisted-data rule forbids.
- Therefore `migrate()` keeps its existing fail-closed shape: it accepts only `schemaVersion === EAT_THE_REICH_MANIFEST.currentSchemaVersion` (now `2`) and returns `{ ok: false }` for anything else, including `1`. This is not a regression — v1 already only accepted itself and rejected every other version. A room stamped with the old `templateVersion`/`schemaVersion: 1` fails closed on load with a stable, recoverable error (`TEMPLATE_VERSION_MISMATCH`, already in `packages/contracts/src/errors.ts`) rather than reading a wrong shape.
- If John's own manual local testing has produced a persisted v1 room in a personal Firebase project outside this repo's authority, that room is not "live" in the product sense the architecture doc means (no other player depends on it) and is expected to be recreated once B02+ lands, per the roadmap's Phase 2 exit criterion ("three physical clients survive disconnect/reconnect") not yet having been reached.

`EAT_THE_REICH_MANIFEST.templateVersion` bumps from `0.1.0` to `0.2.0` alongside the schema bump (B02), signalling the structural rewrite to anything inspecting the manifest.

## 2. Original fixture vs. verified mechanics

- **Verified mechanics** (matrix status "Verified" or "Verified / partial"): implemented in code, matched against the matrix's page citation, tested against the matrix's "Tests" column. These are rules, not content — e.g. "4–5 is a success, 6 is a critical" is a verified mechanic; "Vesper Caul, opera-house phantom" is original content that happens to fit the verified *shape* of a playable character (seven stats, one stat at 4/two at 3/three at 2/one at 1, three items, three abilities).
- **Original fixture content**: the six-character roster (Appendix A), the four-scene mission (Appendix C), and every item/ability/injury name and flavour line are DigiTable originals. They are structurally bound by verified mechanics (stat spread shape, item/ability counts, Objective rating bands) but contain no licensed text.
- **Manual** (matrix status "Manual", or a "Verified" rule whose Status column says "P1 (else Manual)"): the platform exposes a bounded GM control with a required reason instead of automating the rule. These are listed in §4 below, carried forward unchanged from matrix §4.

## 3. Slice plan (B02–B05)

Each slice is its own branch off the previous slice's branch/PR, per the board's collision rules.

| Slice | Matrix sections | Core deliverable |
|---|---|---|
| B02 | 3.1 (characters/stats), most of 3.2 (pool P1–P3, P7) | State v2: `stats` (7), roster fixture (Appendix A), `ClaimCharacter`/`ReleaseCharacter`, Blood (C4), items with uses, abilities, six-box typed injuries (structure only — activation is B03), `HealInjury` (C6). No resolution loop yet. |
| B03 | 3.2 (P4–P6 as P0/P1 split), 3.3 (dice), 3.4 (opposition), 3.5 (allocation), 3.6 (injury activation) | The declare → GM review → single server roll → allocate loop (`docs/ETR_SESSION_FLOW.md` §6): `BeginAction`, `ReviewAction`, `AllocateResults`, `ChooseInjuryCategory`. Replaces the old `BeginAction`/`SubmitOpposition`/`AllocateResults` opposed-roll shape entirely (matrix's explicit instruction: re-implement, don't retune thresholds). |
| B04 | 3.7 (scenes/rounds/reinforcements), 3.8 (Pause, with A) | `LoadScene`/`NextScene`/`EndMission`, `EndRound` with reinforcements, `RevealThreat`, `EditScene`, `CorrectCharacter`, `VoidRoll`, `GrantItem`/`UnlockAdvance`, `ReassignCharacter`, `SetSceneRules{reinforcements, reason}` (GM command, not a room-creation field — see `docs/ETR_SESSION_FLOW.md` §7, reconciled 2026-09-14 @ `9f66672`), `Pause`/`Resume`. Scene-transition guards (`ROUND_HAS_OPEN_ROLLS`, `SCENE_HAS_OPEN_ROLLS`). |
| B05 | Appendix C fixture, §6 test plan closure, private content pack | Four-scene original mission fixture wired end to end; `content/private/*.json` loader (git-ignored, never committed); property/budget/migration fixtures; F04's ten fixed-seed scenarios `docs/ETR_PLAYTEST.md` S01–S10 bound as engine-level tests where cheap; independent rules review. |

B02 and B03 are tightly coupled (a roll needs a character to roll for, and a character's fields — items, abilities, injuries — only matter once the roll/allocation loop can read them), so B03 is expected to touch B02's state shape further as the loop is built, per the matrix's own P4–P6 sequencing.

## 4. What stays manual for the 2026-09-17 session

Carried forward from `docs/ETR_RULES_MATRIX.md` §4, unchanged:

1. Whether a bonus requirement ("+") is satisfied — the GM strikes/approves each claim during review (P4; this *is* automated as the review step itself, matrix P4/`ReviewAction`; what's manual is the GM's *judgment call*, not the mechanical die-count effect of approving/striking).
2. Which Threats a character is engaged with (O1) — GM confirms/edits the player's proposed `engagedThreatIds` during review.
3. Narrative-only ability effects and SPECIALs without a typed effect (Appendix B `text` tag) — shown to the GM, applied by hand, audited via a correction reason.
4. Injury penalty text that is not one of the six typed tags (P7).
5. Retreat, capture, off-screen rescue narrative detail (S3, I2) — the platform provides the bounded object (an Escape/Rescue Objective, a scene-transition prompt) but not the narration.
6. Secondary-objective rewards, loot, advance unlocks **if cut for time** (S2, S9, S4 are P1) — GM applies via `CorrectCharacter`/`GrantItem`/`UnlockAdvance` with a reason.
7. Anything the GM changes on purpose (house rules, p. 45) — the correction command with reason is the audit trail, never silent.

P1 items implemented opportunistically in B03/B04 if time allows (Flashback D4, late bonus dice P6, passive triggers D5, threat flags beyond the four Appendix-C scenes need, secondary-objective rewards S2, loot S9, Last Stand I3, elite/enemy flag library S10 beyond what Appendix C's four scenes use): each has a P0 manual fallback already described in the matrix, so cutting a P1 item for time is a scope reduction, not a broken commitment — B05's status comment records exactly which P1 items shipped vs. fell back to manual.

## 5. Deterministic test-case register

Every row is a concrete test to be written in the naming slice. `seed` means a fixed string passed to `createSeededRandom` (`@digitable/engine`); `faces` means a `FixedSequenceRandom` test double (see `templates/eat-the-reich/test/pool.test.ts`) that returns an exact face sequence, used wherever the matrix cites a specific worked example. This register is also encoded as `test.todo(...)` placeholders in `templates/eat-the-reich/test/rulesMatrix.todo.test.ts` (this PR) for traceability; each slice converts its rows from `.todo` to real assertions and deletes the corresponding placeholder.

### 5.1 Characters and pool (B02, matrix 3.1, 3.2 P1–P3/P7)

| Test | Matrix # | Fixed input | Expected |
|---|---|---|---|
| `pool base equals chosen stat` | C1 | stat `SNEAK=3` | pool base 3 |
| `stat "none" gives base 2` | C1 | no stat selected | pool base 2 |
| `roster has exactly six claimable characters` | C2 | Appendix A roster | 6 entries, each one `available` initially |
| `second claim of a taken character is rejected` | C2 | two `ClaimCharacter` for `rook` | first accepted, second `CHARACTER_TAKEN` |
| `concurrent claim retried with stale revision is rejected` | C2 | same `expectedRevision` after a claim lands | `REVISION_CONFLICT` |
| `each roster entry matches the book's custom-character shape` | C3 | Appendix A fixture | one stat 4, two at 3, three at 2, one at 1; 3–4 items; 3 abilities (special/blood/other); 3 advances; 3 injury categories × 2 boxes; a Last Stand |
| `blood gain past 10 clamps at 10` | C4 | blood 9, gain 3 | blood 10 |
| `blood spend below 0 is rejected` | C4 | blood 0, spend 3 | `INSUFFICIENT_BLOOD` |
| `heal injury clears exactly one box for 3 blood` | C6 | blood 5, one marked box | blood 2, box cleared |
| `heal injury rejected below cost` | C6 | blood 2 | `INSUFFICIENT_BLOOD` |
| `heal injury rejected during Last Stand` | C6 | `retired` pending / Last Stand active | rejected |
| `item use adds one die and decrements uses once, even on retry` | P2 | item `uses: 3` | pool +1, uses 2; same `commandId` retried → still uses 2 |
| `depleted item cannot be selected` | P2 | item `uses: 0` | `ITEM_DEPLETED` |
| `ability use adds one die and charges blood exactly once` | P3 | ability cost 1 blood, blood 2 | pool +1, blood 1; retry unchanged |
| `insufficient blood for ability is rejected` | P3 | ability cost 1 blood, blood 0 | `INSUFFICIENT_BLOOD` |
| `injury tag noBonusDice forbids bonus claims` | P7 | second-box injury active | claimed bonus contributes 0 dice |
| `injury tag oneItemPerTurn limits selection to one item` | P7 | two items selected | rejected at declare |
| `injury tag statDelta adjusts the chosen stat's pool base` | P7 | `statDelta({SHOOT:-2})` | pool base reduced by 2, floor 0 |

### 5.2 Rolling and pool completion (B03, matrix 3.2 P4–P6, 3.3)

| Test | Matrix # | Fixed input | Expected |
|---|---|---|---|
| `struck bonus claim adds no dice; approved adds its plus count` | P4 | claim "+2", GM strikes it | 0 dice; GM approves → +2 dice |
| `last use of a multi-use item adds one extra die` | P5 | item `uses: 1→0`, `maxUses: 3` | pool +1 beyond the normal +1 |
| `single-use item gets no last-use bonus` | P5 | item `maxUses: 1` | no extra die |
| `interpretDie classifies every face` | D1 | faces `[1,2,3,4,5,6]` | kept `[4,5,6]`, points `4` (1+1+2) |
| `empty pool interprets to zero kept, zero points` | D1 | pool size 0 | `[]`, 0 |
| `threat discardBelow override changes the discard band` | D2 | threat flag `discardBelow(5)`, face 4 | discarded |
| `GM attack success is 4+, worth 1, no criticals by default` | D3 | faces `[6,6]` | 2 successes |
| `attackCritOnSix flag makes a 6 worth 2` | D3 | flag set, faces `[6,6]` | 4 successes |

### 5.3 Opposition / Attack pool (B03, matrix 3.4)

| Test | Matrix # | Fixed input | Expected |
|---|---|---|---|
| `attack dice equal the engaged threat's Attack` | O1 | one engaged threat, Attack 3 | 3 attack dice |
| `attack dice add 1 per additional active threat in play` | O1 | matrix p.38 worked example: 6/3 and 4/2 engaged, one more active | 4 dice; after the first threat reaches 0 → 2 dice |
| `no engaged threat rolls zero attack dice` | O2 | `engagedThreatIds: []` | 0 dice, no injury roll |
| `threat at rating 0 has effective attack 0` | O3 | threat `rating: 0` | 0 attack dice from it |
| `zero GM successes bumps the primary engaged threat's Attack by 1` | O4 | attack dice > 0, 0 successes | `attack += 1` after resolution |

### 5.4 Allocation (B03, matrix 3.5)

| Test | Matrix # | Fixed input | Expected |
|---|---|---|---|
| `every kept die must be allocated exactly once` | A1 | 3 kept dice, 2 allocated | rejected |
| `duplicate die index is rejected` | A1 | two allocations for `dieIndex: 0` | rejected |
| `a success cannot be allocated to a SPECIAL` | A1, A6 | success die → `special:{id}` | `INVALID_ALLOCATION` |
| `objective rating drops by points, clamps at 0` | A2 | rating 6, 3 criticals (2 each) | rating 0, `ObjectiveCompleted` |
| `threat rating drops by points, 0 sets Attack 0` | A3 | rating 4, points 4 | rating 0, attack 0 |
| `defend removes attack successes by points, floor 0` | A4 | 2 attack successes, 1 critical die (2 points) | 0 remaining |
| `feed adds points to blood, clamps at 10` | A5 | blood 9, 2 points | blood 10 |
| `noFeeding threat flag rejects feed when only that threat is engaged` | A5 | flag set | rejected |
| `special requires a critical and an owned special ability` | A6 | success die → special | rejected; critical die → applies typed effect once |
| `challenge negates points before rating drops (worked example)` | A7 | matrix p.38: Challenge 2, 3 successes | rating −1; Challenge 1, 4 successes → rating −3 |
| `points split across every present objective/threat` | A8 | mixed allocation across 2 threats + 1 objective | each target reduced independently |
| `allocation cannot exceed dice rolled` | A9 | 3 kept dice, 4 assigned | rejected |
| `player cannot allocate another actor's roll` | A9 | actor B submits actor A's `rollId` | `ROLE_FORBIDDEN` |

### 5.5 Injury / Downed (B03, matrix 3.6)

| Test | Matrix # | Fixed input | Expected |
|---|---|---|---|
| `1 remaining attack success rolls one injury category and marks the first open box` | I1 | fixed `faces` category die | one box ticked |
| `full category on both boxes prompts the player to choose an alternate` | I1 | category boxes both full | `injuryChoicePending`; `ChooseInjuryCategory` resolves it |
| `second box penalty tag activates once ticked` | I1 | second box ticked | typed penalty applied on next pool build |
| `3+ remaining attack successes downs the character and marks all boxes in the category` | I2 | 3 successes left | `downed: true`, rescue Objective created (rating default 3) |
| `downed character cannot BeginAction` | I2 | downed | `CHARACTER_DOWNED` |
| `completing the rescue objective clears downed` | I2 | rescue objective → 0 | `downed: false` |
| `healed-then-remarked injury reapplies the same penalty` | I5 | heal, then re-mark same box | penalty tag active again |

### 5.6 Rounds, scenes, reinforcements (B04, matrix 3.7)

| Test | Matrix # | Fixed input | Expected |
|---|---|---|---|
| `a character who already acted this round is blocked` | S5 | second `BeginAction` same round | `NOT_YOUR_TURN` |
| `EndRound resets acted-this-round` | S5 | `EndRound` | `actedThisRound: []`, `round += 1` |
| `EndRound rejected with open rolls` | S5 | one roll `awaiting_allocation` | `ROUND_HAS_OPEN_ROLLS` listing it |
| `reinforcements worked example (p. 38) reproduced with fixed d6` | S6 | fixed `faces` | matches matrix's numeric example |
| `solo/elite threats are exempt from reinforcement` | S6 | `solo: true` | rating/attack unchanged after `EndRound` |
| `simplified mode raises ratings 1–3 and removes threats at 0` | S7 | `SetSceneRules{reinforcements: "simplified"}` (GM command, `docs/ETR_SESSION_FLOW.md` §7) | no d6 roll; ratings +1..3 |
| `SetSceneRules requires a reason and is GM-only` | S7 | player submits it / empty reason | `ROLE_FORBIDDEN` / rejected |
| `primary objective completion emits SceneCompleted` | S1 | primary → 0 | scene marked complete, `NextScene` unblocked |
| `secondary objective completion does not end the scene` | S1 | secondary → 0 | scene stays active |
| `NextScene rejected with open rolls` | S8 | one open roll | `SCENE_HAS_OPEN_ROLLS` |
| `character Blood/injuries/items carry across scenes; threats reset` | S8 | two consecutive `LoadScene` | character fields unchanged; threats replaced |

### 5.7 Cross-cutting (B02–B05, matrix §6)

| Test | Slice | Fixed input | Expected |
|---|---|---|---|
| `projection isolation: GM notes, unrevealed threats never reach player/table` | every slice touching state | extend existing `projectionIsolation.property.test.ts` | property holds for every new field |
| `other players' pending declarations show only "acting", never their inputs` | B03 | two concurrent declarations | non-owning viewer sees only actor id |
| `retry with the same commandId produces identical events, no double spend` | every command | resubmit `BeginAction`/`ReviewAction`/`AllocateResults`/`EndRound`/etc. | events and state identical; no double Blood/uses/injury |
| `budget fixture: worst-case roster + scene projection stays under PROJECTION_CEILING_BYTES` | B05 | full 6-character roster, full scene | `checkProjectionBudget` passes |
| `migration: v1 record fails closed under the new manifest` | B02 | `schemaVersion: 1` record | `migrate()` returns `{ ok: false }` |

## 6. Open items carried to John (Appendix D, no blockers)

Unchanged from the matrix; B02 defaults are recorded in `templates/eat-the-reich/src/roster.ts`'s comments so they are easy to correct if John's book disagrees:

1. Item use counts default to 3 (book's loot rule, p. 39) pending confirmation from John's sheets.
2. Challenge vs. criticals defaults to "negates points" (matches the p. 38 worked example).
3. Reinforcements mode defaults to "book" for the 2026-09-17 session; "simplified" is available via the GM's `SetSceneRules` command (B04), not a room-creation field (corrected 2026-09-14 per `docs/ETR_SESSION_FLOW.md` §7 reconciliation with A02).

## 7. Contract proposals still open with Sonnet A

Per `docs/ETR_SESSION_FLOW.md` §12 (reconciled with A02) and §9, B needs the following additions to `packages/contracts/src/errors.ts`'s `STABLE_ERROR_CODES`, none of which A02 (`packages/contracts/src/session.ts`) touched: `CHARACTER_TAKEN`, `NOT_YOUR_TURN`, `CHARACTER_DOWNED`, `CHARACTER_RETIRED`, `INSUFFICIENT_BLOOD`, `ITEM_DEPLETED`, `ROUND_HAS_OPEN_ROLLS`, `SCENE_HAS_OPEN_ROLLS`. This plan's B02/B03 work proceeds with a template-local placeholder (documented at its definition site) until A merges the addition; the issue #14 comment for this task includes the formal "**Contract proposal for Sonnet A:**" request.
