import { describe, expect, it } from "vitest";
import type { AuthorizationResult, StableErrorCode } from "@digitable/contracts";
import {
  authorizePlatform,
  type PlatformCommand,
  type PlatformMember,
  type PlatformRoom,
} from "../src/index.js";

const room: PlatformRoom = {
  status: "active",
  templateId: "eat-the-reich",
  templateVersion: "1.0.0",
};
const command: PlatformCommand = {
  templateId: "eat-the-reich",
  templateVersion: "1.0.0",
  payload: { ok: true },
};
const player: PlatformMember = { memberId: "member-1", capability: "player" };

function deniedCode(result: AuthorizationResult): StableErrorCode {
  if (result.allowed) {
    throw new Error("expected denial, got allow()");
  }
  return result.code;
}

describe("authorizePlatform", () => {
  it("allows an authenticated player in an active room with a matching template version", () => {
    expect(authorizePlatform(player, room, command)).toEqual({ allowed: true });
  });

  it("denies an unauthenticated request", () => {
    expect(deniedCode(authorizePlatform(null, room, command))).toBe("AUTH_REQUIRED");
  });

  it("denies commands against an archived room", () => {
    expect(deniedCode(authorizePlatform(player, { ...room, status: "archived" }, command))).toBe(
      "ROOM_ARCHIVED",
    );
  });

  it("denies a template version mismatch", () => {
    expect(
      deniedCode(authorizePlatform(player, room, { ...command, templateVersion: "0.9.0" })),
    ).toBe("TEMPLATE_VERSION_MISMATCH");
  });

  it("denies a template id mismatch", () => {
    expect(
      deniedCode(authorizePlatform(player, room, { ...command, templateId: "other-template" })),
    ).toBe("TEMPLATE_VERSION_MISMATCH");
  });

  it("denies the table seat from issuing a game command", () => {
    const table: PlatformMember = { memberId: "member-table", capability: "table" };
    expect(deniedCode(authorizePlatform(table, room, command))).toBe("ROLE_FORBIDDEN");
  });

  it("allows the gm capability", () => {
    const gm: PlatformMember = { memberId: "member-gm", capability: "gm" };
    expect(authorizePlatform(gm, room, command)).toEqual({ allowed: true });
  });

  it("denies an oversized payload", () => {
    const oversized: PlatformCommand = {
      ...command,
      payload: { blob: "x".repeat(9000) },
    };
    expect(deniedCode(authorizePlatform(player, room, oversized, { maxPayloadBytes: 8192 }))).toBe(
      "PAYLOAD_TOO_LARGE",
    );
  });
});
