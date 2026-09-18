import { afterEach, describe, expect, it, vi } from "vitest";
import { newUuid } from "../../src/shared/uuid.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("newUuid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses crypto.randomUUID when the page is a secure context", () => {
    vi.stubGlobal("crypto", {
      randomUUID: () => "11111111-2222-4333-8444-555555555555",
      getRandomValues: () => {
        throw new Error("must not be called");
      },
    });
    expect(newUuid()).toBe("11111111-2222-4333-8444-555555555555");
  });

  it("falls back to a valid v4 UUID on a plain-http LAN page where crypto.randomUUID is undefined", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0xff);
        return bytes;
      },
    });
    expect(newUuid()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });

  it("forces the version and variant bits even when every random byte is zero", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        bytes.fill(0);
        return bytes;
      },
    });
    expect(newUuid()).toBe("00000000-0000-4000-8000-000000000000");
  });

  it("fallback output is v4-shaped and unique across many draws", () => {
    let counter = 0;
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => {
        counter += 1;
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = (counter * 31 + i * 7) & 0xff;
        return bytes;
      },
    });
    const seen = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const id = newUuid();
      expect(id).toMatch(UUID_V4);
      seen.add(id);
    }
    expect(seen.size).toBe(200);
  });
});
