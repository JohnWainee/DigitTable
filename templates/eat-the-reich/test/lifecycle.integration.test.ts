import { asCommandId } from "@digitable/contracts";
import { createSeededRandom, projectViewer, runCommand } from "@digitable/engine";
import { describe, expect, it } from "vitest";
import { ACTION_ID, THREAT_ID } from "../src/content.js";
import { eatTheReichTemplate } from "../src/engine.js";
import {
  GM_CTX,
  GM_VIEWER,
  PLAYER_CTX,
  PLAYER_MEMBER_ID,
  PLAYER_VIEWER,
  freshAuthority,
} from "./fixtures.js";

/**
 * End-to-end proof (docs/ARCHITECTURE.md, "Opposed action") that
 * authorizeGameAction, decide, reduce, and project compose correctly
 * through the engine's runCommand/projectViewer harness — the same pipeline
 * a trusted Function transaction runs, minus persistence.
 */
describe("opposed action lifecycle", () => {
  it("resolves one opposed action end to end with fixed seeds", () => {
    let authority = freshAuthority();

    const begin = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: createSeededRandom("lifecycle-begin"),
      command: {
        type: "BeginAction",
        actorMemberId: PLAYER_MEMBER_ID,
        threatId: THREAT_ID,
        actionId: ACTION_ID,
        gearIds: [],
      },
      commandId: asCommandId("cmd-begin"),
      occurredAtServer: "2026-09-12T00:00:00.000Z",
    });
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;
    authority = begin.authority;

    const rollId = "roll-1";
    expect(authority.state.rolls[rollId]).toBeDefined();

    const oppose = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority,
      random: createSeededRandom("lifecycle-oppose"),
      command: { type: "SubmitOpposition", rollId, pushDice: 0 },
      commandId: asCommandId("cmd-oppose"),
      occurredAtServer: "2026-09-12T00:00:01.000Z",
    });
    expect(oppose.ok).toBe(true);
    if (!oppose.ok) return;
    authority = oppose.authority;

    const resolvedRoll = authority.state.rolls[rollId];
    expect(resolvedRoll?.status).toBe("awaiting_allocation");
    const netSuccesses = resolvedRoll?.netSuccesses ?? 0;
    const damageUses = Math.min(
      netSuccesses,
      authority.state.threats[THREAT_ID]?.resolveRemaining ?? 0,
    );

    const allocate = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: createSeededRandom("lifecycle-allocate"), // unused by AllocateResults; no dice drawn
      command: {
        type: "AllocateResults",
        rollId,
        allocations: damageUses > 0 ? [{ optionId: "damage-threat", uses: damageUses }] : [],
      },
      commandId: asCommandId("cmd-allocate"),
      occurredAtServer: "2026-09-12T00:00:02.000Z",
    });
    expect(allocate.ok).toBe(true);
    if (!allocate.ok) return;
    authority = allocate.authority;

    expect(authority.state.rolls[rollId]?.status).toBe("resolved");
    expect(authority.state.threats[THREAT_ID]?.resolveRemaining).toBe(3 - damageUses);
    expect(authority.roomRevision).toBe(3); // one accepted command per step, from revision 0
    expect(authority.nextSequence).toBe(4); // one logical event per command

    // Projections stay isolated to the end: the player never sees the GM-only hidden modifier.
    const playerProjection = projectViewer(eatTheReichTemplate, authority, PLAYER_VIEWER);
    const gmProjection = projectViewer(eatTheReichTemplate, authority, GM_VIEWER);
    expect(playerProjection.view.threats[0]).not.toHaveProperty("hiddenDifficultyModifier");
    expect(gmProjection.view.threats[0]).toMatchObject({ hiddenDifficultyModifier: -1 });
  });

  it("rejects a duplicate-looking follow-up begin while the first roll is unresolved", () => {
    const authority = freshAuthority();
    const begin = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority,
      random: createSeededRandom("dup-seed"),
      command: {
        type: "BeginAction",
        actorMemberId: PLAYER_MEMBER_ID,
        threatId: THREAT_ID,
        actionId: ACTION_ID,
        gearIds: [],
      },
      commandId: asCommandId("cmd-1"),
      occurredAtServer: "2026-09-12T00:00:00.000Z",
    });
    expect(begin.ok).toBe(true);
    if (!begin.ok) return;

    const again = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority: begin.authority,
      random: createSeededRandom("dup-seed-2"),
      command: {
        type: "BeginAction",
        actorMemberId: PLAYER_MEMBER_ID,
        threatId: THREAT_ID,
        actionId: ACTION_ID,
        gearIds: [],
      },
      commandId: asCommandId("cmd-2"),
      occurredAtServer: "2026-09-12T00:00:01.000Z",
    });
    expect(again.ok).toBe(false);
  });
});
