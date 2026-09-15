import { describe, expect, it } from "vitest";
import { generateRecoveryCode, hashSecret, verifySecret } from "../src/secretHash.js";

describe("secretHash", () => {
  it("verifies the correct secret against its own hash", async () => {
    const hashed = await hashSecret("correct horse battery staple");
    expect(await verifySecret("correct horse battery staple", hashed)).toBe(true);
  });

  it("rejects an incorrect secret", async () => {
    const hashed = await hashSecret("correct horse battery staple");
    expect(await verifySecret("wrong phrase", hashed)).toBe(false);
  });

  it("never stores the plaintext secret in the hashed record", async () => {
    const secret = "a room passphrase";
    const hashed = await hashSecret(secret);
    expect(hashed.hash).not.toContain(secret);
    expect(hashed.salt).not.toContain(secret);
  });

  it("uses a fresh random salt per call, so two hashes of the same secret differ", async () => {
    const first = await hashSecret("same secret");
    const second = await hashSecret("same secret");
    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });
});

describe("generateRecoveryCode", () => {
  it("produces a 13-character code from the unambiguous alphabet", () => {
    const code = generateRecoveryCode();
    expect(code).toHaveLength(13);
    expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{13}$/);
  });

  it("excludes visually-confusable characters", () => {
    const code = generateRecoveryCode();
    expect(code).not.toMatch(/[01OIL]/);
  });

  it("does not repeat the same code across calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateRecoveryCode()));
    expect(codes.size).toBe(20);
  });
});
