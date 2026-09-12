import { describe, expect, it } from "vitest";
import { allow, broadcastEvent, decided, deny, rejected, stableError } from "../src/index.js";

describe("authorization result helpers", () => {
  it("allow() is allowed with no error fields", () => {
    expect(allow()).toEqual({ allowed: true });
  });

  it("deny() carries the stable error", () => {
    const result = deny(stableError("ROLE_FORBIDDEN", "GM only"));
    expect(result).toEqual({ allowed: false, code: "ROLE_FORBIDDEN", message: "GM only" });
  });
});

describe("decision helpers", () => {
  it("decided() wraps events as an ok decision", () => {
    const event = broadcastEvent("evt-1", { type: "Noop" }, [{ kind: "shared" }]);
    const decision = decided([event]);
    expect(decision).toEqual({ ok: true, events: [event] });
  });

  it("rejected() carries the stable error", () => {
    const decision = rejected(stableError("UNKNOWN_ACTION", "no such action"));
    expect(decision).toEqual({ ok: false, code: "UNKNOWN_ACTION", message: "no such action" });
  });

  it("broadcastEvent() copies the same payload to every destination", () => {
    const event = broadcastEvent("evt-2", { type: "Noop" }, [{ kind: "shared" }, { kind: "gm" }]);
    expect(event.effects).toHaveLength(2);
    expect(event.effects.every((effect) => effect.payload === event.event)).toBe(true);
  });
});
