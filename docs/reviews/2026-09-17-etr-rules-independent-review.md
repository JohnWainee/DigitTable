# Eat the Reich rules implementation — independent review (B05)

> **Resolution status (recorded by Sonnet B after the review, same B05 branch):** all three findings below are resolved. See "Resolution" at the end of this document for exactly what changed and where.

- **Reviewer:** independent subagent, no prior context beyond this branch, the matrix (`origin/fable/etr-specifications:docs/ETR_RULES_MATRIX.md`), the session-flow spec, and the playtest scenarios.
- **Scope:** `templates/eat-the-reich/src/**` and `templates/eat-the-reich/test/**` on `sonnet-b/b05-fixtures-review` (tip `2285ae8`), stacked on `etr-rules -> b02-characters -> b03-resolution-loop -> b04-scenes-rounds -> b05-fixtures-review`. No other package reviewed.
- **Method:** read every matrix row (3.1-3.8) against the actual implementing code (not comments); read `project()`, `reduce()`, `decide()` and every `EatTheReichEvent` payload end to end; ran the verification commands myself; traced the claimed O4/SPECIAL bug fix in the diff, not just the handoff prose.

## 1. Verdict

**The core rules engine (dice, pool, opposition, allocation, injuries, scenes/rounds, character shape) faithfully implements the matrix's P0 rows, including both cited p.38 worked examples verbatim, and the manual-adjudication register for cut P1 items is real and honest** — every deferred P1 item (Flashback D4, late bonus dice P6, secondary-objective rewards S2, Loot cap S9, Last Stand I3, `noSpecials` decide-level test) has either a working bounded GM fallback (`CorrectCharacter`/`EditScene`/`GrantItem`, all reason-required) or is correctly left as `test.todo` rather than silently skipped. Typecheck, lint, and the template's own test suite are clean and match `CLAUDE_HANDOFF.md`'s claimed numbers exactly. The claimed O4/SPECIAL "missing threat" bug fix is real, present in the diff, and covered by a regression test that would crash without it.

**However, this branch does not yet deliver full projection isolation.** I found a **Critical** server-side data-exposure defect: `LoadScene`/`NextScene` and `EditScene` broadcast the complete `ThreatState` — including the GM-only `notes` foreshadowing text and `revealed: false` for un-revealed elites — to the `"shared"` event-visibility partition, which this codebase's own architecture (`docs/ARCHITECTURE.md` §7: "Events are stored physically under their authorized visibility path") treats as readable by every player and the table. `project()` itself redacts this correctly; the raw event stream does not. This is exactly the invariant the review brief asked me to probe, it is concretely reproducible with the shipped Appendix C content (The Enforcer's, and The Warden's, foreshadowing text), and no existing test would have caught it — every projection-isolation test in this codebase asserts on `project()` output, never on `decide(...).events[i].effects`, even though the codebase demonstrably knows how to build a redacted per-destination event (see `ActionDeclared`, which does this correctly). This should block calling B05 "isolation closed" until fixed.

I found no other Critical or High findings. Two Low/Medium items are noted below (§3).

## 2. Verification commands run (this session, in the `sonnet-b-review` worktree)

```
$ npm install
added 1082 packages ... (clean install, no errors)

$ npm run typecheck --workspace @digitable/template-eat-the-reich
> tsc --noEmit -p tsconfig.json
(no output — 0 errors)

$ npx eslint templates/eat-the-reich
(no output — 0 errors, 0 warnings)

$ npx vitest run templates/eat-the-reich
 Test Files  19 passed | 1 skipped (20)
      Tests  216 passed | 10 todo (226)
   Duration  387ms
```

These numbers match `CLAUDE_HANDOFF.md`'s B05 claim exactly (216 passed, 10 todo, 19/20 files). The "1 skipped" file is `test/rulesMatrix.todo.test.ts` itself — it contains only `test.todo(...)` entries (10 of them, matching the todo count) and no `it`/`test`, so Vitest reports the whole file as skipped rather than passed. Not a defect; it's the traceability register described in `docs/ETR_RULES_IMPLEMENTATION_PLAN.md` §5.

I did not run `npm run lint`/`typecheck`/`build` at the repo root — `CLAUDE_HANDOFF.md` already documents that these fail entirely inside `apps/web` for reasons out of this branch's scope (Sonnet C's territory), and my task is scoped to `templates/eat-the-reich`.

