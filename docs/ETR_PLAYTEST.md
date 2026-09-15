# Eat the Reich adversarial playtest scenarios (F04)

- **Status:** Fable deliverable for issue #14 task F04. Draft written against `docs/ETR_RULES_MATRIX.md` (F01) and `docs/ETR_SESSION_FLOW.md` (F02) before A02 contracts and B02/B03 code landed; command names, error codes, and fixture ids follow those two documents and must be re-checked against A02/B's published contracts (marked ⚠ where a name may change). Rules expectations are page-cited to the matrix rows (e.g. "F01 A7") and do not depend on the implementation.
- **How to use:** each scenario is executable two ways. **Engine-level:** as a fixed-seed test in `templates/eat-the-reich/test` or `apps/functions/test-emulator` (B05/A07 own adding them). **Session-level:** as a facilitated script for F05 with three devices (GM desktop, two phones) plus the table display. Every scenario separates **Rules** (what the authority must compute) from **Readability** (what each surface must make obvious). A rules failure is P0; a readability failure is P1 unless it hides a rules outcome, which makes it P0.
- **Fixed seeds:** "seed S1" etc. are symbolic. B05 binds each to a concrete seed whose faces equal the listed faces; the test asserts the faces, so a generator change surfaces as a test edit, not a silent drift.

## Fixture baseline (all scenarios start here unless stated)

- Room created by GM "Mara" (F02 §3), reinforcements mode `book`.
- Players: "Sam" on phone A claims `rook` (SNEAK 4, SHOOT 3, SEARCH 3; items: forged papers 3/3, silenced pistol 3/3, rooftop line 3/3, pocket mirror 1/1); "Jo" on phone B claims `tallow` (SHOOT 4, BRAWL 3, TERRIFY 3; items: belt-fed gun 3/3, grenade bag 3/3, spade 3/3).
- Table display admitted with the table code.
- Scene 0 `drop-forecourt` loaded: Objective "Get clear of the wreckage" rating 8, challenge 0; Threats: Station Patrol A (4/2/0), Station Patrol B (4/2/0), both revealed. Round 1. Blood 0 for everyone (F01 C4).

---

## S01 — Zero successes

**Rules (F01 D1, O1, O4, O5, I1).**

- *Given* Sam declares SNEAK (4) with no items, engaged with Patrol A only; GM approves; seed S1 gives player faces [3,2,1,3] and Attack faces (2 dice: max(2) + 1 extra threat in play = 3 dice → [4,1,5]).
- *Then* kept dice = 0; the allocation step has nothing to assign and `AllocateResults` with an empty list is **accepted** (F02 §6.3: "every kept die must be allocated" is vacuous).
- *Then* Attack successes = 2 → one injury: the server rolls the category die from the same seed (say 4 → category 2), marks Rook's first box in category 2, no penalty yet.
- *Then* because the GM rolled ≥1 success, no zero-success Attack bump (O4 applies only when the GM rolled none).
- *And* Sam is marked as having acted this round.

**Readability.** Phone A shows "No dice kept" and a clear "Confirm — take the hit" primary button, then the injury name and "no penalty yet" on confirm. The GM console shows the same injury on Rook's sheet. The table shows Rook's injury pip filled. Nothing shows "0 successes to allocate" with a disabled button and no way forward.

**Variant S01b — GM rolls zero successes.** Seed S1b: player [5,4,2], Attack [1,2,3]. *Then* no injury, and Patrol A's Attack becomes 3 after resolution (F01 O4); the table shows "Patrol A: Attack 3" and the event log line "the patrol closes in".

## S02 — Resource depletion

**Rules (F01 P2, P3, P5, C4, A5).**

