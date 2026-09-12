import type { RandomSource } from "@digitable/contracts";

/**
 * Deterministic RandomSource seeded from a string or byte seed. A trusted
 * handler generates one cryptographically random seed per command
 * invocation with `crypto.randomBytes` before entering the Firestore
 * transaction (docs/ARCHITECTURE.md, ADR-002); this module only implements
 * the deterministic generator that seed feeds. Firestore transaction retries
 * reuse the same seed and therefore reproduce the same draws. Tests inject a
 * fixed seed directly.
 *
 * The algorithm (FNV-1a to fold an arbitrary-length seed into 32 bits, then
 * mulberry32 as the stream) is not cryptographically secure and must never
 * be used to *produce* the seed — only to expand one.
 */
export function createSeededRandom(seed: string | Uint8Array): RandomSource {
  let state = fnv1a32(seed);

  function next(): number {
    // mulberry32
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  return {
    rollDie(sides: number): number {
      if (!Number.isInteger(sides) || sides < 1) {
        throw new RangeError(`rollDie requires a positive integer side count, got ${sides}`);
      }
      return 1 + Math.floor(next() * sides);
    },
  };
}

function fnv1a32(seed: string | Uint8Array): number {
  const bytes = typeof seed === "string" ? new TextEncoder().encode(seed) : seed;
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
