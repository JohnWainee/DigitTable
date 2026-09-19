import { asCommandId, checkAuthorityBudget, checkProjectionBudget } from "@digitable/contracts";
import { createSeededRandom, projectViewer, runCommand } from "@digitable/engine";
import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import { ORIGINAL_MISSION } from "../src/scenes.js";
import type { EatTheReichState } from "../src/state.js";
import {
  FixedSequenceRandom,
  GM_CTX,
  GM_VIEWER,
  PLAYER_CTX,
  PLAYER_MEMBER_ID,
  PLAYER_VIEWER,
  ROOK_ID,
  SECOND_PLAYER_CTX,
  SECOND_PLAYER_VIEWER,
  TABLE_VIEWER,
  VESPER_ID,
  freshAuthority,
} from "./fixtures.js";

/**
 * B05: `docs/ETR_PLAYTEST.md`'s adversarial scenarios (F04), bound as
 * fixed-seed engine-level tests against the real shipped `ORIGINAL_MISSION`
 * content (not synthetic fixtures) — "where cheap" per the coordinator's
 * direction. Scenarios that need live client/reconnect infrastructure
 * (S06 disconnect mid-roll; S07's specific "the late joiner's event tail
 * may be empty" proof needs a real event store) are out of template scope
 * and are Sonnet A's A05/A06/A07 territory, not implemented here.
 */

const DROP_FORECOURT = ORIGINAL_MISSION[0]!;
const OBJECTIVE_ID = DROP_FORECOURT.objectives[0]!.id;
const PATROL_A_ID = DROP_FORECOURT.threats[0]!.id;
const PATROL_B_ID = DROP_FORECOURT.threats[1]!.id;

function loadDropForecourt(
  authority: ReturnType<typeof freshAuthority>,
): ReturnType<typeof freshAuthority> {
  const result = runCommand(eatTheReichTemplate, {
    member: GM_CTX,
    authority,
    random: new FixedSequenceRandom([]),
    command: { type: "LoadScene", ...DROP_FORECOURT },
    commandId: asCommandId("cmd-load-drop-forecourt"),
    occurredAtServer: "2026-09-17T00:00:00.000Z",
  });
  if (!result.ok) throw new Error(`LoadScene failed: ${result.code} ${result.message}`);
  return result.authority;
}

function claim(
  authority: ReturnType<typeof freshAuthority>,
  member: typeof PLAYER_CTX,
  characterId: string,
  seedTag: string,
): ReturnType<typeof freshAuthority> {
  const result = runCommand(eatTheReichTemplate, {
    member,
    authority,
    random: createSeededRandom(`claim-${seedTag}`),
    command: { type: "ClaimCharacter", characterId },
    commandId: asCommandId(`cmd-claim-${seedTag}`),
    occurredAtServer: "2026-09-17T00:00:01.000Z",
  });
  if (!result.ok) throw new Error(`ClaimCharacter failed: ${result.code} ${result.message}`);
  return result.authority;
}

describe("S01 — zero successes (matrix D1, O1, O4, O5, I1)", () => {
  it("no dice kept still resolves cleanly; the GM's successes cause exactly one injury", () => {
    let authority = loadDropForecourt(freshAuthority());
    authority = claim(authority, PLAYER_CTX, ROOK_ID, "s01");

    const begin = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: new FixedSequenceRandom([]),
      command: {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "CON",
        itemIds: [],
        abilityIds: [],
        bonusClaimIds: [],
        engagedThreatIds: [PATROL_A_ID],
        note: null,
      },
      commandId: asCommandId("cmd-s01-begin"),
      occurredAtServer: "2026-09-17T00:00:02.000Z",
    });
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    authority = begin.authority;
    const rollId = Object.keys(authority.state.rolls)[0]!;

    // CON(4) player dice, all discard; 2 active threats in play -> attack dice = 2 + (2-1) = 3, two successes.
    const review = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority,
      random: new FixedSequenceRandom([1, 2, 3, 1, 4, 1, 5]),
      command: {
        type: "ReviewAction",
        rollId,
        approvedClaimIds: [],
        engagedThreatIds: [PATROL_A_ID],
      },
      commandId: asCommandId("cmd-s01-review"),
      occurredAtServer: "2026-09-17T00:00:03.000Z",
    });
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    authority = review.authority;
    expect(authority.state.rolls[rollId]?.keptDice).toEqual([]);
    expect(authority.state.rolls[rollId]?.attackSuccessesRolled).toBe(2);

    // Empty allocation is accepted: there is nothing to assign.
    const allocate = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: new FixedSequenceRandom([3]), // category die: face 3 -> category index 1
      command: { type: "AllocateResults", rollId, allocations: [] },
      commandId: asCommandId("cmd-s01-allocate"),
      occurredAtServer: "2026-09-17T00:00:04.000Z",
    });
    expect(allocate.ok).toBe(true);
    if (!allocate.ok) return;
    authority = allocate.authority;
    expect(authority.state.rolls[rollId]?.status).toBe("resolved");
    const rook = authority.state.characters[ROOK_ID]!;
    const markedBoxes = rook.injuries.flatMap((c) => c.boxes.filter((b) => b.marked));
    expect(markedBoxes).toHaveLength(1);
    // O4 does not apply: the GM rolled 2 successes, not zero.
    expect(authority.state.threats[PATROL_A_ID]?.attack).toBe(DROP_FORECOURT.threats[0]!.attack);
  });
});