- *Given* Jo has Blood 1 and belt-fed gun 1/3 uses left.
- *When* Jo declares SHOOT with belt-fed gun and the ability "Sustained fire" (blood:1) and claims "+ enemies in cover"; GM approves; seed S2.
- *Then* at review time the server charges 1 Blood (→ 0) and 1 use (→ 0), and adds **one extra die** for the last use (F01 P5); pool = 4 + 1 (item) + 1 (ability) + 1 (bonus) + 1 (last use) = 8.
- *When* Jo tries to declare next round with belt-fed gun again → rejected `ITEM_DEPLETED` ⚠; with the blood ability → rejected `INSUFFICIENT_BLOOD` ⚠; the compose UI never offered either (they were disabled with the reason).
- *When* the GM retries `ReviewAction` with the same commandId (simulated double-tap) → identical event, Blood still 0, uses still 0, no second die roll (receipt short-circuit).
- *When* Jo feeds two successes at Blood 9 → Blood 10, not 11 (clamp).

**Readability.** Compose lists "belt-fed gun 1/3 — last use adds a die"; after the roll the "Why?" disclosure shows the last-use line. Depleted items read "no uses left" and are visibly disabled, not hidden.

## S03 — Invalid allocation

**Rules (F01 A1, A6, A7, A9).** Seed S3: Sam's kept dice [6,5,4] (one critical, two successes); Attack successes 1; Objective challenge 0; Patrol A rating 4.

Each of these must be rejected by the authority with `INVALID_ALLOCATION` **and** must be unofferable in the UI:

1. Assign the 4 (success) to a SPECIAL → rejected; UI shows SPECIAL rows accepting only critical chips.
2. Assign die index 0 twice → rejected.
3. Leave the 5 unassigned and confirm → rejected; UI keeps Confirm disabled with "1 die unassigned".
4. Assign to Patrol B after Patrol B was beaten to 0 in this same allocation by an earlier die (valid: the first die that takes it to 0 counts; the second is a wasted point — **allowed**, rating clamps at 0, F01 A2/A3 "clamps"). Readability: the UI warns "Patrol B is already at 0" but permits it.
5. Assign the critical to the Objective when the Objective has challenge 1 → rating −1 (2 points − 1 challenge), not −2 (F01 A7 default = points).
6. Jo submits `AllocateResults` for Sam's roll → `ROLE_FORBIDDEN`; the GM submits it → `ROLE_FORBIDDEN`.

**Readability.** After a rejection the panel re-derives from the fresh projection and keeps the player's partial assignments where still legal (F02 §2 `stale-input`).

## S04 — Simultaneous character claim

**Rules (F01 C2; F02 §4.3).**

- *Given* both phones on the claim screen at the same `roomRevision` R.
- *When* both tap "Claim Rook" within the same second → two `ClaimCharacter{characterId: rook, expectedRevision: R}` commands.
- *Then* exactly one is accepted; the other receives `REVISION_CONFLICT` or `CHARACTER_TAKEN` ⚠, authority has one binding for `rook`, and both projections agree within one update.
- *When* the loser retries with a **new** commandId at the fresh revision for Rook → `CHARACTER_TAKEN`; for Tallow → accepted.
- *When* the winner retries the original commandId (network retry) → same accepted receipt, no second binding.

**Readability.** The loser's card flips to "claimed by Sam" and an alert names the character; the winner sees "Rook is yours". The GM roster panel shows two bindings, never three.

## S05 — Resolved or deleted target

**Rules (F01 A8, S1, S4; F02 §7 EditScene).**

- *Given* Sam is at the allocation step with Patrol A as a legal target.
- *When* the GM, in parallel, edits the scene to remove Patrol A (reason "narrated away") **before** Sam confirms.
- *Then* Sam's `AllocateResults` naming Patrol A is rejected with `REVISION_CONFLICT` (the allocation is revision-gated) or `INVALID_ALLOCATION` ⚠ — never silently applied to a missing threat, never crashes the transaction. Sam's panel re-derives without Patrol A.
- *When* the primary Objective reaches 0 from Jo's allocation while Sam's roll is open → Sam's roll stays open; Objective disappears from Sam's legal targets; scene shows "Objective complete — the GM will move on when rolls resolve" (F02 §7 `SCENE_HAS_OPEN_ROLLS`).
- *When* the GM voids Sam's open roll with reason → Blood/uses charged at review are refunded exactly once; a retry of `VoidRoll` refunds nothing more.