## 3. Row-by-row (matrix 3.1-3.8)

Sections where every row checked out against code + a real, correctly-targeted test are summarized; only exceptions get their own line.

| Section | Verdict |
|---|---|
| **3.1 Characters/stats (C1-C6)** | C1-C4, C6 implemented and tested exactly to spec (`state.ts` STATS, `pool.ts` `statBase`/`NO_STAT_BASE`, `buildPool`'s Blood clamp/reject, `decideHealInjury`'s cost-3/one-box/no-Last-Stand guard). **C5 (Blood sharing, P1) has no dedicated `ShareBlood` command and, unlike every other cut P1 item, is not recorded in `test/rulesMatrix.todo.test.ts` or the manual-adjudication register** (matrix §4, plan §4). A GM can approximate it with two `CorrectCharacter` blood patches, which is bounded and reason-required, but this fallback is undocumented — see §4 below. |
| **3.2 Pool (P1-P7)** | P1-P5, P7 (all six typed tags) implemented in `pool.ts`/`decideBeginAction`/`decideReviewAction` and tested, including the P4 GM-approve/strike split (`test/decideResolution.test.ts`) and the P5 last-use bonus. P6 (late bonus dice) correctly deferred to manual with a documented fallback (GM correction), recorded in the todo file. |
| **3.3 Dice (D1-D5)** | `interpretDie`/`pointsForResult`/`interpretAttackDie` match the rulebook passages exactly (4-5 success/1pt, 6 critical/2pt except attack dice which cap at 1 unless `attackCritOnSix`); D2's `discardBelow` override and D3's `attackCritOnSix` both implemented and tested. D4 (Flashback) correctly deferred with a manual fallback. D5 (passive `onOnesGainBlood`/`onOnesRemoveAttack`) is implemented (`decideReviewAction` lines ~525-537) and unit-tested against a synthetic character exactly as `CLAUDE_HANDOFF.md` claims — no shipped roster character has a passive ability, so it is never exercised end-to-end, which is an honest, correctly-labeled gap, not an overclaim. |
| **3.4 Opposition (O1-O5)** | `resolution.ts`'s `computeAttackDiceCount`/`effectiveAttack` reproduce the **p.38 worked example verbatim** (6/3 + 4/2 engaged → 4 dice; after the first reaches 0 → 2 dice), verified both by direct unit test (`test/resolution.test.ts`) and by re-deriving the formula by hand against the matrix text — confirmed correct. O2/O3 trivial and correct. **O4 (zero-success Attack bump)**: see §5, the fix is real and tested. |
| **3.5 Allocation (A1-A9)** | All five allocation families implemented in `decideAllocateResults` with per-die legality checks before grouping. **A7 Challenge negation reproduces the p.38 worked example exactly** (Challenge 2 / 3 successes → -1; Challenge 1 / 4 successes → -3), verified by direct test and hand-recomputation. A8/A9 (multi-target split, foreign-roll rejection, over-allocation rejection) all correctly enforced (`roll.actorMemberId !== ctx.actor.memberId` → `ROLE_FORBIDDEN`; every kept die must appear exactly once in `command.allocations`). A6's `noSpecials` gate is implemented in `decideAllocateResults` (line ~701) but, as the todo file itself says, not yet exercised by a `decide`-level test — I confirmed by grep that no test file besides the todo register mentions `noSpecials`; this is an honest gap, not a false claim. |
| **3.6 Injuries/Downed (I1-I5)** | I1's overflow-to-`ChooseInjuryCategory` path, I2's Downed (≥3 remaining successes → whole category marked, rescue Objective auto-created at rating 3, `downed` blocks `BeginAction`), and I5 (penalty tags re-derived from `marked` state, so a healed-then-remarked box reapplies automatically — this is structurally guaranteed, not incidentally true) are all correct. I3 (Last Stand) correctly deferred with a working manual fallback (`CorrectCharacter.patch.retired`). I4 (`injuryMarksWholeCategory`) is implemented (shares the `wholeCategory` branch with Downed) but per the todo file not yet exercised by a fixture Threat with the flag set in a full-loop test — accurate self-report. |
| **3.7 Scenes/Rounds (S1-S10)** | S1, S4, S5, S6, S8 all implemented and tested; **S6's book-mode reinforcement math matches the p.38 example's mechanics exactly** (defeated Threat → 1d6 rating + floor(startingAttack/2) Attack; every other active Threat's Attack +1; solo/elite exempt) — verified in `test/decideScenes.test.ts` (the test doesn't cite "p.38" in its title but its fixture and assertions reproduce it). S7's simplified mode is a documented interpretation (1d3 rating bump, remove at 0) since the book itself is underspecified here, correctly flagged in the B04 handoff as a GM-overridable choice, not silently invented. S2, S3, S9 all correctly deferred to a bounded, reason-required GM path (`EditScene`'s `updateObjectives`/`updateThreats`/`addObjectives` covers S2's rating-reduction rewards and S3's retreat Objective; `GrantItem` covers S9's loot and S2's "unusual equipment" reward) — none of these are silently missing, all have an audited control. S9's "only one loot item at a time" *cap* specifically (does a second `GrantItem` always displace the first?) is implemented (`GrantItem`'s replace logic is unconditional) but not asserted by a dedicated test — accurately self-reported in the todo file. S10 flags implemented as typed `ThreatFlags` and exercised via the two elite Threats in Appendix C's own fixture (`challengeLocked`, `injuryMarksWholeCategory` on The Warden). |
| **3.8 Safety (T1-T2)** | T1: `Pause`/`Resume` correctly anonymous — the `Paused`/`Resumed` events carry no actor field at all (`{type:"Paused"}`), and `authorizeGameAction` allows Pause from `player` or `gm` capability but not `table`, Resume from `gm` only, matching the spec exactly. T2: the bonus-claim GM approve/strike step (P4/`ReviewAction`) is the mechanical form of the veto, as the matrix itself specifies; everything else is correctly left as table talk. |