describe("S02 — resource depletion (matrix P2, P3, P5, C4, A5)", () => {
  it("the last use of an item adds a bonus die; a depleted item cannot be declared again; feeding clamps at 10", () => {
    let authority = loadDropForecourt(freshAuthority());
    authority = claim(authority, PLAYER_CTX, ROOK_ID, "s02");
    // Deplete the pocket mirror (a 1-use item) is too destructive to the fixture; instead
    // drive the silenced pistol (3 uses) down to its last use directly, then declare with it.
    const rook = authority.state.characters[ROOK_ID]!;
    authority = {
      ...authority,
      state: {
        ...authority.state,
        characters: {
          ...authority.state.characters,
          [ROOK_ID]: {
            ...rook,
            items: rook.items.map((item) =>
              item.id === "rook-silenced-pistol" ? { ...item, usesRemaining: 1 } : item,
            ),
          },
        },
      },
    };

    const begin = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: new FixedSequenceRandom([]),
      command: {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "CON",
        itemIds: ["rook-silenced-pistol"],
        abilityIds: [],
        bonusClaimIds: [],
        engagedThreatIds: [],
        note: null,
      },
      commandId: asCommandId("cmd-s02-begin"),
      occurredAtServer: "2026-09-17T00:00:02.000Z",
    });
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    authority = begin.authority;
    const rollId = Object.keys(authority.state.rolls)[0]!;

    // Pool = CON(4) + item(1) + last-use bonus(1) = 6 dice; no engaged threats -> 0 attack dice.
    const review = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority,
      random: new FixedSequenceRandom([1, 1, 1, 1, 1, 1]),
      command: { type: "ReviewAction", rollId, approvedClaimIds: [], engagedThreatIds: [] },
      commandId: asCommandId("cmd-s02-review"),
      occurredAtServer: "2026-09-17T00:00:03.000Z",
    });
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    authority = review.authority;
    expect(authority.state.rolls[rollId]?.playerFaces).toHaveLength(6);
    expect(
      authority.state.characters[ROOK_ID]?.items.find((i) => i.id === "rook-silenced-pistol")
        ?.usesRemaining,
    ).toBe(0);

    // The now-depleted item cannot be declared again.
    const secondBegin = eatTheReichTemplate.decide(
      { state: authority.state, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "CON",
        itemIds: ["rook-silenced-pistol"],
        abilityIds: [],
        bonusClaimIds: [],
        engagedThreatIds: [],
        note: null,
      },
    );
    expect(secondBegin.ok).toBe(false);

    // Retrying ReviewAction with the same commandId does not charge the item a second time.
    const retried = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority: review.authority,
      random: new FixedSequenceRandom([]),
      command: { type: "ReviewAction", rollId, approvedClaimIds: [], engagedThreatIds: [] },
      commandId: asCommandId("cmd-s02-review"),
      occurredAtServer: "2026-09-17T00:00:05.000Z",
      priorReceipt: review.receipt,
    });
    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    expect(retried.authority).toBe(review.authority);
  });

  it("feeding at Blood 9 clamps at 10, not 11", () => {
    const withScene = loadDropForecourt(freshAuthority());
    const claimed = claim(withScene, PLAYER_CTX, ROOK_ID, "s02b");
    const rook = claimed.state.characters[ROOK_ID]!;
    const highBlood: EatTheReichState = {
      ...claimed.state,
      characters: { ...claimed.state.characters, [ROOK_ID]: { ...rook, blood: 9 } },
    };
    const authority = { ...claimed, state: highBlood };

    const begin = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: new FixedSequenceRandom([]),
      command: {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "SNEAK",
        itemIds: [],
        abilityIds: [],
        bonusClaimIds: [],
        engagedThreatIds: [],
        note: null,
      },
      commandId: asCommandId("cmd-s02c-begin"),
      occurredAtServer: "2026-09-17T00:00:02.000Z",
    });
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    const rollId = Object.keys(begin.authority.state.rolls)[0]!;
    const review = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority: begin.authority,
      random: new FixedSequenceRandom([6, 6, 6, 6]),
      command: { type: "ReviewAction", rollId, approvedClaimIds: [], engagedThreatIds: [] },
      commandId: asCommandId("cmd-s02c-review"),
      occurredAtServer: "2026-09-17T00:00:03.000Z",
    });
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    const keptDice = review.authority.state.rolls[rollId]?.keptDice ?? [];
    const allocate = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority: review.authority,
      random: new FixedSequenceRandom([1]),
      command: {
        type: "AllocateResults",
        rollId,
        allocations: keptDice.map((d) => ({
          dieFaceIndex: d.faceIndex,
          target: { kind: "feed" as const },
        })),
      },
      commandId: asCommandId("cmd-s02c-allocate"),
      occurredAtServer: "2026-09-17T00:00:04.000Z",
    });
    expect(allocate.ok).toBe(true);
    if (!allocate.ok) return;
    expect(allocate.authority.state.characters[ROOK_ID]?.blood).toBe(10);
  });
});