**Readability.** The GM's correction reason appears on Sam's phone ("The GM adjusted the scene: narrated away") and on the table as "The GM adjusted the scene" (no reason text on the table unless the GM marks it public — default private to players ⚠ confirm with A02).

## S06 — Disconnect mid-roll

**Rules (docs/ARCHITECTURE.md "Reconnect and idempotency"; F02 §2, §8; A06).**

1. **Disconnect after declare, before review.** Sam declares, phone A goes offline. GM reviews and rolls. Phone A reconnects → sees the rolled dice and the allocation step; no re-declaration is offered.
2. **Disconnect after Confirm, before the response.** Sam taps Confirm; the request reaches the server; the response is lost. On reconnect the outbox entry is `unknown` → receipt query → `accepted` → the resolved summary renders; the client never sends a second `AllocateResults` with a new commandId. Authority shows one `ActionResolved` for that roll.
3. **Reload during allocation.** Sam has assigned two of three dice and reloads the page. The projection has no allocation draft (drafts are local-only); the panel restarts with zero assignments (acceptable) **or** restores the local draft (better); either way the dice and targets are identical and confirming still produces one resolution.
4. **GM disconnects with a pending review.** Players see "Waiting for the GM to reconnect"; nothing auto-resolves; on GM reconnect the pending card is still there.
5. **Identity loss.** Phone B clears site data. Jo opens the join screen, enters code + passphrase → `admitMember` returns a **new** seat (recoveryCode non-null) — this is a *different* member without Tallow. Jo instead uses "Recover my seat" with the recovery code → rebinds the original seat; Tallow's Blood/injuries/items are unchanged; the old identity can no longer read the member projection.

**Readability.** The status strip shows `reconnecting` then `live`; the "Checking whether your last action went through…" line appears at most once; no duplicate live-region announcements.

## S07 — Late join

**Rules (F02 §4.3; ARCHITECTURE "Late join receives a current-state projection").**

