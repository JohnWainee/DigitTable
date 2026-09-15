import { asCommandId } from "@digitable/contracts";
import { createSeededRandom, projectViewer, runCommand } from "@digitable/engine";
import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import {
  GM_VIEWER,
  PLAYER_CTX,
  PLAYER_MEMBER_ID,
  PLAYER_VIEWER,
  ROOK_ID,
  SECOND_PLAYER_CTX,
  SECOND_PLAYER_MEMBER_ID,
  freshAuthority,
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