describe("S03 — invalid allocation (matrix A1, A6, A7, A9)", () => {
  it("a success cannot activate a SPECIAL, duplicate/unassigned dice are rejected, and another actor cannot allocate the roll", () => {
    let authority = loadDropForecourt(freshAuthority());
    authority = claim(authority, PLAYER_CTX, ROOK_ID, "s03");
    authority = claim(authority, SECOND_PLAYER_CTX, VESPER_ID, "s03b");

    const begin = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: new FixedSequenceRandom([]),
      command: {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "CON",
        itemIds: [],
        abilityIds: [],
        bonusClaimIds: [],
        engagedThreatIds: [PATROL_A_ID],
        note: null,
      },
      commandId: asCommandId("cmd-s03-begin"),
      occurredAtServer: "2026-09-17T00:00:02.000Z",
    });
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    const rollId = Object.keys(begin.authority.state.rolls)[0]!;
    // faces [6,5,4,3] -> kept: critical, success, success (discard the 3).
    const review = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority: begin.authority,
      random: new FixedSequenceRandom([6, 5, 4, 3, 1, 2, 1]),
      command: {
        type: "ReviewAction",
        rollId,
        approvedClaimIds: [],
        engagedThreatIds: [PATROL_A_ID],
      },
      commandId: asCommandId("cmd-s03-review"),
      occurredAtServer: "2026-09-17T00:00:03.000Z",
    });
    expect(review.ok).toBe(true);
    if (!review.ok) return;

    const successToSpecial = eatTheReichTemplate.decide(
      { state: review.authority.state, actor: PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId,
        allocations: [
          { dieFaceIndex: 1, target: { kind: "special", abilityId: "rook-special-blackout-drop" } },
          { dieFaceIndex: 0, target: { kind: "defend" } },
          { dieFaceIndex: 2, target: { kind: "defend" } },
        ],
      },
    );
    expect(successToSpecial.ok).toBe(false);

    const duplicateDie = eatTheReichTemplate.decide(
      { state: review.authority.state, actor: PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId,
        allocations: [
          { dieFaceIndex: 0, target: { kind: "defend" } },
          { dieFaceIndex: 0, target: { kind: "feed" } },
        ],
      },
    );
    expect(duplicateDie.ok).toBe(false);

    const partiallyAssigned = eatTheReichTemplate.decide(
      { state: review.authority.state, actor: PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId,
        allocations: [{ dieFaceIndex: 0, target: { kind: "defend" } }],
      },
    );
    expect(partiallyAssigned.ok).toBe(false);

    const wrongActor = eatTheReichTemplate.decide(
      {
        state: review.authority.state,
        actor: SECOND_PLAYER_CTX,
        random: new FixedSequenceRandom([1]),
      },
      {
        type: "AllocateResults",
        rollId,
        allocations: [
          { dieFaceIndex: 0, target: { kind: "defend" } },
          { dieFaceIndex: 1, target: { kind: "defend" } },
          { dieFaceIndex: 2, target: { kind: "defend" } },
        ],
      },
    );
    expect(wrongActor.ok).toBe(false);
    if (wrongActor.ok) return;
    expect(wrongActor.code).toBe("ROLE_FORBIDDEN");
  });
});