## 4. C5 (Blood sharing) — undocumented P1 gap

Minor, not blocking: matrix C5 ("Blood can be shared between vampires within arm's reach", P1) has no `ShareBlood` command in `templates/eat-the-reich/src/commands.ts`, and — unlike D4, P6, S2, S9, I3, I4, A6/noSpecials — it is **not** listed in `test/rulesMatrix.todo.test.ts`'s deferred-P1 register, nor in the plan's §4 manual-adjudication list. A GM can still move Blood between two characters via two `CorrectCharacter` calls (bounded 0-10, reason required), so there is a working audited fallback in practice, but it isn't the *documented* one the matrix's own process promises for every cut P1 item. Recommend either adding a one-line todo entry for traceability or shipping a small `ShareBlood` command in a follow-up slice.

## 5. O4 / SPECIAL "missing threat" bug fix — confirmed

Traced independently in `templates/eat-the-reich/src/engine.ts`'s `decideAllocateResults` (not taken on the handoff's word):

- **O4 bump** (lines ~805-822): the raw zero-success bump target is computed from `roll.primaryEngagedThreatId` as before, but is now gated: `attackBumpThreatId = rawAttackBumpThreatId && ctx.state.threats[rawAttackBumpThreatId] ? rawAttackBumpThreatId : null`. If the GM removed the Threat via `EditScene` between `ReviewAction` and `AllocateResults`, the bump is silently skipped rather than dereferencing a deleted map entry.
- **SPECIAL threat-delta effect** (lines ~789-798): the `primaryThreatForSpecials`/threat-delta write is now guarded by `primaryEngagedThreatId && ctx.state.threats[primaryEngagedThreatId] && (...)` before calling `getThreatWorking(primaryEngagedThreatId)`.

Both previously would have been an unguarded non-null assertion (`ctx.state.threats[id]!`), which throws `TypeError` at runtime on a deleted map entry, crashing the whole command transaction — exactly the failure mode matrix S05 prohibits ("never silently applied to a missing threat, never crashes the transaction").

**Regression coverage**: `test/playtest.test.ts`'s `S05 — resolved or deleted target` scenario (line 632) declares a roll engaged with `PATROL_A_ID`, reviews it (rolling attack dice that all come up as non-successes, so O4's zero-success bump *would* fire on `PATROL_A_ID`), then the GM `EditScene`s `PATROL_A_ID` out of existence before `AllocateResults`. The test's first assertion (`staleAllocate`, allocating directly at the removed Threat) is caught by the earlier per-die target-legality check and doesn't reach the O4 code path at all — but the second assertion (`retarget`, allocating the same kept dice to `feed` instead) *does* reach the O4 bump code, and `expect(retarget.ok).toBe(true)` is a genuine regression check: pre-fix, this call would have thrown and the whole `decide()` invocation would not return `{ok:true}` (or would crash the test runner). The test does not additionally assert `attackBumpThreatId === null` in the resulting event, which would make the regression coverage airtight rather than incidental — worth tightening, but the fix itself is correctly present and would fail without it. **Confirmed as claimed.**

