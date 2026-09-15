# F05 review: integrated candidate walkthrough (fixture mode)

- **Reviewer:** Fable (issue #14, task F05, second pass). Independent of every author.
- **Candidate:** `sonnet-c/c06-integration` @ `46a0a62` **plus** `origin/sonnet-b/b05-fixtures-review` @ `29067ec` merged locally (the same merge Sonnet C then pushed as `25b9dec`), built with `vite build`, served with `vite preview` on port 4173, driven in the Claude desktop browser pane at 375×812. Contains Sonnet A branches a02–a06 (not a07) and Sonnet B branches through B05 including the leak fix `28f82a2`.
- **Mode:** **fixture mode** (no Firebase config): the real `eatTheReichTemplate` running through `InMemoryRoomRepository` inside one browser tab. **Not** the emulator-backed live path, **not** three physical devices. Sonnet A reports the live path is blocked by two `apps/functions` gaps (an unmapped stable error code in `httpsErrors.ts`; `createRoom` failing through the client SDK against the emulator) and is fixing them. Scenarios S06 (disconnect/reconnect) and S07 (late join over the network) therefore remain **unverified**.
- **Tooling caveat:** the browser pane's synthetic clicks did not reach React's handlers in this session (the create form ignored click and Enter, the checkbox stayed unchecked), while DOM-level `element.click()`/`requestSubmit()` worked. The walkthrough was therefore driven by DOM events and the resulting page text/DOM was read after each step. This is a limitation of the review harness, not an app finding; Sonnet C's own captures used real DOM events through Chrome DevTools and showed the same screens. Seat switching between GM, players, and table in one tab was done by saving and swapping the tab's stored seat record, which stands in for separate devices.
- **Preceded by:** `docs/reviews/2026-09-15-etr-f05-screen-prereview.md` (all six items there are now closed in the candidate: SPECIAL target, all present targets, injury name/penalty, initials, highest-stat default, real scene switching).

## Verdict

**Rules loop: PASS in fixture mode** for everything exercised (declare → GM review → single roll → allocate → resolve, Challenge absorption, Defend, Feed, injury and Downed with auto-rescue objective, scene advance with carry-over, unrevealed elite, reveal, one-seat authorization, secrets kept out of the DOM).

**Session-ready: NOT YET.** Three P0 gaps in the GM console would deadlock or break a real session, and the live/multi-device path is unverified:

| # | Severity | Finding | Evidence | Owner |
|---|---|---|---|---|
| R1 | **P0** | **No End round control.** The GM console wires only `LoadScene`, `NextScene`, `RevealThreat`, `ReviewAction`, `CorrectCharacter`. Once every character has acted, the engine rejects further declarations with `NOT_YOUR_TURN` ("You've acted this round", verified), and without `EndRound` the only way forward is advancing the scene. Reinforcements (F01 S6) never run. | `apps/web/src/gm2/GmDirectorScreen.tsx` command list; second declaration by Tallow rejected. | C (UI); template already implements `EndRound` |
| R2 | **P0** | **No Pause/Resume and no End mission control.** Board acceptance requires anonymous pause/resume and a mission ending; the template has `Pause`/`Resume`/`EndMission`, the console exposes none. | same | C |
| R3 | **P0** | **GM sees no Objective/Threat ratings.** The scene director shows the scene name, round, unrevealed threats, and the advance form; it never lists objectives or threats with rating/attack/challenge/notes. The GM cannot run a scene from this screen without a second device showing the table. | GM console text after loading scene 0 and scene 1. | C |
| R4 | P1 | Compose does not pre-disable "Declare action" after the character has acted; the engine's rejection surfaces as an alert only after the tap. Spec §6.1 asks for the control to be disabled with the reason. | Tallow, round 1, scene 1. | C |
| R5 | P1 | Correction dialog covers Blood only. Spec §7 requires bounded correction of item uses, injury boxes, downed/retired, active loot with a reason (the template's `CorrectCharacter` supports them). A downed character therefore cannot be un-downed except via the rescue objective. | `CorrectionDialog.tsx` ("first cut covers Blood only"). | C |
| R6 | P1 | Edit scene, Set scene rules (reinforcement mode), Void roll, Grant item, Unlock advance, Reassign character have no console UI. The engine supports them; GM has no bounded correction path for a stuck roll or a scene edit. | command list | C |
| R7 | P1 | Resolved summary is empty when every die went to Defend ("Your turn is done this round" only); it should state attack successes removed and "no injury". | Tallow's resolution. | C |
| R8 | P1 | After "I'm ready — continue", the secrets card stays on screen beneath the invite panel until the GM navigates away. Spec §3: shown once, then gone. | create flow | C |
| R9 | P2 | Scene 0 and scene 1 render the location name and description as the same string, so the title appears twice on every surface. | fixture content | B (fixture) / C (render only once when equal) |
| R10 | P2 | Passphrase field on create/join is `type="text"`; acceptable for a table-side reveal, but consider `autocomplete="off"` and a show/hide toggle. | create form | C |
| R11 | Unverified | S06 disconnect/reconnect, S07 late join over the network, retry idempotency through the callable path, three-device rehearsal, staging deploy. | fixture mode cannot exercise them | A (functions fixes) then joint rehearsal |

## Scenario results (docs/ETR_PLAYTEST.md)

| Scenario | Rules | Readability | Notes |
|---|---|---|---|
| Create session (§3) | pass | pass (R8) | Codes shown once; idempotent `requestId` in session storage; passphrase hint pattern on invite panel. |
| S04 simultaneous claim | pass (single-tab: second claim disabled after first; engine `CHARACTER_TAKEN` covered by C01 tests) | pass | Monogram initials fixed (`GT`). Six original portraits present. |
| S01 zero successes | not reproduced (dice fell 4,5,5 / 4,5,6,6 / 6,2,1,3) | — | Covered by B05 fixed-seed tests; not observed live. |
| S02 depletion | partial | pass | Item use decremented on review; Blood-cost ability correctly disabled at Blood 0; last-use bonus not reached. |
| S03 invalid allocation | pass (UI) | pass | Every kept die must have a target; SPECIAL row appears only with a critical ("Suppressing Fire" offered for Tallow's 6); success dice cannot target SPECIAL. Crafted-payload rejection covered by B tests. |
| Resolution arithmetic | **pass** | pass | Rook: 4,5,5 → 1 Objective (8→7), 1 Defend (2→1 attack successes), 1 Feed (Blood 0→1), 1 injury "Papers Burned" box 1. Rook scene 1: 4,5,6,6 = 6 points on Plated Squad (Challenge 1) → 6→1; 3 attack successes unblocked → Downed, category fully marked, box-2 penalty text shown, "Rescue Rook — rating 3" added. Attack dice = engaged Attack + 1 per extra threat in play (2+1 → 3 dice; 3+1 → 4 dice). |
| S05 resolved/deleted target | not testable (R6: no Edit scene UI) | — | |
| S06 disconnect mid-roll | **unverified** (R11) | — | |
| S07 late join | partial | pass | Second player (Jo/Tallow) joined mid-scene and saw current scene, round, revealed threats, Rook downed; network late-join unverified. |
| S08 GM correction | partial | pass | Reason required (Apply disabled until typed); Blood delta only (R5). |
| S09 consecutive scenes | pass | pass | Advance with required reason; Blood 1/10 and injuries carried; new scene round 1; Enforcer hidden from players until Reveal, visible to GM as "hidden from players". |
| S10 ending | not testable (R2) | — | |
| Table display | pass | pass | Zero controls; passphrase, table code, and GM recovery code absent from the DOM; route map with CLEARED stamp. |
| Seat authorization | pass | pass | Opening `/gm` with a player seat → "You can't do that from this seat." |

## Re-review after c07 (2026-09-15, later)

Candidate: the same build plus `origin/sonnet-c/c07-gm-controls` @ `7ea4033` (PR #35, stacked on #33). Re-run in fixture mode with the same harness: create → load scene → join → claim → declare → GM roll → allocate (Defend) → end round → declare again → pause → table → resume → end mission.

| # | Status | Evidence |
|---|---|---|
| R1 End round | **resolved** | "End round 1" present; after it the console reads round 2, Station Patrol A's attack rose 2 → 3 (F01 S6 "+1 Attack to each active Threat"; no rating regain since none was at 0), and the player's Declare re-enabled. |
| R2 Pause/Resume/End mission | **resolved** | Player "Pause" → player "Paused.", GM "Session paused." with Resume, table "Paused" with 0 controls, no actor named; Resume restores; "End mission" present and gated (disabled until the final objective completes or a reason is given). |
| R3 GM ratings | **resolved** | Scene director lists "Objectives … (primary) — rating 8, challenge 0 — active" and every threat with rating, attack, challenge, active/revealed state. |
| R4 pre-disable Declare | resolved | After acting: Declare disabled with "You've acted this round. Wait for the GM to end the round." |
| R5 correction beyond Blood | resolved per author; not re-driven | Dialog now covers item uses, injury boxes, downed, retired. |
| R6 remaining GM tools | resolved (minimal) | Buttons present: Switch to simplified (SetSceneRules), Grant item, Unlock advance, Reassign; EditScene/VoidRoll per author. |
| R7 Defend-only line | resolved | "Defended: Removed 1 attack success, no injury." |
| R8 secrets card | resolved | Card gone after "I'm ready". |
| R9 duplicate title | partially | Scene card still shows the short title twice on the player screen before the description. P2. |
| new P2 | — | The player's "Pause" button stays enabled while already paused; harmless (engine rejects), but disable it. |

**Fixture-mode verdict: session-runnable.** The live (emulator/staging) path and the three-device rehearsal remain the open gate (R11), owned by Sonnet A's `sonnet-a/a08-integration-fixes`.

## Required before the 2026-09-17 session

1. C: R1–R3 (End round, Pause/Resume, End mission, GM ratings/notes panel), then R4–R8 as time allows. These are UI wiring over commands the template already implements and tests.
2. A: the two `apps/functions` gaps, then an emulator-backed run of this same walkthrough (create → join ×2 → claim → declare → review → allocate → advance) and S06/S07.
3. Joint: three-device rehearsal per the F04 script; record in `docs/reviews/2026-09-17-etr-session-rehearsal.md`.

Nothing here approves an unseen screen or an unrun test. The rules loop is sound; the director console is not yet complete enough to run a session without deadlocking at the end of round 1.
