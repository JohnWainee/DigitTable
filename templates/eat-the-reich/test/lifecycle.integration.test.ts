import { asCommandId } from "@digitable/contracts";
import { createSeededRandom, projectViewer, runCommand } from "@digitable/engine";
import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import {
  FixedSequenceRandom,
  GM_CTX,
  GM_VIEWER,
  PLAYER_CTX,
  PLAYER_MEMBER_ID,
  PLAYER_VIEWER,
  ROOK_ID,
  SECOND_PLAYER_CTX,
  SECOND_PLAYER_MEMBER_ID,
  freshAuthority,
  stateWithScene,
} from "./fixtures.js";

/**
 * End-to-end proof (docs/ARCHITECTURE.md, "Opposed action") that
 * authorizeGameAction, decide, reduce, and project compose correctly
 * through the engine's runCommand/projectViewer harness for B02's
 * claim/release/heal commands.
 */
describe("character claim lifecycle", () => {
  it("claims, releases, and re-claims a character end to end", () => {
    let authority = freshAuthority();

    const claim = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: createSeededRandom("lifecycle-claim"),
      command: { type: "ClaimCharacter", characterId: ROOK_ID },
      commandId: asCommandId("cmd-claim"),
      occurredAtServer: "2026-09-14T00:00:00.000Z",
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    authority = claim.authority;
    expect(authority.state.characters[ROOK_ID]?.claimedByMemberId).toBe(PLAYER_MEMBER_ID);

    // A second member cannot claim the same character while it is held.
    const conflictingClaim = runCommand(eatTheReichTemplate, {
      member: SECOND_PLAYER_CTX,
      authority,
      random: createSeededRandom("lifecycle-conflict"),
      command: { type: "ClaimCharacter", characterId: ROOK_ID },
      commandId: asCommandId("cmd-conflict"),
      occurredAtServer: "2026-09-14T00:00:01.000Z",
    });
    expect(conflictingClaim.ok).toBe(false);
    if (conflictingClaim.ok) return;
    expect(conflictingClaim.code).toBe("CHARACTER_TAKEN");

    const release = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: createSeededRandom("lifecycle-release"),
      command: { type: "ReleaseCharacter", characterId: ROOK_ID },
      commandId: asCommandId("cmd-release"),
      occurredAtServer: "2026-09-14T00:00:02.000Z",
    });
    expect(release.ok).toBe(true);
    if (!release.ok) return;
    authority = release.authority;
    expect(authority.state.characters[ROOK_ID]?.claimedByMemberId).toBeNull();

    const reclaim = runCommand(eatTheReichTemplate, {
      member: SECOND_PLAYER_CTX,
      authority,
      random: createSeededRandom("lifecycle-reclaim"),
      command: { type: "ClaimCharacter", characterId: ROOK_ID },
      commandId: asCommandId("cmd-reclaim"),
      occurredAtServer: "2026-09-14T00:00:03.000Z",
    });
    expect(reclaim.ok).toBe(true);
    if (!reclaim.ok) return;
    authority = reclaim.authority;
    expect(authority.state.characters[ROOK_ID]?.claimedByMemberId).toBe(SECOND_PLAYER_MEMBER_ID);

    // Projections stay isolated: the first (former) player no longer sees Rook as self,
    // and never saw the second player's items regardless.
    const formerPlayerProjection = projectViewer(eatTheReichTemplate, authority, PLAYER_VIEWER);
    expect(formerPlayerProjection.view.self).toBeNull();
    const gmProjection = projectViewer(eatTheReichTemplate, authority, GM_VIEWER);
    expect(gmProjection.view.gmSheets.find((c) => c.id === ROOK_ID)?.claimedByMemberId).toBe(
      SECOND_PLAYER_MEMBER_ID,
    );
  });

  it("a retried commandId (priorReceipt supplied) does not re-apply the command", () => {
    const authority = freshAuthority();
    const first = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: createSeededRandom("retry-seed"),
      command: { type: "ClaimCharacter", characterId: ROOK_ID },
      commandId: asCommandId("cmd-retry"),
      occurredAtServer: "2026-09-14T00:00:00.000Z",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retried = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority, // the pre-command authority, as a retried transaction would see before re-reading
      random: createSeededRandom("retry-seed"),
      command: { type: "ClaimCharacter", characterId: ROOK_ID },
      commandId: asCommandId("cmd-retry"),
      occurredAtServer: "2026-09-14T00:00:05.000Z",
      priorReceipt: first.receipt,
    });
    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    // Short-circuited: no new envelopes, authority handed back unchanged.
    expect(retried.envelopes).toEqual([]);
    expect(retried.authority).toBe(authority);
  });

  it("rejects claiming a second character while already holding one, end to end", () => {
    let authority = freshAuthority();
    const claim = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: createSeededRandom("second-claim-seed"),
      command: { type: "ClaimCharacter", characterId: ROOK_ID },
      commandId: asCommandId("cmd-first"),
      occurredAtServer: "2026-09-14T00:00:00.000Z",
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    authority = claim.authority;

    const secondClaim = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: createSeededRandom("second-claim-seed-2"),
      command: { type: "ClaimCharacter", characterId: "vesper" },
      commandId: asCommandId("cmd-second"),
      occurredAtServer: "2026-09-14T00:00:01.000Z",
    });
    expect(secondClaim.ok).toBe(false);
    if (secondClaim.ok) return;
    expect(secondClaim.code).toBe("ROLE_FORBIDDEN");
  });
});

/**
 * End-to-end proof of B03's full declare -> GM review -> single server roll
 * -> allocate loop (docs/ETR_SESSION_FLOW.md §6) through the same
 * runCommand/projectViewer harness a trusted Function transaction runs.
 */