describe("S04 — simultaneous character claim (matrix C2)", () => {
  it("exactly one of two concurrent claims for the same character succeeds", () => {
    const authority = loadDropForecourt(freshAuthority());
    const first = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: new FixedSequenceRandom([]),
      command: { type: "ClaimCharacter", characterId: ROOK_ID },
      commandId: asCommandId("cmd-s04-a"),
      occurredAtServer: "2026-09-17T00:00:02.000Z",
    });
    expect(first.ok).toBe(true);
    // The second claim replays against the SAME pre-claim authority, exactly as two
    // concurrent Firestore transactions would both read the same starting snapshot.
    const second = runCommand(eatTheReichTemplate, {
      member: SECOND_PLAYER_CTX,
      authority,
      random: new FixedSequenceRandom([]),
      command: { type: "ClaimCharacter", characterId: ROOK_ID },
      commandId: asCommandId("cmd-s04-b"),
      occurredAtServer: "2026-09-17T00:00:02.500Z",
    });
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // Whichever transaction actually commits second (against the winner's post-state)
    // is the one that must fail; here we simulate that by re-running the loser against
    // the winner's authority, which is what a real retried transaction would observe.
    const loserRetry = runCommand(eatTheReichTemplate, {
      member: SECOND_PLAYER_CTX,
      authority: first.authority,
      random: new FixedSequenceRandom([]),
      command: { type: "ClaimCharacter", characterId: ROOK_ID },
      commandId: asCommandId("cmd-s04-b"),
      occurredAtServer: "2026-09-17T00:00:02.500Z",
    });
    expect(loserRetry.ok).toBe(false);
    if (loserRetry.ok) return;
    expect(loserRetry.code).toBe("CHARACTER_TAKEN");
    expect(first.authority.state.characters[ROOK_ID]?.claimedByMemberId).toBe(PLAYER_MEMBER_ID);
  });
});

describe("S08 — GM correction (matrix ETR_SESSION_FLOW §7)", () => {
  it("bounds Blood 0-10, requires a reason, and the correction is player-forbidden", () => {
    let authority = loadDropForecourt(freshAuthority());
    authority = claim(authority, PLAYER_CTX, ROOK_ID, "s08");

    const outOfBounds = eatTheReichTemplate.decide(
      { state: authority.state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "CorrectCharacter", characterId: ROOK_ID, reason: "test", patch: { blood: 12 } },
    );
    expect(outOfBounds.ok).toBe(false);

    const noReason = eatTheReichTemplate.decide(
      { state: authority.state, actor: GM_CTX, random: new FixedSequenceRandom([]) },
      { type: "CorrectCharacter", characterId: ROOK_ID, reason: "", patch: { blood: 4 } },
    );
    expect(noReason.ok).toBe(false);

    const playerAttempt = eatTheReichTemplate.authorizeGameAction(PLAYER_CTX, {
      type: "CorrectCharacter",
      characterId: ROOK_ID,
      reason: "missed a feed",
      patch: { blood: 4 },
    });
    expect(playerAttempt.allowed).toBe(false);

    const accepted = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority,
      random: new FixedSequenceRandom([]),
      command: {
        type: "CorrectCharacter",
        characterId: ROOK_ID,
        reason: "missed a feed",
        patch: { blood: 4 },
      },
      commandId: asCommandId("cmd-s08-correct"),
      occurredAtServer: "2026-09-17T00:00:02.000Z",
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.authority.state.characters[ROOK_ID]?.blood).toBe(4);
  });
});

