/**
 * Byte-size measurement used to enforce the working budgets in
 * docs/ARCHITECTURE.md section 7-8. This measures the UTF-8 encoded size of
 * the JSON representation, which is what actually crosses the wire and what
 * counts against Firestore document limits.
 */
export function jsonByteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
}

const KIB = 1024;

/** Firestore hard document ceiling. Never exceed this for any single document. */
export const FIRESTORE_DOCUMENT_CEILING_BYTES = 1 * 1024 * KIB;

/**
 * Working budget for `authority/current`, well under the Firestore ceiling,
 * leaving headroom for revision/version metadata growth (docs/ARCHITECTURE.md
 * section 8).
 */
export const AUTHORITY_WORKING_BUDGET_BYTES = 256 * KIB;

/**
 * Per-viewer projection ceiling. Chosen so a worst-case command touching
 * eight participants plus GM and table rewrites under 640 KiB in one
 * transaction (docs/ARCHITECTURE.md section 7).
 */
export const PROJECTION_CEILING_BYTES = 64 * KIB;
