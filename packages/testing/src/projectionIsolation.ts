/**
 * Reusable projection-isolation checking. Any template's projections can be
 * checked without this package knowing the template's view shape: walk the
 * projection's JSON value, collect every string leaf, and confirm none of a
 * set of "secret tokens" (values that should be visible to exactly one
 * viewer) leaked into a projection built for a different viewer.
 *
 * This is the generic half of docs/ARCHITECTURE.md's requirement that "one
 * member projection never contains another member's private state" — the
 * template-specific half is choosing secret tokens that actually appear in
 * hidden fields, which lives in the template's own tests.
 */
export function collectStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, acc);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, acc);
  }
  return acc;
}

/** Returns the subset of `secrets` that appear (as a substring of some string leaf) in `view`. */
export function findLeakedSecrets(view: unknown, secrets: readonly string[]): string[] {
  if (secrets.length === 0) {
    return [];
  }
  const strings = collectStrings(view);
  return secrets.filter((secret) => strings.some((candidate) => candidate.includes(secret)));
}