describe("S09 — consecutive scenes (matrix S1, S5, S6, S8)", () => {
  it("ending the round reinforces Threats, and NextScene carries characters forward while resetting the round", () => {
    let authority = loadDropForecourt(freshAuthority());
    authority = claim(authority, PLAYER_CTX, ROOK_ID, "s09");
    authority = claim(authority, SECOND_PLAYER_CTX, VESPER_ID, "s09b");

    // Beat Patrol A to 0 directly (bypassing a full roll) to set up the reinforcement check.
    authority = {
      ...authority,
      state: {
        ...authority.state,
        threats: {
          ...authority.state.threats,
          [PATROL_A_ID]: { ...authority.state.threats[PATROL_A_ID]!, rating: 0, attack: 0 },
        },
      },
    };

    const endRound = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority,
      random: new FixedSequenceRandom([3]), // 1d6 -> 3 for Patrol A's reinforcement
      command: { type: "EndRound" },
      commandId: asCommandId("cmd-s09-endround"),
      occurredAtServer: "2026-09-17T00:00:02.000Z",
    });
    expect(endRound.ok).toBe(true);
    if (!endRound.ok) return;
    authority = endRound.authority;
    expect(authority.state.threats[PATROL_A_ID]?.rating).toBe(3);
    expect(authority.state.threats[PATROL_B_ID]?.attack).toBe(
      DROP_FORECOURT.threats[1]!.attack + 1,
    );
    expect(authority.state.scene?.round).toBe(2);

    // Mark the primary Objective complete directly, then move to the next scene.
    authority = {
      ...authority,
      state: {
        ...authority.state,
        objectives: {
          ...authority.state.objectives,
          [OBJECTIVE_ID]: {
            ...authority.state.objectives[OBJECTIVE_ID]!,
            rating: 0,
            status: "complete",
          },
        },
        characters: {
          ...authority.state.characters,
          [ROOK_ID]: { ...authority.state.characters[ROOK_ID]!, blood: 5 },
        },
      },
    };
    const metroplatform = ORIGINAL_MISSION[1]!;
    const nextScene = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority,
      random: new FixedSequenceRandom([]),
      command: { type: "NextScene", ...metroplatform, reason: null },
      commandId: asCommandId("cmd-s09-nextscene"),
      occurredAtServer: "2026-09-17T00:00:03.000Z",
    });
    expect(nextScene.ok).toBe(true);
    if (!nextScene.ok) return;
    authority = nextScene.authority;
    expect(authority.state.scene?.id).toBe("metro-platform");
    expect(authority.state.scene?.round).toBe(1);
    expect(authority.state.threats[PATROL_A_ID]).toBeUndefined();
    expect(authority.state.characters[ROOK_ID]?.blood).toBe(5); // carried over
    // The Enforcer is unrevealed at load (matrix Appendix C: foreshadowed, revealed after round 1).
    const enforcer = Object.values(authority.state.threats).find((t) => t.elite);
    expect(enforcer?.revealed).toBe(false);
    const playerProjection = projectViewer(eatTheReichTemplate, authority, PLAYER_VIEWER);
    expect(playerProjection.view.threats.find((t) => t.name === "The Enforcer")).toBeUndefined();
  });
});

describe("S10 — ending (matrix S8, EndMission)", () => {
  it("completing the final scene's Objective unlocks EndMission, which archives further declares", () => {
    let authority = freshAuthority();
    const signalMast = ORIGINAL_MISSION[3]!;
    const load = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority,
      random: new FixedSequenceRandom([]),
      command: { type: "LoadScene", ...signalMast },
      commandId: asCommandId("cmd-s10-load"),
      occurredAtServer: "2026-09-17T00:00:00.000Z",
    });
    expect(load.ok).toBe(true);
    if (!load.ok) return;
    authority = load.authority;
    authority = claim(authority, PLAYER_CTX, ROOK_ID, "s10");

    const objectiveId = signalMast.objectives[0]!.id;
    const beforeEnd = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority,
      random: new FixedSequenceRandom([]),
      command: { type: "EndMission", reason: null },
      commandId: asCommandId("cmd-s10-early"),
      occurredAtServer: "2026-09-17T00:00:01.000Z",
    });
    expect(beforeEnd.ok).toBe(false);

    authority = {
      ...authority,
      state: {
        ...authority.state,
        objectives: {
          ...authority.state.objectives,
          [objectiveId]: {
            ...authority.state.objectives[objectiveId]!,
            rating: 0,
            status: "complete",
          },
        },
      },
    };
    const end = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority,
      random: new FixedSequenceRandom([]),
      command: { type: "EndMission", reason: null },
      commandId: asCommandId("cmd-s10-end"),
      occurredAtServer: "2026-09-17T00:00:02.000Z",
    });
    expect(end.ok).toBe(true);
    if (!end.ok) return;
    authority = end.authority;
    expect(authority.state.missionEnded).toBe(true);

    const afterMission = eatTheReichTemplate.decide(
      { state: authority.state, actor: PLAYER_CTX, random: new FixedSequenceRandom([]) },
      {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "SNEAK",
        itemIds: [],
        abilityIds: [],
        bonusClaimIds: [],
        engagedThreatIds: [],
        note: null,
      },
    );
    expect(afterMission.ok).toBe(false);
  });
});