- *Given* Scene 1 is active, round 2, Sam has acted this round, Patrol A beaten, The Enforcer revealed after round 1.
- *When* a third phone joins with code + passphrase and claims `halloran`.
- *Then* its first projection shows the current scene, round 2, the Enforcer (revealed) but not its GM `notes`, Rook/Tallow public state (Blood, injury pips, downed flag), no other member's private fields, and Halloran can declare immediately (not in `actedThisRound`).
- *And* the projection was produced from authority, not by replaying events (verify: the late joiner's event tail may be empty; the projection is complete anyway).

**Readability.** The late joiner is not shown the briefing of scene 0; the scene card says "Scene 1 of 4 — Métro platform — Round 2".

## S08 — GM correction

**Rules (F02 §7 CorrectCharacter, bounded; F01 §4).**

- *When* the GM sets Rook's Blood to 12 → rejected `INVALID_REQUEST` ⚠ (bound 0–10). Sets to 4 with reason "missed a feed" → accepted; Sam's phone shows "The GM corrected Blood: missed a feed"; a retry with the same commandId does not apply twice.
- *When* the GM clears Rook's category-2 box with reason → accepted; penalty tag deactivates.
- *When* the GM marks Tallow `downed: false` while a rescue objective exists → accepted and the rescue objective is closed as "resolved by GM" (F01 I2) ⚠ confirm B04's chosen behaviour.
- *When* the GM submits a correction with an empty reason → rejected; the dialog blocks submit until a reason is typed.
- *When* a player submits `CorrectCharacter` → `ROLE_FORBIDDEN`.

**Readability.** Corrections appear in the GM log with reason; players see field + reason; the table shows only the changed public value.

## S09 — Consecutive scenes

**Rules (F01 S1, S5, S6, S8; F02 §5, §7).**

- *Given* Scene 0's Objective is at 1 with Patrol A at 0 and Patrol B at 3, round 2, both players have acted.
- *When* the GM ends the round → seed S9: Patrol A regains d6 (say 3) rating and Attack ⌊2/2⌋ = 1; Patrol B Attack 2 → 3; round 3; `actedThisRound` cleared.
- *When* Sam reduces the Objective to 0 → `ObjectiveCompleted{byCharacter: rook}`; the scene is `completed`; declaring is blocked with "Scene complete — waiting for the GM".
- *When* the GM loads Scene 1 → round resets to 1; Objective "Cut through the tunnels" 8; Plated Squad revealed; The Enforcer unrevealed (absent from player/table projections, present in GM's); **Rook and Tallow keep** Blood, injuries, item uses, and advances from Scene 0; Patrol A/B are gone.
- *When* the GM tries `NextScene` while Jo's roll is open → rejected `SCENE_HAS_OPEN_ROLLS` ⚠ listing the roll; after `VoidRoll` it succeeds.

**Readability.** The table route map moves the current node from 0 to 1 and stamps 0 "CLEARED"; the phone scene card changes title and art; the party strip is unchanged.

## S10 — Ending

**Rules (F01 S8; F02 §7 EndMission).**

- *Given* Scene 3 `signal-mast`, The Warden (elite, 10/5/1, `challengeLocked`) at rating 2, Objective "Silence the Voice" at 1.
- *When* Jo assigns a critical to the Warden → rating 0 (2 − 1 challenge), status `removed` (elite), GM prompt "grant an advance to Tallow?" (F01 S4).
- *When* Sam assigns a success to the Objective → 0 → scene complete; `EndMission` becomes available to the GM.
- *When* the GM ends the mission → `MissionEnded`; every player sees an epilogue prompt (free text is local/optional — no new persistence is required); the room stays readable; no further declarations are accepted (`ROOM_ARCHIVED` or a `mission_ended` status ⚠ per A02); the table shows the ending card with the party strip.
- *When* the GM tries `EndMission` before the final Objective is 0 without a reason → rejected; with reason → accepted (house rule, F01 §4 item 7).

**Readability.** The last resolution's narration cue ("Sam narrates the Voice going silent", F01 A2 "player who removed the last point narrates") is shown on all surfaces.

---

## Cross-cutting checks run in every scenario

- **Projection isolation:** after every accepted command, the table projection contains no `notes`, no unrevealed threats, no bonus-claim text, no codes; each player's projection contains only their own `self`; the GM projection contains everything. (Property test already exists for the placeholder; B extends it.)
- **Retry stability:** every command in every scenario is replayed once with the same commandId and must produce byte-identical events and no additional state change.
- **Budgets:** authority and each projection stay under the documented ceilings with six characters, two scenes' worth of resolved rolls, and the full roster loaded.
- **Announcements:** each transition produces exactly one polite live-region message; safety Pause is the only assertive one.
- **No secrets anywhere:** grep the rendered DOM, page titles, URLs, projections, and Functions logs for the passphrase, table code, and recovery codes used in the session — zero hits.

## Facilitated-session script for F05 (30 minutes, three devices)

1. GM creates the session (S-create), records the four secrets, opens the console.
2. Phone A and phone B join; both try to claim Rook at once (S04); the loser claims Tallow.
3. Table joins with the table code; confirm it shows no controls.
4. GM loads Scene 0; Sam runs S01 (zero successes); Jo runs S02 (depletion path, feed to test Blood).
5. Sam runs S03 with deliberate invalid attempts; confirm each is unofferable and the server rejects the crafted one (use the fixture-mode console or a test to submit the crafted payload).
6. GM removes a threat under an open roll (S05); voids the roll; verifies refund.
7. Airplane-mode phone A after Confirm (S06.2); reconnect; verify single resolution.
8. Third device (or a fresh browser profile) joins late (S07).
9. GM corrects Blood with reason, tries 12 (S08).
10. End round, finish Scene 0, load Scene 1 (S09); confirm carry-over.
11. Jump to Scene 3 via the director for time (GM reason "rehearsal skip"); finish the Warden and the Objective; end the mission (S10).
12. Pause from a phone; confirm the table shows "Paused" without a name; GM resumes.

Record device, browser, commit, and pass/fail per step in `docs/reviews/2026-09-17-etr-session-rehearsal.md` (F05 owns the file).
