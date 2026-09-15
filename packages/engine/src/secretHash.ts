/**
 * Salted PBKDF2 hashing for room passphrases and recovery codes
 * (docs/ARCHITECTURE.md section 8: "only salted slow hashes are stored on a
 * service-only path"). Built on the Web Crypto `subtle` API rather than
 * Node's `crypto` module so this stays usable from both a future browser
 * caller and any Node-hosted trusted authority without a platform-specific
 * import — `packages/engine` stays framework-independent (AGENTS.md).
 */

const DEFAULT_ITERATIONS = 210_000;
const KEY_LENGTH_BITS = 256;
const SALT_LENGTH_BYTES = 16;

export interface HashedSecret {
  readonly hash: string;
  readonly salt: string;
  readonly iterations: number;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function deriveBits(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH_BITS,
  );
  return new Uint8Array(bits);
}

/** Hashes a new secret (a room passphrase set at creation, a fresh recovery code). */
export async function hashSecret(
  secret: string,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<HashedSecret> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const bits = await deriveBits(secret, salt, iterations);
  return { hash: toHex(bits), salt: toHex(salt), iterations };
}

/** Constant-time verification of a candidate secret against a stored hash. */
export async function verifySecret(secret: string, hashed: HashedSecret): Promise<boolean> {
  const candidate = await deriveBits(secret, fromHex(hashed.salt), hashed.iterations);
  const stored = fromHex(hashed.hash);
  if (candidate.length !== stored.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i += 1) {
    diff |= (candidate[i] ?? 0) ^ (stored[i] ?? 0);
  }
  return diff === 0;
}

/**
 * A 13-character code from this 31-symbol unambiguous alphabet is ~64.4
 * bits of entropy (13 * log2(31)), clearing the >=64-bit floor
 * docs/ARCHITECTURE.md section 8 requires; that section's "32-symbol"
 * phrasing is an illustrative example, not this exact alphabet. Excludes
 * visually-confusable characters (0/O, 1/I/L).
 */
const RECOVERY_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const RECOVERY_CODE_LENGTH = 13;

/** Mints a new plaintext recovery code. Shown once by the caller; never stored as-is. */
export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_CODE_LENGTH));
  let code = "";
  for (const byte of bytes) {
    code += RECOVERY_CODE_ALPHABET[byte % RECOVERY_CODE_ALPHABET.length];
  }
  return code;
}