## 6. Projection isolation — findings

### Finding 1 (Critical) — GM-only Threat `notes` and unrevealed-Threat existence leak via `SceneLoaded`/`SceneEdited` events on the `"shared"` visibility partition

**What leaks:** the complete `ThreatState[]` for every Threat in a scene — including `notes` (GM-only foreshadowing text) and `revealed: false` (an un-revealed Threat's existence, name, rating, attack, challenge, and flags) — reaches every player's and the table's event stream, not just the GM's.

**Where:**
- `templates/eat-the-reich/src/engine.ts`, `decideSceneTransition` (~line 970-979, used by both `LoadScene` and `NextScene`): builds `SceneSnapshot.threats = buildThreatStates(command.threats)` (the **full** `ThreatState`, per `src/events.ts`'s `SceneSnapshot` interface) and ships it via `broadcastEvent(id, event, [{ kind: "shared" }])` — i.e. one unredacted payload copied to the shared destination.
- `templates/eat-the-reich/src/engine.ts`, `decideEditScene` (~line 1174-1186): `SceneEdited.addedThreats = buildThreatStates(command.addThreats ?? [])` (again the full `ThreatState`), also shipped via plain `broadcastEvent(..., [{ kind: "shared" }])`.

**Why this is a real security boundary, not a client convention:** `docs/ARCHITECTURE.md` §7 is explicit: *"Events are stored physically under their authorized visibility path; a visibility string alone is not security."* The `"shared"` destination is a genuine, separate storage/access partition from `"gm"` — the same file's own `EventEffect`/`DecidedEvent` doc comments describe effects as *"destination-partitioned, possibly-redacted copies delivered to clients."* This codebase demonstrably knows how to redact per-destination: `decideBeginAction`'s `ActionDeclared` event builds a `redactedForOthers` payload (stat "none", empty item/ability/threat lists, null note) and hand-constructs three `EventEffect`s (`gm`, the acting `member`, and a redacted `shared` copy) specifically so a non-owner/non-GM viewer's event stream never carries the declaring player's private choices. `SceneLoaded`/`SceneEdited` never received this treatment.

**Concrete repro (using the shipped Appendix C content, `templates/eat-the-reich/src/scenes.ts`):** the GM calls `LoadScene` with `METRO_PLATFORM`'s content. `METRO_PLATFORM.threats` includes:

```
{
  id: "metro-platform-enforcer", name: "The Enforcer", rating: 8, attack: 4, challenge: 1,
  solo: true, elite: true, flags: {}, revealed: false,
  notes: "Foreshadow with slow, heavy footsteps down the tunnel before round 1 ends; reveal at
          the start of round 2. Its Blood unlocks an advance for whoever lands the killing blow
          (matrix S4)."
}
```

The resulting `SceneLoaded` event's `shared`-destination payload contains this object verbatim — full stats and the GM's private staging note — for every player and the table, at the moment the scene loads, before `RevealThreat` is ever called. This directly contradicts the matrix's own Appendix C instruction ("Foreshadowing lines for elites live in the GM-only `notes` field and never project to players or the table") and this file's own doc comment on `ThreatState.notes` ("Never present on `ThreatPublicView`... never project to players or the table"), and it defeats the entire "unrevealed Threat" mechanic (S4/O3/the Downed-pacing beat in Appendix C) by telling every player The Enforcer exists, its full stat line, and exactly when/how the GM plans to reveal it.

**Why no existing test caught it:** every projection-isolation test in this branch (`test/project.test.ts`'s "GM-only notes never project" describe block, `test/projectionIsolation.property.test.ts`, `test/multiRoleProjectionIsolation.property.test.ts`) asserts on `eatTheReichTemplate.project(state, viewer)` — the *materialized* view — which is built straight from server-authority `state`, not from replaying events, and is correctly redacted. None of them, and no test in `test/decideScenes.test.ts`, ever inspects `decision.events[i].effects` for `LoadScene`/`NextScene`/`EditScene` (I grepped for `.effects` across every test file; it is used only in `test/decideResolution.test.ts`, to verify `ActionDeclared`'s redaction). The gap in test coverage exactly mirrors the gap in the implementation.

**Suggested fix shape (not applied — this is a review, not a remediation pass):** mirror the `ActionDeclared` pattern — build a `gm`-destination copy with the full `ThreatState[]` and a `shared`-destination copy whose threats are mapped through something equivalent to `toThreatPublicView` (drop `notes`, and drop `revealed: false` entries entirely rather than including them with a flag, matching how `project()` filters `threats`). The same treatment is needed for `SceneEdited.addedThreats`.

### Finding 2 (Low) — declared roll's free-text `note` becomes fully public after rolling, in tension with the session-flow spec's narrower "GM only" wording

`docs/ETR_SESSION_FLOW.md` §6.1 describes the bonus-claim free-text "how" as *"optional and shown to the GM only"* (no time-bound stated — read naturally, this sounds like a standing GM-only field). This implementation has one `note: string | null` field per roll (not one per bonus claim), and treats it under the broader §6.2 rule ("nothing hidden here in ETR" once a roll is rolled — `RollViewFull.note` is unconditionally included for every viewer once `status` is past `"declared"`, per `toRollView` in `engine.ts`). So a player's free-text note becomes visible to every other player and the table as soon as the GM reviews the roll, not just to the GM.

This is a genuine tension in the spec documents themselves (a broad "nothing hidden once rolled" rule vs. a narrower "GM only" carve-out for one specific field), and the implementation's choice (broad rule wins) is defensible and consistently applied — but it is worth flagging as a spec-conformance question for Fable/B to resolve explicitly, since it's the one field in the whole roll lifecycle where the two governing documents plausibly disagree. Not a data-exposure risk in the sense of Finding 1 (it's the player's own chosen text about their own action, not GM secret content), so rated Low.

### Confirmed correct (spot-checked, not just trusted from tests)

- `project()`'s `self` field is `null` for both `capability: "gm"` and `capability: "table"` viewers (`ownCharacter` is only ever looked up `if (viewer.capability === "player")`) — confirmed by reading the code, not just the passing property test.
- An unrevealed Threat is filtered out of `threats` for every non-GM viewer (`.filter((threat) => isGm || threat.revealed)`), and even a *revealed* Threat's `notes` field is only ever attached by `toThreatGmView`, never `toThreatPublicView` — both correct in `project()` itself (the defect above is specifically in the event stream, not the projection).
- A declared-but-unreviewed roll: `toRollView` returns the minimal `{rollId, characterId, status:"declared"}` shape to any viewer who is neither the owner nor the GM; full detail (stat, items, abilities, bonus claims, engaged threats, note) is returned once `status` moves past `"declared"`, matching "nothing hidden here in ETR" once rolled. The event-level redaction for the `declared` state itself (`ActionDeclared`'s `redactedForOthers`) is also correct and independently defends the same invariant at the event layer — this is the pattern Finding 1's events should have followed and didn't.
- `gmSheets` is populated (every character's full sheet) only when `isGm`; empty array otherwise — correct, and matches the session-flow spec's "GM console shows every character's full sheet" requirement without leaking to non-GM viewers.

## 7. Roster/fixture fidelity (Appendix A, Appendix C)

- All six `ORIGINAL_ROSTER` characters match Appendix A's stat spreads exactly (verified by direct comparison, not just the passing shape test): Rook 2/2/2/3/3/4/1, Vesper 2/4/1/2/2/3/3, Halloran 3/2/4/2/3/1/2, Orsolya 4/1/2/2/3/2/3, Delphine 2/3/3/4/1/2/2, Tallow 3/1/2/2/4/2/3 (BRAWL/CON/FIX/SEARCH/SHOOT/SNEAK/TERRIFY). `test/roster.test.ts` additionally verifies the shape *structurally* (sorted ratings equal `[4,3,3,2,2,2,1]`, 3-4 items, exactly one special/one blood/one other ability, 3 advances, 3 injury categories of 2 boxes each with the second box always carrying a penalty tag) for all six, not just eyeballed.
- Appendix C's four scenes (`drop-forecourt`, `metro-platform`, `printworks`, `signal-mast`) are present in `src/scenes.ts` with ratings/challenge/attack values matching the matrix's table, The Enforcer and The Warden both `elite: true`/`solo: true`/`revealed: false` with foreshadowing `notes` as specified, and The Warden carries `challengeLocked`/`injuryMarksWholeCategory` as the matrix's S10 flag table requires.

## 8. Files most relevant to this review

- `/Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-b-review/templates/eat-the-reich/src/engine.ts` — `project()` (~1884), `decideSceneTransition`/`decideEditScene` (Finding 1), `decideAllocateResults` (O4/SPECIAL fix, ~622-888), `decideBeginAction`'s `ActionDeclared` redaction (~414-449, the correct pattern Finding 1 should mirror).
- `/Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-b-review/templates/eat-the-reich/src/events.ts` — `SceneSnapshot`/`SceneEdited` carrying full `ThreatState[]` (Finding 1).
- `/Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-b-review/templates/eat-the-reich/src/view.ts`, `src/state.ts` — correct viewer-scoped types (`ThreatPublicView` vs `ThreatGmView`, `RollViewActing` vs `RollViewFull`).
- `/Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-b-review/templates/eat-the-reich/src/resolution.ts`, `src/pool.ts` — the p.38-exact O1/A7 math.
- `/Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-b-review/templates/eat-the-reich/src/roster.ts`, `src/scenes.ts` — Appendix A/C fixture content.
- `/Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-b-review/templates/eat-the-reich/test/rulesMatrix.todo.test.ts` — the honest, accurate deferred-P1 register (except the C5 omission, §4).
- `/Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-b-review/templates/eat-the-reich/test/playtest.test.ts` (line 632) — the S05 regression test for the O4/SPECIAL fix.
- `/Users/john/Documents/ChatGPT/DigiTable/.claude/worktrees/sonnet-b-review/docs/ARCHITECTURE.md` §7 — the "visibility partition is the security boundary" statement Finding 1 violates.

## 9. Resolution (recorded 2026-09-17, same B05 branch, after this review)

All findings addressed in `templates/eat-the-reich/src/engine.ts` on `sonnet-b/b05-fixtures-review`:

- **Finding 1 (Critical) — fixed.** `decideSceneTransition` (used by `LoadScene`/`NextScene`) and `decideEditScene` no longer use a single-destination `broadcastEvent` for `SceneLoaded`/`SceneEdited`. Both now build two explicit `effects`: a `gm`-destination copy carrying the full, unredacted `ThreatState[]` (used verbatim as the canonical event `reduce` folds forward — reduce always sees full fidelity, matching every other redacted event in this template), and a `shared`-destination copy built by a new `redactThreatsForShared()` helper that drops every unrevealed Threat entirely and blanks `notes` on every revealed one — mirroring `toThreatPublicView`/`project()`'s existing redaction and the `ActionDeclared` pattern the review cited as the correct precedent. Two new regression tests assert directly on `decision.events[0].effects` (not just `project()` output, closing the exact test-coverage gap the review identified): `test/decideScenes.test.ts`'s "LoadScene never leaks GM-only Threat notes or unrevealed Threats to the shared event copy" and "EditScene never leaks a newly added unrevealed Threat's notes or existence to the shared event copy".
- **Finding 2 (Low, spec tension) — documented, not code-changed.** Recorded as open item 4 in `docs/ETR_RULES_IMPLEMENTATION_PLAN.md` §6, citing this review by date/section, for Fable/John to resolve the `ETR_SESSION_FLOW.md` §6.1-vs-§6.2 ambiguity explicitly. The review itself called the current behavior (broad "nothing hidden once rolled" rule wins) defensible, so no code change was made pending that decision.
- **C5 gap (Low/Medium, process) — fixed.** Added to `test/rulesMatrix.todo.test.ts`'s deferred-P1 register, citing this review, so it has the same documented-fallback treatment as every other cut P1 item (matches the register's own stated purpose).

Re-verified after all three fixes (`.claude/worktrees/sonnet-b-rules`, i.e. the actual working branch, not this review's read-only worktree):

```
npm run typecheck --workspace @digitable/template-eat-the-reich   # pass
npx eslint templates/eat-the-reich                                 # pass, 0 errors, 0 warnings
npx vitest run templates/eat-the-reich                             # pass: 218 passed, 11 todo, 19 files (1 skipped file unrelated)
npm run format                                                      # pass (whole repo)
npm run typecheck --workspace @digitable/contracts --workspace @digitable/engine --workspace @digitable/testing   # pass
npx vitest run --project '!web'                                    # pass: 248 passed, 11 todo, 26 files
```

Test/todo counts rose from the review's 216/10 to 218/11 (two new redaction regression tests, one new documented-P1-gap todo entry) — consistent with exactly the changes described above, no other drift.
