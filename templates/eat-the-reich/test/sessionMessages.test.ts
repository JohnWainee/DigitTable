import fc from "fast-check";
import { asCommandId, destinationKey } from "@digitable/contracts";
import { createSeededRandom, projectViewer, runCommand } from "@digitable/engine";
import { describe, expect, it } from "vitest";
import { eatTheReichTemplate } from "../src/engine.js";
import {
  GM_CTX,
  GM_VIEWER,
  PLAYER_CTX,
  PLAYER_VIEWER,
  SECOND_PLAYER_MEMBER_ID,
  SECOND_PLAYER_VIEWER,
  TABLE_VIEWER,
  freshAuthority,
} from "./fixtures.js";

describe("session communications", () => {
  it("keeps a broadcast in the shared partition and never adds its body to projections", () => {
    const body = "A broadcast test sentinel 4c9d2d";
    const result = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority: freshAuthority(),
      random: createSeededRandom("broadcast-test"),
      command: { type: "BroadcastMessage", text: ` ${body} ` },
      commandId: asCommandId("44444444-4444-4444-8444-444444444444"),
      occurredAtServer: "2026-10-09T12:00:00Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.envelopes.map(({ destination }) => destinationKey(destination))).toEqual([
      "shared",
    ]);
    expect(result.envelopes[0]?.envelope.payload).toEqual({ type: "BroadcastPosted", text: body });
    for (const viewer of [GM_VIEWER, PLAYER_VIEWER, SECOND_PLAYER_VIEWER, TABLE_VIEWER]) {
      expect(
        JSON.stringify(projectViewer(eatTheReichTemplate, result.authority, viewer)),
      ).not.toContain(body);
    }
  });

  it("stores a private note only in GM and recipient partitions and rejects non-GM senders", () => {
    const body = "Private note sentinel 960edc";
    const result = runCommand(eatTheReichTemplate, {
      member: GM_CTX,
      authority: freshAuthority(),
      random: createSeededRandom("private-test"),
      command: {
        type: "SendPrivateMessage",
        recipientMemberId: SECOND_PLAYER_MEMBER_ID,
        text: body,
      },
      commandId: asCommandId("55555555-5555-4555-8555-555555555555"),
      occurredAtServer: "2026-10-09T12:00:00Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.envelopes.map(({ destination }) =>
        destinationKey(destination).replace(/^member:.*/, "member:target"),
      ),
    ).toEqual(["gm", "member:target"]);
    expect(
      result.envelopes.every(({ envelope }) => envelope.payload.type === "PrivateMessageSent"),
    ).toBe(true);
    expect(
      JSON.stringify(projectViewer(eatTheReichTemplate, result.authority, SECOND_PLAYER_VIEWER)),
    ).not.toContain(body);
    expect(
      JSON.stringify(projectViewer(eatTheReichTemplate, result.authority, PLAYER_VIEWER)),
    ).not.toContain(body);
    expect(
      JSON.stringify(projectViewer(eatTheReichTemplate, result.authority, TABLE_VIEWER)),
    ).not.toContain(body);
    expect(
      JSON.stringify(projectViewer(eatTheReichTemplate, result.authority, GM_VIEWER)),
    ).not.toContain(body);

    const playerAttempt = runCommand(eatTheReichTemplate, {
      member: PLAYER_CTX,
      authority: freshAuthority(),
      random: createSeededRandom("not-gm"),
      command: { type: "BroadcastMessage", text: body },
      commandId: asCommandId("66666666-6666-4666-8666-666666666666"),
      occurredAtServer: "2026-10-09T12:00:00Z",
    });
    expect(playerAttempt).toMatchObject({ ok: false, code: "ROLE_FORBIDDEN" });
    expect(JSON.stringify(playerAttempt)).not.toContain(body);
  });

  it("bounds all message bodies before a payload can become an event", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 500 }), (text) => {
        const parsed = eatTheReichTemplate.schemas.parseCommand({ type: "BroadcastMessage", text });
        expect(parsed).toEqual({ type: "BroadcastMessage", text });
      }),
      { numRuns: 100 },
    );
    expect(() =>
      eatTheReichTemplate.schemas.parseCommand({ type: "BroadcastMessage", text: "x".repeat(501) }),
    ).toThrow();
  });
});