describe("S05 — resolved or deleted target (matrix A8, S1, S4; EditScene)", () => {
  it("AllocateResults targeting a Threat the GM removed mid-roll is rejected, not silently misapplied", () => {
    let authority = loadDropForecourt(freshAuthority());
    authority = claim(authority, PLAYER_CTX, ROOK_ID, "s05");

    const begin = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: new FixedSequenceRandom([]),
      command: {
        type: "BeginAction",
        characterId: ROOK_ID,
        stat: "SNEAK",
        itemIds: [],
        abilityIds: [],
        bonusClaimIds: [],
        engagedThreatIds: [PATROL_A_ID],
        note: null,
      },
      commandId: asCommandId("cmd-s05-begin"),
      occurredAtServer: "2026-09-17T00:00:02.000Z",
    });
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    const rollId = Object.keys(begin.authority.state.rolls)[0]!;
    const review = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority: begin.authority,
      random: new FixedSequenceRandom([4, 1, 1, 1, 1, 1, 1]),
      command: {
        type: "ReviewAction",
        rollId,
        approvedClaimIds: [],
        engagedThreatIds: [PATROL_A_ID],
      },
      commandId: asCommandId("cmd-s05-review"),
      occurredAtServer: "2026-09-17T00:00:03.000Z",
    });
    expect(review.ok).toBe(true);
    if (!review.ok) return;

    // The GM, in parallel, edits the scene to remove Patrol A before the player confirms.
    const edit = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority: review.authority,
      random: new FixedSequenceRandom([]),
      command: { type: "EditScene", reason: "narrated away", removeThreatIds: [PATROL_A_ID] },
      commandId: asCommandId("cmd-s05-edit"),
      occurredAtServer: "2026-09-17T00:00:04.000Z",
    });
    expect(edit.ok).toBe(true);
    if (!edit.ok) return;
    expect(edit.authority.state.threats[PATROL_A_ID]).toBeUndefined();

    const keptDice = edit.authority.state.rolls[rollId]?.keptDice ?? [];
    expect(keptDice.length).toBeGreaterThan(0);
    const staleAllocate = eatTheReichTemplate.decide(
      { state: edit.authority.state, actor: PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId,
        allocations: keptDice.map((d) => ({
          dieFaceIndex: d.faceIndex,
          target: { kind: "threat" as const, threatId: PATROL_A_ID },
        })),
      },
    );
    expect(staleAllocate.ok).toBe(false);
    if (staleAllocate.ok) return;
    expect(staleAllocate.code).toBe("INVALID_ALLOCATION");

    // The roll stays open and untouched; the player can re-derive against the fresh projection
    // and allocate to a target that still exists (matrix flow §2 "stale-input").
    expect(edit.authority.state.rolls[rollId]?.status).toBe("awaiting_allocation");
    const retarget = eatTheReichTemplate.decide(
      { state: edit.authority.state, actor: PLAYER_CTX, random: new FixedSequenceRandom([1]) },
      {
        type: "AllocateResults",
        rollId,
        allocations: keptDice.map((d) => ({
          dieFaceIndex: d.faceIndex,
          target: { kind: "feed" as const },
        })),
      },
    );
    expect(retarget.ok).toBe(true);
  });
});

describe("cross-cutting: shipped scene content stays within budget", () => {
  it("keeps authority and every viewer's projection under budget after loading each Appendix C scene", () => {
    for (const scene of ORIGINAL_MISSION) {
      const authority = runCommand(eatTheReichTemplate, {
        member: GM_CTX,
        authority: freshAuthority(),
        random: new FixedSequenceRandom([]),
        command: { type: "LoadScene", ...scene },
        commandId: asCommandId(`cmd-budget-${scene.sceneId}`),
        occurredAtServer: "2026-09-17T00:00:00.000Z",
      });
      expect(authority.ok).toBe(true);
      if (!authority.ok) continue;
      expect(checkAuthorityBudget(authority.authority).withinWorkingBudget).toBe(true);
      for (const viewer of [PLAYER_VIEWER, SECOND_PLAYER_VIEWER, GM_VIEWER, TABLE_VIEWER]) {
        const projection = projectViewer(eatTheReichTemplate, authority.authority, viewer);
        expect(checkProjectionBudget(projection).withinCeiling).toBe(true);
      }
    }
  });
});
