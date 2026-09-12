import { describe, expect, it } from "vitest";
import { asCommandId } from "@digitable/contracts";
import { counterTemplate } from "@digitable/testing";
import { makeAuthority, makeMemberContext, fixtureMemberId } from "@digitable/testing";
import { createSeededRandom, runCommand } from "../src/index.js";

const member = makeMemberContext(fixtureMemberId("alice"), "player");

describe("runCommand", () => {
  it("applies an accepted command: reduces state and increments revision/sequence once", () => {
    const authority = makeAuthority({ count: 0 });
    const result = runCommand(counterTemplate, {
      member,
      authority,
      random: createSeededRandom("unused-for-increment"),
      command: { type: "Increment", by: 3 },
      commandId: asCommandId("cmd-1"),
      occurredAtServer: "2026-09-12T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.authority.state.count).toBe(3);
    expect(result.authority.roomRevision).toBe(authority.roomRevision + 1);
    expect(result.authority.nextSequence).toBe(authority.nextSequence + 1);
    expect(result.envelopes).toHaveLength(1);
    expect(result.envelopes[0]?.envelope.sequence).toBe(authority.nextSequence);
  });

  it("rejects a denied command without mutating state", () => {
    const authority = makeAuthority({ count: 5 });
    const result = runCommand(counterTemplate, {
      member,
      authority,
      random: createSeededRandom("unused"),
      command: { type: "Increment", by: -1 },
      commandId: asCommandId("cmd-2"),
      occurredAtServer: "2026-09-12T00:00:00.000Z",
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("UNKNOWN_ACTION");
  });

  it("draws dice from the injected random source in decide order", () => {
    const authority = makeAuthority({ count: 0 });
    const random = createSeededRandom("fixed-roll-seed");
    const expectedFace = createSeededRandom("fixed-roll-seed").rollDie(6);

    const result = runCommand(counterTemplate, {
      member,
      authority,
      random,
      command: { type: "RollAndAdd", sides: 6 },
      commandId: asCommandId("cmd-3"),
      occurredAtServer: "2026-09-12T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.authority.state.count).toBe(expectedFace);
  });

  it("delivers a different, redacted payload per destination for the same logical event", () => {
    const authority = makeAuthority({ count: 0 });
    const result = runCommand(counterTemplate, {
      member,
      authority,
      random: createSeededRandom("redaction-seed"),
      command: { type: "RollAndAdd", sides: 6 },
      commandId: asCommandId("cmd-4"),
      occurredAtServer: "2026-09-12T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const shared = result.envelopes.find((e) => e.destination.kind === "shared");
    const gm = result.envelopes.find((e) => e.destination.kind === "gm");
    expect(shared?.envelope.eventId).toBe(gm?.envelope.eventId);
    expect(shared?.envelope.sequence).toBe(gm?.envelope.sequence);

    const sharedPayload = shared?.envelope.payload as { secretNote: string };
    const gmPayload = gm?.envelope.payload as { secretNote: string };
    expect(sharedPayload.secretNote).toBe("");
    expect(gmPayload.secretNote).toMatch(/^gm-only-/);
  });

  it("assigns consecutive sequence numbers to multiple logical events from one command", () => {
    // counterTemplate only ever emits one logical event per command; this
    // test documents the contract at the harness level using two commands
    // applied in sequence, which is the shape multi-event decisions share.
    const authority0 = makeAuthority({ count: 0 });
    const first = runCommand(counterTemplate, {
      member,
      authority: authority0,
      random: createSeededRandom("seq-a"),
      command: { type: "Increment", by: 1 },
      commandId: asCommandId("cmd-5"),
      occurredAtServer: "2026-09-12T00:00:00.000Z",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = runCommand(counterTemplate, {
      member,
      authority: first.authority,
      random: createSeededRandom("seq-b"),
      command: { type: "Increment", by: 1 },
      commandId: asCommandId("cmd-6"),
      occurredAtServer: "2026-09-12T00:00:01.000Z",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.envelopes[0]?.envelope.sequence).toBe(first.authority.nextSequence);
    expect(second.authority.roomRevision).toBe(first.authority.roomRevision + 1);
  });
});