describe("resolution loop lifecycle (B03)", () => {
  it("resolves one full action end to end: claim, declare, review, allocate", () => {
    const THREAT_ID = "threat-fixture";
    let authority = freshAuthority(stateWithScene());

    const claim = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: createSeededRandom("full-loop-claim"),
      command: { type: "ClaimCharacter", characterId: ROOK_ID },
      commandId: asCommandId("cmd-claim"),
      occurredAtServer: "2026-09-14T00:00:00.000Z",
    });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    authority = claim.authority;

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
        engagedThreatIds: [THREAT_ID],
        note: null,
      },
      commandId: asCommandId("cmd-begin"),
      occurredAtServer: "2026-09-14T00:00:01.000Z",
    });
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    authority = begin.authority;
    const rollId = Object.keys(authority.state.rolls)[0];
    if (!rollId) throw new Error("expected a declared roll");
    expect(authority.state.rolls[rollId]?.status).toBe("declared");

    // Non-owner, non-GM viewers see only "acting" while a roll is declared.
    const otherPlayerView = projectViewer(eatTheReichTemplate, authority, {
      roomId: PLAYER_VIEWER.roomId,
      viewerId: SECOND_PLAYER_MEMBER_ID,
      capability: "player",
    });
    expect(otherPlayerView.view.rolls).toEqual([
      { rollId, characterId: ROOK_ID, status: "declared" },
    ]);
    const ownerView = projectViewer(eatTheReichTemplate, authority, PLAYER_VIEWER);
    expect(ownerView.view.rolls[0]).toMatchObject({ status: "declared", declaredStat: "SNEAK" });

    // Pool = SNEAK(4) only; threat attack(3), 1 threat in play -> 3 attack dice.
    const review = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority,
      random: new FixedSequenceRandom([4, 4, 4, 4, 1, 1, 1]),
      command: {
        type: "ReviewAction",
        rollId,
        approvedClaimIds: [],
        engagedThreatIds: [THREAT_ID],
      },
      commandId: asCommandId("cmd-review"),
      occurredAtServer: "2026-09-14T00:00:02.000Z",
    });
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    authority = review.authority;
    expect(authority.state.rolls[rollId]?.status).toBe("awaiting_allocation");
    expect(authority.state.rolls[rollId]?.attackSuccessesRolled).toBe(0); // faces [1,1,1] all discard

    // Once rolled, every viewer sees the dice — nothing hidden (matrix §6.2).
    const otherPlayerViewAfterRoll = projectViewer(eatTheReichTemplate, authority, {
      roomId: PLAYER_VIEWER.roomId,
      viewerId: SECOND_PLAYER_MEMBER_ID,
      capability: "player",
    });
    expect(otherPlayerViewAfterRoll.view.rolls[0]).toMatchObject({ status: "awaiting_allocation" });
    expect(otherPlayerViewAfterRoll.view.rolls[0]).toHaveProperty("playerFaces");

    const keptDice = authority.state.rolls[rollId]?.keptDice ?? [];
    const allocate = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: new FixedSequenceRandom([1]), // unused: 0 remaining attack successes, no injury roll
      command: {
        type: "AllocateResults",
        rollId,
        allocations: keptDice.map((die) => ({
          dieFaceIndex: die.faceIndex,
          target: { kind: "objective" as const, objectiveId: "objective-fixture" },
        })),
      },
      commandId: asCommandId("cmd-allocate"),
      occurredAtServer: "2026-09-14T00:00:03.000Z",
    });
    expect(allocate.ok).toBe(true);
    if (!allocate.ok) return;
    authority = allocate.authority;
    expect(authority.state.rolls[rollId]?.status).toBe("resolved");
    // 4 kept dice (all successes, since O4's bump doesn't apply here -- 0 attack dice rolled? No:
    // 3 attack dice were rolled but all discarded, so attackSuccessesRolled is 0 from real dice, not
    // "no attack dice" -- O4 requires attackDiceRolled > 0 AND 0 successes, which IS the case here.
    expect(authority.state.threats[THREAT_ID]?.attack).toBe(4); // O4 bump: 3 -> 4
    expect(authority.state.objectives["objective-fixture"]?.rating).toBeLessThan(8);

    // Resolved rolls drop out of the live projection.
    const finalProjection = projectViewer(eatTheReichTemplate, authority, PLAYER_VIEWER);
    expect(finalProjection.view.rolls).toEqual([]);
  });

  it("a retried BeginAction (priorReceipt supplied) does not declare a second roll", () => {
    const claimed = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority: freshAuthority(stateWithScene()),
      random: createSeededRandom("retry-begin-claim"),
      command: { type: "ClaimCharacter", characterId: ROOK_ID },
      commandId: asCommandId("cmd-claim"),
      occurredAtServer: "2026-09-14T00:00:00.000Z",
    });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;

    const beginCommand = {
      type: "BeginAction" as const,
      characterId: ROOK_ID,
      stat: "SNEAK" as const,
      itemIds: [],
      abilityIds: [],
      bonusClaimIds: [],
      engagedThreatIds: [],
      note: null,
    };
    const first = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority: claimed.authority,
      random: new FixedSequenceRandom([]),
      command: beginCommand,
      commandId: asCommandId("cmd-begin-retry"),
      occurredAtServer: "2026-09-14T00:00:01.000Z",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(Object.keys(first.authority.state.rolls)).toHaveLength(1);

    const retried = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority: claimed.authority,
      random: new FixedSequenceRandom([]),
      command: beginCommand,
      commandId: asCommandId("cmd-begin-retry"),
      occurredAtServer: "2026-09-14T00:00:05.000Z",
      priorReceipt: first.receipt,
    });
    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    expect(retried.envelopes).toEqual([]);
    expect(retried.authority).toBe(claimed.authority);
  });
});
